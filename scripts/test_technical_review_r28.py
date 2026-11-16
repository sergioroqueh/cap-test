from pathlib import Path
import json
from collections import Counter
root=Path(__file__).resolve().parents[1]
out=root/'public/data/exams'
ix=json.loads((out/'index.json').read_text())
cases=json.loads((root/'data-src/cap-exams/technical_review_r28.json').read_text())['cases']
keys=json.loads((root/'data-src/cap-exams/answer_keys_visually_verified.json').read_text())['exams']
seen={}
for e in ix['exams']:
    rows=json.loads((out/'questions'/f"{e['id']}.json").read_text())
    for q in rows:
        d=q.get('technicalDecision')
        if d and d.get('round')=='R28':
            assert q['correctAnswer']==q['originalSheetAnswer']==keys[e['id']]['correctAnswers'][q['number']-1]==d['historicalAnswer']
            assert d['technicalAnswer']==(None if d['action']=='exclude' else d['historicalAnswer'])
            seen[(e['id'],q['number'])]=d
    assert e['technicalReadyCount']==e['readyCount']-sum(q.get('technicalDecision',{}).get('action')=='exclude' for q in rows)
assert set(seen)=={(c['examId'],c['number']) for c in cases}
assert Counter(d['action'] for d in seen.values())=={'note':22,'exclude':3}
assert {k for k,d in seen.items() if d['action']=='exclude'}=={('2025-09-27-mercancias-global',76),('2026-02-07-mercancias-global',42),('2025-07-26-mercancias-a',26)}
assert ix['mercanciasTemplateStats']['scorableAppearances']==2397
assert ix['technicalR27Stats']['scorableAppearances']==2391
assert ix['technicalR28Stats']['scorableAppearances']==2388
queue=json.loads((out/'technical_review_r28_queue.json').read_text())
assert all(q['approved'] is False and (q['examId'],q['number']) not in seen for q in queue)
print('PASS R28: 25 explicit target decisions, 3 exclusions, untouched historical keys and advisory queue')
