"""R32 staged ledger: validate exact occurrence-level evidence, never change grades."""
from pathlib import Path
from collections import Counter
from hashlib import sha256
import json,csv

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/exams'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
proof=read(ROOT/'data-src/cap-exams/technical_review_r32.json')
queue=read(OUT/'technical_review_r32_candidates.json')
assert queue['groups']==92 and queue['occurrences']==128
assert proof['selectionRun']==43899580500
assert proof['baselineCommit']==queue['baselineCommit']
cases=proof['cases']
targets={(q['examId'],q['number']):(g,q) for g in queue['selected'] for q in g['rows']}
assert len(targets)==len(cases)==128
prior=set()
for n in range(27,32):
    for c in read(ROOT/f'data-src/cap-exams/technical_review_r{n}.json')['cases']:
        k=(c['examId'],c['number'])
        assert k not in prior
        prior.add(k)
assert len(prior)==373 and not set(targets)&prior
counts=Counter(c['action'] for c in cases)
assert dict(counts)==proof['counts']=={'confirmed':80,'note':36,'pending':11,'exclude':1}
ix=read(OUT/'index.json')
paths=[OUT/'index.json',*(OUT/'questions'/f"{e['id']}.json" for e in ix['exams'])]
before={p:sha256(p.read_bytes()).hexdigest() for p in paths}
rows={(q['examId'],q['number']):q for p in paths[1:] for q in read(p)}
seen=set()
for c in cases:
    k=(c['examId'],c['number'])
    assert k not in seen
    seen.add(k)
    g,old=targets[k]
    assert c['group']==g['group'] and c['frequency']==g['frequency']
    assert all(c[x]==v for x,v in old.items()), k
    q=rows[k]
    assert all(q[x]==old[x] for x in old if x!='topicCandidates'),k
    assert c['historicalAnswer']==q['originalSheetAnswer']
    assert c['previousAppliedAnswer']==q['correctAnswer']
    assert not q.get('technicalDecision'),k
    assert c['examDate']==c['examId'][:10]
    assert c['applicationStatus']=='staged_not_applied'
    assert c['visualStatus']=='not_individually_verified'
    assert c['reason']
    if c['action'] in ('confirmed','note'):
        assert c['technicalAnswer']==q['correctAnswer']
    else:
        assert c['technicalAnswer'] is None
    if c['action']!='pending':
        assert c['sources'] and all(s.startswith('https://') for s in c['sources'])
assert seen==set(targets)
assert {(c['examId'],c['number']) for c in cases if c['action']=='exclude'}=={('2023-06-03-mercancias-global',24)}
assert ix['technicalR31Stats']['scorableAppearances']==2382
assert ix['technicalR31Stats']['uniqueScorableQuestions']==1336
assert before=={p:sha256(p.read_bytes()).hexdigest() for p in paths}
(OUT/'technical_review_r32.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8')
with (OUT/'technical_review_r32.csv').open('w',encoding='utf-8-sig',newline='') as f:
    fields=['group','examId','number','sourcePage','examDate','question','options','historicalAnswer','previousAppliedAnswer','technicalAnswer','action','reason','sources','applicationStatus','visualStatus']
    w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore')
    w.writeheader()
    for c in cases:
        w.writerow({**c,'options':json.dumps(c['options'],ensure_ascii=False),'sources':' | '.join(c['sources'])})
print('R32 STAGED PASS '+json.dumps({'cases':len(cases),'groups':len(queue['selected']),'actions':dict(counts),'applied':0,'unchangedScorable':2382},ensure_ascii=False))
