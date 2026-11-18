"""R32 staged ledger: validate exact occurrence-level evidence, never change grades."""
from pathlib import Path
from collections import Counter
from hashlib import sha256, sha1
import json,csv,re,unicodedata

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/exams'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
proof_path=ROOT/'data-src/cap-exams/technical_review_r32.json'
reconciliation=read(ROOT/'data-src/cap-exams/r32_frequency_reconciliation_v1.json')
proof=read(proof_path)
queue=read(OUT/'technical_review_r32_candidates.json')

def norm(text):
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', ''.join(
        c for c in unicodedata.normalize('NFKD', str(text).lower())
        if not unicodedata.combining(c)
    )).split())

def variant_signature(q):
    return norm(q['question'])+'||'+'||'.join(sorted(norm(t) for t in q['options'].values()))

# Independently pin the immutable R32 ledger. A new version requires a new
# reconciliation; the historical evidence must never be rewritten to pass CI.
raw_proof=proof_path.read_bytes()
git_blob_sha=sha1(b'blob '+str(len(raw_proof)).encode()+bytes([0])+raw_proof).hexdigest()
assert git_blob_sha==reconciliation['frozen']['ledgerGitBlobSha']=='fd8fa3c1113dab8c495282f1982dc627a05e584c'
assert reconciliation['schemaVersion']==1 and reconciliation['round']=='R33'
assert reconciliation['status']=='explicit_historical_metadata_reconciliation'
assert reconciliation['frozen']['selectionRun']==43899580500
assert reconciliation['frozen']['baselineCommit']=='35b56bf5a7ad65c218126db05973460091a4112d'
assert reconciliation['observed']['generationRun']==44345161433
assert reconciliation['observed']['commit']=='9c19f1c05dbf7bd1805691d4a62128791a15b8da'
assert reconciliation['expected']=={
    'occurrences':128,'groups':92,'changes':35,
    'ordinalOnly':32,'frequencyChanges':3,'scoringChanges':0
}
# These 35 rows are the whole permitted exception set, keyed by real
# occurrence ID (not an unstable R32 ordinal group number).
exceptions={(e['examId'],e['number']):e for e in reconciliation['changes']}
assert len(exceptions)==len(reconciliation['changes'])==35
semantic_cases={
    ('2024-04-06-mercancias-global',24):(2,3),
    ('2025-07-26-mercancias-a',20):(1,3),
    ('2025-07-26-mercancias-b',23):(2,3)
}
assert {k for k,e in exceptions.items() if e['reason']!='ordinal_reordering_only'}==set(semantic_cases)

assert queue['groups']==92 and queue['occurrences']==128
assert len(queue['selected'])==92
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
resolved=set()
ordinal_only=frequency_changes=0
for c in cases:
    k=(c['examId'],c['number'])
    assert k not in seen
    seen.add(k)
    g,old=targets[k]
    frozen={'group':c['group'],'frequency':c['frequency'],'examFrequency':c['examFrequency']}
    generated={'group':g['group'],'frequency':g['frequency'],'examFrequency':old['examFrequency']}
    e=exceptions.get(k)
    if e:
        assert e['sourcePage']==c['sourcePage'],k
        assert e['variantSignature']==variant_signature(c)==variant_signature(old),k
        assert set(e)=={'examId','number','sourcePage','variantSignature','from','to','reason'},k
        assert set(e['from'])==set(e['to'])=={'group','frequency','examFrequency'},k
        assert e['from']==frozen and e['to']==generated,k
        assert e['from']!=e['to'],k
        changed={f for f in frozen if frozen[f]!=generated[f]}
        if e['reason']=='ordinal_reordering_only':
            assert changed=={'group'},k
            ordinal_only+=1
        else:
            assert k in semantic_cases and changed=={'group','frequency','examFrequency'},k
            assert (frozen['examFrequency'],generated['examFrequency'])==semantic_cases[k],k
            assert norm(old['options'][old['correctAnswer']])=='fnd',k
            frequency_changes+=1
        resolved.add(k)
    else:
        assert frozen==generated,k
    assert all(c[x]==v for x,v in old.items() if x!='examFrequency'),k
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
assert resolved==set(exceptions)
assert (ordinal_only,frequency_changes)==(32,3)
assert len({variant_signature(q) for g in queue['selected'] for q in g['rows']})==92
fnd_rows=[rows[k] for k in semantic_cases]
assert len({q['examId'] for q in fnd_rows})==3
assert len({q['examId'][:10] for q in fnd_rows})==2
assert len({variant_signature(q) for q in fnd_rows})==3
assert {q['frequencyGroup'] for q in fnd_rows}=={'b:63040'}
assert {q['examFrequency'] for q in fnd_rows}=={3}
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
print('R33 R32 RECONCILIATION PASS '+json.dumps({
    'cases':len(cases),'groups':len(queue['selected']),
    'approvedMetadataExceptions':len(resolved),
    'ordinalOnly':ordinal_only,'frequencyChanges':frequency_changes,
    'actions':dict(counts),'applied':0,'unchangedScorable':2382,
    'frozenLedgerGitBlobSha':git_blob_sha
},ensure_ascii=False))
