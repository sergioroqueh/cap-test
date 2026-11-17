"""C23: source-specific evidence, stable tie-break and no R32 ledger rewrite."""
import json
from pathlib import Path
from hashlib import sha256
from build_exam_data import norm, fingerprint, select_frequency_bank_match
root=Path(__file__).resolve().parents[1]
bankdir=root/'public/data/questions'
examsdir=root/'public/data/exams/questions'
assert bankdir.is_dir() and examsdir.is_dir()
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def cases(question):
    result=[]
    for p in sorted(bankdir.glob('*.json')):
        result.extend(x for x in read(p) if norm(x['question'])==norm(question))
    return result
expected=[
 ('2024-04-06-mercancias-global',24),
 ('2025-07-26-mercancias-a',20),
 ('2025-07-26-mercancias-b',23)
]
for name,n in expected:
    row=next(q for q in read(examsdir/(name+'.json')) if q['number']==n)
    candidates=cases(row['question'])
    assert {x['code'] for x in candidates}=={'63040','64829'}
    ids=[select_frequency_bank_match(row,seq)['code'] for seq in
         [candidates,list(reversed(candidates)),sorted(candidates,key=lambda c:str(c['id']))]]
    assert ids==['63040']*3,(name,n,ids)
    assert row['frequencyGroup']=='b:63040',(name,n,row['frequencyGroup'])
    assert row['examFrequency']==3,(name,n,row['examFrequency'])
    print('C23 DETERMINISTIC MATCH',name,n,'code=63040 count=3',
          'sourceOptionsSha='+sha256(fingerprint(row).encode()).hexdigest()[:16])
# Keep R32 evidence and its historical decisions byte-identical.
proof=root/'data-src/cap-exams/technical_review_r32.json'
ledger=read(proof)
assert len(ledger['cases'])==128
assert ledger['counts']=={'confirmed':80,'note':36,'pending':11,'exclude':1}
print('C23 R32 original staged ledger preserved SHA256='+sha256(proof.read_bytes()).hexdigest())
