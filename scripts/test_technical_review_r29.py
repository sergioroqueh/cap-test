from pathlib import Path
import json
from collections import Counter
root=Path(__file__).resolve().parents[1]
out=root/'public/data/exams'
ix=json.loads((out/'index.json').read_text())
proof=json.loads((root/'data-src/cap-exams/technical_review_r29.json').read_text())
queue=json.loads((out/'technical_review_r28_queue.json').read_text())
cases={(c['examId'],c['number']):c for c in proof['cases']}
assert len(cases)==len(queue)==62 and set(cases)=={(c['examId'],c['number']) for c in queue}
seen={}
for e in ix['exams']:
    rows=json.loads((out/'questions'/f"{e['id']}.json").read_text())
    for q in rows:
        k=(e['id'],q['number'])
        if k not in cases:continue
        c=cases[k]; d=q.get('technicalDecision')
        assert q['originalSheetAnswer']==c['historicalAnswer'] and q['correctAnswer']==c['previousAppliedAnswer']
        assert q['question']==c['question'] and q['options']==c['options']
        if c['action']=='confirmed':assert d is None
        else:assert d['round']=='R29' and d['technicalAnswer']==c['technicalAnswer']
        seen[k]=c
    assert e['technicalReadyCount']==e['readyCount']-sum(q.get('technicalDecision',{}).get('action')=='exclude' for q in rows)
assert len(seen)==62 and Counter(c['action'] for c in seen.values())=={'exclude':6,'note':20,'confirmed':36}
assert {k for k,c in seen.items() if c['action']=='exclude'}=={('2024-04-06-mercancias-global',6),('2025-07-26-mercancias-a',5),('2025-07-26-mercancias-a',6),('2023-06-03-mercancias-global',39),('2023-09-23-mercancias-global',41),('2026-09-26-mercancias-a',60)}
assert ix['mercanciasTemplateStats']['scorableAppearances']==2397
assert ix['technicalR28Stats']['scorableAppearances']==2388
assert ix['technicalR29Stats']['scorableAppearances']==2382
print('PASS R29: 62 individually scoped decisions; six exclusions; original and previously applied letters preserved')
