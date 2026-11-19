"""R32: frozen candidate extraction only; no editorial decisions or scoring changes."""
from pathlib import Path
from collections import defaultdict, Counter
from hashlib import sha256
import json,re,unicodedata

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/exams'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def norm(s):
    return ' '.join(re.sub(r'[^a-z0-9]+',' ',''.join(c for c in unicodedata.normalize('NFKD',s.lower()) if not unicodedata.combining(c))).split())
patterns={
    'authorizations':r'\b(autorizacion(?:es)?|licencia comunitaria|cabotaje|visado|gestor de transporte|competencia profesional|capacidad financiera|honorabilidad|establecimiento|tarjeta de transporte|mdp|mdl|mpc|contingente|c em t|cemt)\b',
    'lott_rott':r'\b(lott|rott|ordenacion de los transportes terrestres|transporte publico|transporte privado|transporte complementario|transporte discrecional|transporte especial|operador de transporte|agencia de transporte|junta arbitral|documento de control|inspeccion de transportes|consignatario|transitario|arrendamiento de vehiculos)\b',
    'contract_cmr':r'\b(cmr|carta de porte|contrato de transporte|porteador(?:es)?|cargador(?:es)?|expedidor(?:es)?|destinatario(?:s)?|portes debidos|portes pagados|paralizacion|reserva por|indemnizacion|prescripcion|reembolso|entrega de la mercancia|perdida de la mercancia|averia de la mercancia|retraso en la entrega|carga y descarga|estiba y desestiba)\b',
    'adr':r'\b(adr|mercancias peligrosas|mercancia peligrosa|panel(?:es)? naranja(?:s)?|numero onu|numero de identificacion del peligro|consejero de seguridad|carta de porte adr|instrucciones escritas|cisterna(?:s)?|etiquetas? de peligro|clase de peligro|grupo de embalaje|exencion parcial)\b',
    'atp':r'\b(atp|mercancias perecederas|mercancia perecedera|productos perecederos|alimentos perecederos|isoterm[oa]s?|refrigerant[es]+|frigorific[oa]s?|calorific[oa]s?|cadena de frio|temperatura de transporte|placa atp|certificado atp)\b',
}
ix=read(OUT/'index.json')
reviewed=set()
for n in range(27,32):
    for c in read(ROOT/f'data-src/cap-exams/technical_review_r{n}.json')['cases']:
        key=(c['examId'],c['number'])
        assert key not in reviewed,key
        reviewed.add(key)
assert len(reviewed)==373,len(reviewed)
groups=defaultdict(list)
paths=[OUT/'index.json']
for e in ix['exams']:
    if e['category']!='mercancias' or not e['hasOriginalAnswerSheet']:continue
    path=OUT/'questions'/f"{e['id']}.json"
    paths.append(path)
    for q in read(path):
        if (e['id'],q['number']) in reviewed or not q['correctAnswer'] or q.get('technicalDecision'):continue
        stem=norm(q['question'])
        # Preserve ordinary spellings and additionally detect OCR uppercase-I substitutions.
        ocr=norm(q['question'].replace('I','l'))
        tags=[k for k,p in patterns.items() if re.search(p,stem) or re.search(p,ocr)]
        if not tags:continue
        sig=(stem,tuple(sorted(norm(v) for v in q['options'].values())))
        row={k:q.get(k) for k in ('examId','number','sourcePage','question','options','originalSheetAnswer','correctAnswer','bankAnswer','examFrequency')}
        row['topicCandidates']=tags
        groups[sig].append(row)
before={str(p):sha256(p.read_bytes()).hexdigest() for p in paths}
selected=[]
for i,rows in enumerate(sorted(groups.values(),key=lambda a:(-len(a),-max(q['examFrequency'] for q in a),a[0]['examId'],a[0]['number'])),1):
    first=rows[0]
    selected.append({'group':i,'frequency':max(q['examFrequency'] for q in rows),'question':first['question'],'options':first['options'],'rows':rows})
keys=[(q['examId'],q['number']) for g in selected for q in g['rows']]
assert len(keys)==len(set(keys)) and not set(keys)&reviewed
result={'round':'R32','status':'candidate_selection_not_reviewed','baselineCommit':'35b56bf5a7ad65c218126db05973460091a4112d','scope':'Scored historical Mercancias, stem keyword candidates; false positives and implicit omissions possible; exact normalized stem and option sets; verify each occurrence and historical/current law before editorial decisions','excludedAlreadyReviewed':len(reviewed),'groups':len(selected),'occurrences':len(keys),'topicCounts':dict(Counter(t for g in selected for q in g['rows'] for t in q['topicCandidates'])),'selected':selected}
(OUT/'technical_review_r32_candidates.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
assert before=={str(p):sha256(p.read_bytes()).hexdigest() for p in paths}
print('R32 COUNTS '+json.dumps({k:v for k,v in result.items() if k!='selected'},ensure_ascii=False))
for g in selected:print('R32 GROUP '+json.dumps(g,ensure_ascii=False,separators=(',',':')))
