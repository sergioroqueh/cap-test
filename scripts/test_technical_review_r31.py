from pathlib import Path
from collections import Counter
import json
root=Path(__file__).resolve().parents[1]
out=root/'public/data/exams'
ix=json.loads((out/'index.json').read_text())
cases=json.loads((root/'data-src/cap-exams/technical_review_r31.json').read_text())['cases']
byid={(c['examId'],c['number']):c for c in cases}
assert len(byid)==178 and Counter(c['action'] for c in cases)=={"note":61,"confirmed":117}
seen=set()
for e in ix['exams']:
    for q in json.loads((out/'questions'/f"{e['id']}.json").read_text()):
        k=(e['id'],q['number'])
        if k not in byid:continue
        c=byid[k];d=q.get('technicalDecision')
        assert q['originalSheetAnswer']==c['historicalAnswer']
        assert q['correctAnswer']==c['technicalAnswer']==c['previousAppliedAnswer']
        if c['action']=='confirmed':
            assert d is None
            assert q.get('answerSourceReview') == {
                'round': c['round'], 'status': 'confirmed',
                'reason': c['reason'], 'sources': c['sources']
            }
        else:
            assert q.get('answerSourceReview') is None
            assert d['round']=='R31' and d['technicalAnswer']==q['correctAnswer']
        if c.get('restoredOptions'):
            assert k==('2023-12-02-mercancias-global',57)
            assert d['restoredOptions']==c['restoredOptions'] and q['options']==c['options'] and d['technicalAnswer']=='C'
        seen.add(k)
assert seen==set(byid)
assert ix['technicalR31Stats']==ix['technicalR30Stats']
print('PASS R31: 178 reviewed occurrences; no change to historical or technical grading')
