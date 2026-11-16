"""R26 preflight: audit new user-supplied answer sheets against unchanged baseline."""
import json, re, unicodedata, hashlib, csv
from collections import Counter, defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/exams'
proof=json.loads((ROOT/'data-src/cap-exams/r26_candidate_sheets_2026_11_16.json').read_text())['exams']
index=json.loads((OUT/'index.json').read_text())
assert index['totalImportedQuestions']==2600
assert index['mercanciasTemplateStats']['templateExamModels']==22
rows={e['id']:json.loads((OUT/'questions'/f"{e['id']}.json").read_text()) for e in index['exams']}
def norm(s):
    return re.sub(r'[^a-z0-9]', '', ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if not unicodedata.combining(c)))
lookup=defaultdict(list)
for eid,arr in rows.items():
    if eid in proof: continue
    for q in arr:
        if q['category']=='mercancias' and q.get('correctAnswer') in ('A','B','C','D') and q.get('originalSheetAnswer') in ('A','B','C','D'):
            lookup[(norm(q['question']),tuple(sorted(norm(v) for v in q['options'].values())))].append((eid,q))
result={}
for eid,p in proof.items():
    key=p['correctAnswers']
    assert len(key)==100 and set(key)<=set('ABCD')
    assert hashlib.sha256(key.encode()).hexdigest()==p['keyDigestSha256']
    assert [q['number'] for q in rows[eid]]==list(range(1,101))
    audit=[]
    for q in rows[eid]:
        n=q['number']; a=key[n-1]; b=q.get('bankAnswer')
        hits=[]
        for other_id,other in lookup[(norm(q['question']),tuple(sorted(norm(v) for v in q['options'].values())))]:
            wanted=norm(other['options'][other['correctAnswer']])
            letters=[k for k,v in q['options'].items() if norm(v)==wanted]
            if len(letters)==1: hits.append({'examId':other_id,'number':other['number'],'mappedAnswer':letters[0]})
        audit.append({'number':n,'sourcePage':q['sourcePage'],'question':q['question'],'options':q['options'],'sheet':a,'bank':b,'priorScored':q.get('correctAnswer'),'priorStatus':q['answerStatus'],'otherExams':hits})
    counts=Counter('match' if q['bank']==q['sheet'] else 'conflict' if q['bank'] else 'no_bank' for q in audit)
    conflicts=[q for q in audit if (q['bank'] and q['bank']!=q['sheet']) or (q['priorScored'] and q['priorScored']!=q['sheet']) or any(h['mappedAnswer']!=q['sheet'] for h in q['otherExams'])]
    result[eid]={'counts':dict(counts),'otherExamMatches':sum(any(h['mappedAnswer']==q['sheet'] for h in q['otherExams']) for q in audit),'priorScored':sum(bool(q['priorScored']) for q in audit),'conflicts':conflicts,'rows':audit}
    print('R26 SUMMARY',eid, json.dumps({k:v for k,v in result[eid].items() if k!='rows'},ensure_ascii=False),flush=True)
(OUT/'r26_candidate_audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print('R26 audited 200 positions. No source or published scoring was changed.')
