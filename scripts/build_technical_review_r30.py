"""R30: compare frozen selection with explicit editorial decisions; no scoring changes."""
from pathlib import Path
from collections import Counter
import json,csv
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/exams'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
ix=read(OUT/'index.json')
proof=read(ROOT/'data-src/cap-exams/technical_review_r30.json')
queue=read(OUT/'technical_review_r30_candidates.json')
cases=proof['cases']
targets={(q['examId'],q['number']):(g,q) for g in queue['selected'] for q in g['rows']}
assert len(targets)==len(cases)==87 and len(queue['selected'])==16
assert Counter(c['action'] for c in cases)=={'note':64,'confirmed':23}
seen=set(); changed=0
for e in ix['exams']:
    path=OUT/'questions'/f"{e['id']}.json"
    rows=read(path)
    affected=False
    for q in rows:
        k=(e['id'],q['number'])
        if k not in targets:continue
        c=next(c for c in cases if (c['examId'],c['number'])==k)
        g,old=targets[k]
        assert k not in seen and c['group']==g['group']
        assert all(c[key]==old[key]==q[key] for key in old),k
        assert not q.get('technicalDecision') and q['originalSheetAnswer']==c['historicalAnswer']
        assert q['correctAnswer']==c['technicalAnswer']==c['previousAppliedAnswer']
        assert c['reason'] and c['sources'] and all(s.startswith('https://') for s in c['sources'])
        if c['action']=='note':
            q['technicalDecision']={key:c[key] for key in ('examId','number','sourcePage','round','historicalAnswer','previousAppliedAnswer','technicalAnswer','action','reason','sources')}
            affected=True
        else:
            assert c['action']=='confirmed'
            q['answerSourceReview']={'round':c['round'],'status':'confirmed','reason':c['reason'],'sources':c['sources']}
            affected=True
        seen.add(k)
    if affected:write(path,rows);changed+=1
    assert e['technicalReadyCount']==sum(q['correctAnswer'] is not None and q.get('technicalDecision',{}).get('action')!='exclude' for q in rows)
assert seen==set(targets)
ix['technicalR30Stats']=dict(ix['technicalR29Stats'])
ix['version']='2026-11-16-r30'
write(OUT/'index.json',ix)
write(OUT/'technical_review_r30.json',proof)
with (OUT/'technical_review_r30.csv').open('w',encoding='utf-8-sig',newline='') as f:
    fields=['group','frequency','examId','number','sourcePage','question','options','historicalAnswer','previousAppliedAnswer','technicalAnswer','action','reason','sources']
    w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
    for c in cases:w.writerow({**c,'options':json.dumps(c['options'],ensure_ascii=False),'sources':' | '.join(c['sources'])})
print('R30 PASS '+json.dumps({'groups':16,'cases':len(cases),'actions':dict(Counter(c['action'] for c in cases)),'modelsWithNotes':changed,'stats':ix['technicalR30Stats']},ensure_ascii=False))
