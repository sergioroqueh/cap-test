from pathlib import Path
from collections import Counter
import json
root=Path(__file__).resolve().parents[1]
out=root/'public/data/exams'
ix=json.loads((out/'index.json').read_text())
cases=json.loads((root/'data-src/cap-exams/technical_review_r30.json').read_text())['cases']
byid={(c['examId'],c['number']):c for c in cases}
assert len(byid)==87 and Counter(c['action'] for c in cases)=={'note':64,'confirmed':23}
seen=set()
for e in ix['exams']:
    for q in json.loads((out/'questions'/f"{e['id']}.json").read_text()):
        k=(e['id'],q['number'])
        if k not in byid:continue
        c=byid[k];d=q.get('technicalDecision')
        assert q['originalSheetAnswer']==c['historicalAnswer']
        assert q['correctAnswer']==c['technicalAnswer']==c['previousAppliedAnswer']
        if c['action']=='confirmed':assert d is None
        else:assert d['round']=='R30' and d['technicalAnswer']==q['correctAnswer']
        seen.add(k)
assert seen==set(byid)
assert ix['technicalR30Stats']==ix['technicalR29Stats']
print('PASS R30: 87 reviewed occurrences; no change to historical or technical grading')
