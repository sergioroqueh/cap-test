"""R28: explicit cross-model coherence; never modify historical keys."""
from pathlib import Path
from collections import Counter
import json, re, unicodedata, csv
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data/exams'
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,d): p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
index=read(OUT/'index.json')
source=read(ROOT/'data-src/cap-exams/technical_review_r28.json')
base=read(ROOT/'data-src/cap-exams/technical_review_r27.json')
r27={(c['examId'],c['number']):c for c in base['cases']}
def norm(s):
    return re.sub(r'[^a-z0-9]','', ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if not unicodedata.combining(c)))
def keytext(s,ocr=False):
    t=norm(s)
    return t.replace('l','i') if ocr else t
def sig(q,ocr=False):
    return keytext(q['question'],ocr),tuple(sorted(keytext(x,ocr) for x in q['options'].values()))
def unique(rows):
    ids=set(); texts=set()
    for q in rows:
        i=q['canonicalQuestionId'] or q['id']
        t=re.sub(r'[¿?¡!.,;:()\[\]{}]','',re.sub(r'\s+',' ',unicodedata.normalize('NFKC',q['question']).lower())).strip()
        if i in ids or t in texts:continue
        ids.add(i);texts.add(t)
    return len(ids)
exams={e['id']:read(OUT/'questions'/f"{e['id']}.json") for e in index['exams']}
byid={(q['examId'],q['number']):q for rr in exams.values() for q in rr}
targets={(c['examId'],c['number']):c for c in source['cases']}
assert len(targets)==25 and not set(targets)&set(r27)
assert Counter(c['match'] for c in targets.values())=={'exact':18,'ocr':5,'variant':2}
# All 23 R27 cross occurrences must be explicitly covered, no fuzzy auto-approval.
cross=read(OUT/'technical_review_r27_cross_model.json')
expected={(x['id'] if 'id'in x else x['examId'],x['n'] if 'n'in x else x['number'],m['examId'],m['number']) for x in cross for m in x['matches']}
actual={(c['sourceExamId'],c['sourceNumber'],c['examId'],c['number']) for c in source['cases'] if c['match']!='variant'}
assert expected==actual,(expected-actual,actual-expected)
decisions=[]
for k,c in targets.items():
    orig=(c['sourceExamId'],c['sourceNumber'])
    q=byid[k]; parent=byid[orig]; d=r27[orig]
    assert q['sourcePage']==c['sourcePage'] and q['originalSheetAnswer']==q['correctAnswer']==c['historicalAnswer'],k
    assert q['category']==parent['category']=='mercancias' and not q.get('technicalDecision'),k
    if c['match']=='variant':
        assert norm(q['question'])==norm(c['stem']),k
        assert all(norm(q['options'][a])==norm(c['options'][a]) for a in 'ABCD'),(k,q['options'],c['options'])
        technical=None if d['action']=='exclude' else c['historicalAnswer']
    else:
        ocr=c['match']=='ocr'
        assert sig(q,ocr)==sig(parent,ocr),k
        # Map by answer text, never by position or letter only.
        def mapped(a):
            if a is None:return None
            found=[x for x,t in q['options'].items() if keytext(t,ocr)==keytext(parent['options'][a],ocr)]
            assert len(found)==1,(k,a)
            return found[0]
        assert mapped(d['historicalAnswer'])==c['historicalAnswer'],k
        technical=mapped(d['technicalAnswer'])
    action=d['action']
    assert action in ('note','exclude') and ((technical is None)==(action=='exclude'))
    reason=c.get('reason',d['reason'])
    sources=[s.replace('Manual-IX-Primeros-Auxilios_2024.pdf','Manual-IX-Primeros-Auxilios-2024.pdf') for s in d['sources']]
    # Correct the inherited DGT URL; clarify supporting direct evidence.
    if orig==('2023-12-02-mercancias-global',44):
        sources.append('https://sede.dgt.gob.es/export/sites/dgt/.galleries/permisos-de-conducir/certificacion-aptitud-profesores-formacion-vial/2025/Manual-IX-Primeros-Auxilios-2025.pdf')
    decision={**c,'round':'R28','technicalAnswer':technical,'action':action,'reason':reason,'sources':list(dict.fromkeys(sources))}
    q['technicalDecision']=decision; decisions.append(decision)
assert Counter(c['action'] for c in decisions)=={'note':22,'exclude':3}
all_rows=[]; affected=set(c['examId'] for c in decisions)
for e in index['exams']:
    rr=exams[e['id']]
    if e['id'] in affected:write(OUT/'questions'/f"{e['id']}.json",rr)
    e['technicalReadyCount']=sum(q['correctAnswer'] is not None and q.get('technicalDecision',{}).get('action')!='exclude' for q in rr)
    if e['category']=='mercancias' and e['hasOriginalAnswerSheet']:all_rows.extend(rr)
eligible=[q for q in all_rows if q['correctAnswer'] is not None and q.get('technicalDecision',{}).get('action')!='exclude']
assert len(all_rows)==2400 and len(eligible)==2388
index['technicalR28Stats']={**index['mercanciasTemplateStats'],'scorableAppearances':len(eligible),'uniqueScorableQuestions':unique(eligible)}
index['version']='2026-11-16-r28'
write(OUT/'index.json',index)
write(OUT/'technical_review_r28.json',{**source,'cases':decisions})
with (OUT/'technical_review_r28.csv').open('w',encoding='utf-8-sig',newline='') as f:
    fields=['examId','number','sourcePage','historicalAnswer','technicalAnswer','action','match','sourceExamId','sourceNumber','reason','sources']
    w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
    for d in decisions:w.writerow({**d,'sources':' | '.join(d['sources'])})
# Queue only: identical normalized stems with different distractors OR
# high-priority concepts. Include actual options and source letter for review.
patterns={
    'mercancia_pendiente':lambda t:'pendienteascendente' in t and 'mercancia' in t and ('acelera' in t or 'aceiera' in t),
    'clasificacion_transportes':lambda t:'regimenjuridico' in t and ('clasific' in t),
    'enfermedad_profesional':lambda t:'enfermedadprofesional' in t or 'enfermedadesprofesionales' in t,
    'consumo_especifico':lambda t:'consumoespecifico' in t,
    'humo_negro':lambda t:'humonegro' in t or 'humosnegros' in t,
    'fuerzas_newton':lambda t:'paresdefuerzas' in t or 'sumadelasfuerzas' in t,
    'caja_cambios_consumo':lambda t:('cajadecambio' in t or 'cajadevelocidades' in t) and ('consumo' in t or 'carburante' in t),
}
queue=[]
for q in all_rows:
    if q.get('technicalDecision') or not q.get('correctAnswer'):continue
    hits=[]
    for orig,d in r27.items():
        p=byid[orig]
        if keytext(q['question'],True)==keytext(p['question'],True):hits.append(f"stem:{orig[0]}:{orig[1]}")
    n=norm(q['question'].replace('I','l'))
    hits.extend(name for name,fn in patterns.items() if fn(n))
    if hits:
        queue.append({k:q.get(k) for k in ['examId','number','sourcePage','question','options','originalSheetAnswer','correctAnswer','bankAnswer']}|{'reasons':hits,'approved':False})
write(OUT/'technical_review_r28_queue.json',queue)
print('R28 QUEUE '+json.dumps(queue,ensure_ascii=False))
print('R28 PASS '+json.dumps({'cases':len(decisions),'actions':dict(Counter(c['action'] for c in decisions)),'affectedModels':len(affected),'queue':len(queue),'stats':index['technicalR28Stats']},ensure_ascii=False))
