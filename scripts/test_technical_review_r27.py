"""R27 regressions: historical source remains exact; technical layer is separate."""
import json
from pathlib import Path
from collections import Counter
root=Path(__file__).resolve().parents[1]
out=root/'public/data/exams'
index=json.loads((out/'index.json').read_text())
proof=json.loads((root/'data-src/cap-exams/technical_review_r27.json').read_text())
keys=json.loads((root/'data-src/cap-exams/answer_keys_visually_verified.json').read_text())['exams']
seen={}
for e in index['exams']:
    rows=json.loads((out/'questions'/f"{e['id']}.json").read_text())
    assert len(rows)==100
    for q in rows:
        if d:=q.get('technicalDecision'):
            assert (d['examId'],d['number'])==(e['id'],q['number'])
            assert q['originalSheetAnswer']==q['correctAnswer']==keys[e['id']]['correctAnswers'][q['number']-1]==d['historicalAnswer']
            seen[(e['id'],q['number'])]=d
    assert e['technicalReadyCount']==e['readyCount']-sum(q.get('technicalDecision',{}).get('action')=='exclude' for q in rows)
assert len(seen)==21 and list(seen.values()) and Counter(c['action'] for c in seen.values())=={'correct':2,'exclude':6,'note':13}
assert seen=={(c['examId'],c['number']):c for c in proof['cases']}
d='2023-12-02-mercancias-global'
j='2025-07-26-mercancias-b'
assert {k for k,v in seen.items() if v['action']=='correct'}=={(d,2),(d,3)}
assert all(seen[(d,n)]['technicalAnswer']=='C' for n in (2,3))
assert {k for k,v in seen.items() if v['action']=='exclude'}=={(d,45),(d,53),(d,81),(j,7),(j,22),(j,78)}
assert index['mercanciasTemplateStats']['scorableAppearances']==2397
assert index['technicalR27Stats']['scorableAppearances']==2391
assert all(e['technicalReadyCount']==97 and e['readyCount']==100 for e in index['exams'] if e['id'] in (d,j))
print('PASS R27: 21 traceable decisions; 2 corrections, 6 exclusions, no historical key changes')
