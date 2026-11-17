"""C23 investigation only: examine bank matching and R32 frequency drift.
No corpus, generated exam JSON, scoring or R32 ledger is modified.
"""
from collections import Counter, defaultdict
from hashlib import sha256
from pathlib import Path
import json, re, unicodedata

root=Path(__file__).resolve().parents[1]
data=root/'public/data'
exam_dir=data/'exams'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def norm(s):
    s=unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().lower()
    return ' '.join(re.sub(r'[^a-z0-9]+',' ',s).split())
def fp(q):return norm(q['question'])+'||'+'||'.join(sorted(norm(s) for s in q['options'].values()))

bank_by_fp=defaultdict(list)
bank_by_stem=defaultdict(list)
for path in sorted((data/'questions').glob('*.json')):
    for row in read(path):
        bank_by_fp[fp(row)].append((row['code'],row['id'],path.name))
        bank_by_stem[norm(row['question'])].append((row['code'],fp(row),row['id'],path.name))
ix=read(exam_dir/'index.json')
exams=[q for e in ix['exams'] for q in read(exam_dir/'questions'/f"{e['id']}.json") if e.get('category')=='mercancias']
by_group=defaultdict(list)
by_fp=defaultdict(set)
for q in exams:
    by_group[q['frequencyGroup']].append((q['examId'],q['number']))
    by_fp[fp(q)].add(q['examId'])
targets=[
 ('2024-04-06-mercancias-global',24,2),
 ('2025-07-26-mercancias-b',23,2),
 ('2025-07-26-mercancias-a',20,1)
]
for exam,n,expected in targets:
    row=next(q for q in exams if q['examId']==exam and q['number']==n)
    exact=bank_by_fp[fp(row)]
    same_stem=bank_by_stem[norm(row['question'])]
    output={
      'exam':exam,'question':n,'expectedFrozenFrequency':expected,
      'currentFrequency':row['examFrequency'],
      'actualExactTextOptionsFrequency':len(by_fp[fp(row)]),
      'frequencyGroup':row['frequencyGroup'],
      'matchMethod':row['matchMethod'],
      'normQuestion':norm(row['question'])[:190],
      'fpSha':sha256(fp(row).encode()).hexdigest()[:18],
      'groupOccurrences':by_group[row['frequencyGroup']],
      'exactBankCodes':sorted(set(x[0] for x in exact)),
      'sameStemBankCodes':sorted(set(x[0] for x in same_stem)),
      'sameStemDistinctFingerprints':len(set(x[1] for x in same_stem)),
      'examOptions':sorted(norm(s) for s in row['options'].values()),
      'bankCandidates':[
        {'code':candidate['code'],'correctAnswer':candidate['correctAnswer'],
         'options':sorted(norm(s) for s in candidate['options'].values()),
         'overlap':len(set(norm(s) for s in row['options'].values()) & set(norm(s) for s in candidate['options'].values()))}
        for candidate in [q for p in sorted((data/'questions').glob('*.json')) for q in read(p)
                          if norm(q['question'])==norm(row['question'])]
      ]
    }
    print('C23 R32 DIAGNOSTIC '+json.dumps(output,ensure_ascii=False,separators=(',',':')))
print('C23 R32 DIAGNOSTIC SUMMARY '+json.dumps({'bankFingerprintAmbiguities':sum(len(set(x[0] for x in v))>1 for v in bank_by_fp.values()),'bankStemsWithMultipleFingerprints':sum(len(set(x[1] for x in v))>1 for v in bank_by_stem.values())},ensure_ascii=False))
