"""R30 candidate selection: exact normalized question + options, no auto-edits."""
from pathlib import Path
from collections import defaultdict
import json, re, unicodedata
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/exams'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def norm(t):return re.sub(r'[^a-z0-9]','', ''.join(c for c in unicodedata.normalize('NFKD',t.lower()) if not unicodedata.combining(c)))
ix=read(OUT/'index.json')
reviewed={(c['examId'],c['number']) for c in read(ROOT/'data-src/cap-exams/technical_review_r29.json')['cases']}
rows=[]; groups=defaultdict(list)
for e in ix['exams']:
    if e['category']!='mercancias' or not e['hasOriginalAnswerSheet']:continue
    for q in read(OUT/'questions'/f"{e['id']}.json"):
        if not q['correctAnswer'] or q.get('technicalDecision') or (e['id'],q['number']) in reviewed:continue
        sig=(norm(q['question']),tuple(sorted(norm(x) for x in q['options'].values())))
        groups[sig].append(q);rows.append(q)
def risk(q):
    return bool(re.search(r'reglamento|ley|normativa|obligatori|tacógrafo|descanso|conducción|autorizaci|permiso|infracci|sanci|contrato|responsabil|carga|mercancías peligrosas',q['question'],re.I))
def rank(a):
    return (-max(q['examFrequency'] for q in a),-len({q['examId'] for q in a}),-int(risk(a[0])),a[0]['examId'],a[0]['number'])
ranked=sorted(groups.values(),key=rank)
# An explicit first batch of 16 different option sets. Keep full occurrence evidence.
selected=[]
for i,a in enumerate(ranked[:16],1):
    first=a[0]
    selected.append({'group':i,'frequency':max(q['examFrequency'] for q in a),'question':first['question'],'options':first['options'],'normativePriority':risk(first),'rows':[{k:q.get(k) for k in ('examId','number','sourcePage','question','options','originalSheetAnswer','correctAnswer','bankAnswer','examFrequency')} for q in a]})
result={'scope':'unreviewed keyed Mercancias rows, exact normalized stem and option sets; ranking by historical frequency then distinct models and normative priority','totalUnreviewedRows':len(rows),'exactGroups':len(groups),'selected':selected}
(OUT/'technical_review_r30_candidates.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('R30 COUNTS '+json.dumps({k:v for k,v in result.items() if k!='selected'},ensure_ascii=False))
for g in selected:print('R30 GROUP '+json.dumps(g,ensure_ascii=False,separators=(',',':')))
