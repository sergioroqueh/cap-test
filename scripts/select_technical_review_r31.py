"""R31: extract thematic candidates, with exact question and option texts."""
from pathlib import Path
from collections import defaultdict
import json,re,unicodedata
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/exams'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def norm(s):
    return re.sub(r'[^a-z0-9]','', ''.join(c for c in unicodedata.normalize('NFKD',s.lower()) if not unicodedata.combining(c)))
ix=read(OUT/'index.json')
reviewed=set()
for n in (27,28,29,30):
    reviewed.update((c['examId'],c['number']) for c in read(ROOT/f'data-src/cap-exams/technical_review_r{n}.json')['cases'])
groups=defaultdict(list)
for e in ix['exams']:
    if e['category']!='mercancias' or not e['hasOriginalAnswerSheet']:continue
    for q in read(OUT/'questions'/f"{e['id']}.json"):
        if (e['id'],q['number']) in reviewed or not q['correctAnswer']:continue
        t=norm(q['question'].replace('I','l'))
        if not re.search(r'tacogra|tiemp[oa]s?deconduccion|tiemp[oa]s?maxim[oa]s?deconduccion|descansodiari|descansoseman|periododedi|periododedescanso|conduccionininterrumpida|conducciondiaria|conduccionsemanal|conduccionbisemanal|hojas?deregistro|tarjetadeconductor|tarjetasdeconductor|discodediagrama|discos?diagrama|horasdeconduccion|jornadadeconduccion|5612006|1652014|382185|pausareglamentaria|pausadeconduccion|tiemposdedescanso|tiempodedescanso|tiempodepausa|conduccionenequipo',t):continue
        sig=(norm(q['question']),tuple(sorted(norm(x) for x in q['options'].values())))
        groups[sig].append(q)
ranked=sorted(groups.values(),key=lambda a:(-len(a),-max(q['examFrequency'] for q in a),a[0]['examId'],a[0]['number']))
selected=[]
for i,a in enumerate(ranked,1):
    first=a[0]
    selected.append({'group':i,'frequency':max(q['examFrequency'] for q in a),'question':first['question'],'options':first['options'],'rows':[{k:q.get(k) for k in ('examId','number','sourcePage','question','options','originalSheetAnswer','correctAnswer','bankAnswer','examFrequency')} for q in a]})
result={'scope':'Unreviewed scored historical Mercancias occurrences, thematic keyword selection; excludes all R27-R30 cases; exact normalized stem and option sets','groups':len(selected),'occurrences':sum(len(x['rows']) for x in selected),'selected':selected}
(OUT/'technical_review_r31_candidates.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('R31 COUNTS '+json.dumps({k:v for k,v in result.items() if k!='selected'},ensure_ascii=False))
for g in selected:print('R31 GROUP '+json.dumps(g,ensure_ascii=False,separators=(',',':')))
