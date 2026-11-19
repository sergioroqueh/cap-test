"""R29: resolve every frozen R28 candidate without touching historical scoring."""
from pathlib import Path
from collections import Counter
import json, re, unicodedata, csv
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/exams'
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,d): p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
ix=read(OUT/'index.json')
proof=read(ROOT/'data-src/cap-exams/technical_review_r29.json')
queue=read(OUT/'technical_review_r28_queue.json')
cases=proof['cases']
assert len(queue)==len(cases)==62
assert Counter(c['action'] for c in cases)=={'exclude':6,'note':20,'confirmed':36}
def unique(rows):
    ids=set(); texts=set()
    for q in rows:
        i=q['canonicalQuestionId'] or q['id']
        t=re.sub(r'[¿?¡!.,;:()\[\]{}]','',re.sub(r'\s+',' ',unicodedata.normalize('NFKC',q['question']).lower())).strip()
        if i in ids or t in texts:continue
        ids.add(i);texts.add(t)
    return len(ids)
rows_by_exam={e['id']:read(OUT/'questions'/f"{e['id']}.json") for e in ix['exams']}
byid={(q['examId'],q['number']):q for rr in rows_by_exam.values() for q in rr}
seen=set(); changed=set(); decision_models=set()
for old,c in zip(queue,cases):
    k=(c['examId'],c['number'])
    assert k not in seen and not old['approved'] and c['approved']
    assert all(c[key]==old[key] for key in old if key!='approved'),k
    q=byid[k]
    assert all(q[key]==c[key] for key in ('examId','number','sourcePage','question','options','originalSheetAnswer','correctAnswer','bankAnswer')),k
    assert q['correctAnswer']==c['previousAppliedAnswer'] and q['originalSheetAnswer']==c['historicalAnswer'],k
    assert not q.get('technicalDecision') and c['reason'] and len(c['sources']) and all(s.startswith('https://') for s in c['sources'])
    assert (c['technicalAnswer'] is None)==(c['action']=='exclude')
    if c['action']!='exclude':assert c['technicalAnswer']==q['correctAnswer']
    if c['historicalAnswer']!=c['previousAppliedAnswer']:
        assert k in {('2023-07-29-mercancias-a',44),('2023-07-29-mercancias-a',49)}
        assert c['action']=='note'
    if c['action']!='confirmed':
        q['technicalDecision']={key:c[key] for key in ('examId','number','sourcePage','round','historicalAnswer','previousAppliedAnswer','technicalAnswer','action','reason','sources')}
        changed.add(c['examId'])
        decision_models.add(c['examId'])
    else:
        # Read-only citation: no change to letter, grading or editorial decision.
        q['answerSourceReview']={'round':c['round'],'status':'confirmed','reason':c['reason'],'sources':c['sources']}
        changed.add(c['examId'])
    seen.add(k)
all_rows=[]
for e in ix['exams']:
    rr=rows_by_exam[e['id']]
    if e['id'] in changed:write(OUT/'questions'/f"{e['id']}.json",rr)
    e['technicalReadyCount']=sum(q['correctAnswer'] is not None and q.get('technicalDecision',{}).get('action')!='exclude' for q in rr)
    if e['category']=='mercancias' and e['hasOriginalAnswerSheet']:all_rows.extend(rr)
eligible=[q for q in all_rows if q['correctAnswer'] is not None and q.get('technicalDecision',{}).get('action')!='exclude']
assert len(all_rows)==2400 and len(eligible)==2382
ix['technicalR29Stats']={**ix['mercanciasTemplateStats'],'scorableAppearances':len(eligible),'uniqueScorableQuestions':unique(eligible)}
ix['version']='2026-11-16-r29'
write(OUT/'index.json',ix)
write(OUT/'technical_review_r29.json',proof)
with (OUT/'technical_review_r29.csv').open('w',encoding='utf-8-sig',newline='') as f:
    fields=['queuePosition','examId','number','sourcePage','question','options','historicalAnswer','previousAppliedAnswer','technicalAnswer','action','reason','sources']
    w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
    for c in cases:w.writerow({**c,'options':json.dumps(c['options'],ensure_ascii=False),'sources':' | '.join(c['sources'])})
print('R29 PASS '+json.dumps({'actions':dict(Counter(c['action'] for c in cases)),'models':len(decision_models),'stats':ix['technicalR29Stats']},ensure_ascii=False))
