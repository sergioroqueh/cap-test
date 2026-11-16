"""R27: annotate generated historical rows, leaving every historical key untouched."""
import json, re, unicodedata, csv
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/exams'
src=json.loads((ROOT/'data-src/cap-exams/technical_review_r27.json').read_text())
index=json.loads((OUT/'index.json').read_text())
def norm(s):
    return re.sub(r'[^a-z0-9]','', ''.join(c for c in unicodedata.normalize('NFD',s.lower().replace('I','l')) if not unicodedata.combining(c)))
cases={(c['examId'],c['number']):c for c in src['cases']}
assert len(cases)==21 and Counter(c['action'] for c in cases.values())=={'correct':2,'exclude':6,'note':13}
seen=set()
all_rows=[]
for e in index['exams']:
    path=OUT/'questions'/f"{e['id']}.json"
    rows=json.loads(path.read_text())
    for q in rows:
        k=(e['id'],q['number'])
        c=cases.get(k)
        if c:
            assert q['sourcePage']==c['sourcePage'] and norm(c['questionFragment']) in norm(q['question']),k
            assert q['originalSheetAnswer']==q['correctAnswer']==c['historicalAnswer'],k
            assert len(c['sources'])>=1 and all(s.startswith('https://') for s in c['sources'])
            assert c['technicalAnswer'] in (None,'A','B','C','D')
            assert (c['technicalAnswer'] is None)==(c['action']=='exclude')
            assert (c['technicalAnswer']!=c['historicalAnswer'])==(c['action']!='note')
            q['technicalDecision']=c
            seen.add(k)
    if any(q.get('technicalDecision') for q in rows):
        path.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    e['technicalReadyCount']=sum(q['correctAnswer'] is not None and q.get('technicalDecision',{}).get('action')!='exclude' for q in rows)
    if e['category']=='mercancias' and e['hasOriginalAnswerSheet']:
        all_rows.extend(rows)
assert seen==set(cases)
def unique(rows):
    ids=set(); texts=set()
    for q in rows:
        i=q['canonicalQuestionId'] or q['id']
        t=re.sub(r'[¿?¡!.,;:()\[\]{}]','',re.sub(r'\s+',' ',unicodedata.normalize('NFKC',q['question']).lower())).strip()
        if i in ids or t in texts:continue
        ids.add(i);texts.add(t)
    return len(ids)
eligible=[q for q in all_rows if q['correctAnswer'] is not None and q.get('technicalDecision',{}).get('action')!='exclude']
assert len(all_rows)==2400 and len(eligible)==2391
index['technicalR27Stats']={**index['mercanciasTemplateStats'],'scorableAppearances':len(eligible),'uniqueScorableQuestions':unique(eligible)}
index['version']='2026-11-16-r27'
(OUT/'index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2))
(OUT/'technical_review_r27.json').write_text(json.dumps(src,ensure_ascii=False,indent=2))
with (OUT/'technical_review_r27.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(src['cases'][0]));w.writeheader()
    for c in src['cases']:w.writerow({**c,'sources':' | '.join(c['sources'])})
# Compare all 21 cases to other keyed models. Normalized exact question and
# all four option texts (order independent); OCR i/l collapse only for candidates.
# No matches are promoted to corrections automatically.
def keytext(s,ocr=False):
    t=norm(s)
    return t.replace('l','i') if ocr else t
def signature(q,ocr=False):
    return keytext(q['question'],ocr),tuple(sorted(keytext(x,ocr) for x in q['options'].values()))
cross=[]
for c in src['cases']:
    target=next(q for q in all_rows if (q['examId'],q['number'])==(c['examId'],c['number']))
    matches=[]
    for other in all_rows:
        if target['examId']==other['examId'] or not other.get('mappedSheetAnswer') or not other.get('correctAnswer'):
            continue
        exact=signature(target)==signature(other)
        approx=signature(target,True)==signature(other,True)
        if not (exact or approx):continue
        answer=other['mappedSheetAnswer']
        opts=[a for a,t in target['options'].items() if keytext(t,not exact)==keytext(other['options'][answer],not exact)]
        if len(opts)!=1:continue
        matches.append({'examId':other['examId'],'number':other['number'],'sourcePage':other['sourcePage'],'printed':other.get('originalSheetAnswer'),'mapped':answer,'answerInTarget':opts[0],'match':'exact' if exact else 'OCR_candidate'})
    cross.append({'examId':c['examId'],'number':c['number'],'historicalAnswer':c['historicalAnswer'],'technicalAnswer':c['technicalAnswer'],'matches':matches})
(OUT/'technical_review_r27_cross_model.json').write_text(json.dumps(cross,ensure_ascii=False,indent=2))
print('R27 cross-model: '+json.dumps([{'id':x['examId'],'n':x['number'],'matches':x['matches']} for x in cross],ensure_ascii=False))
print('R27 PASS: 21 decisions, 2 corrected, 6 excluded, 13 notes; historical keys untouched; technical stats',index['technicalR27Stats'])
