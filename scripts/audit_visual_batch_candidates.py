"""Audita 16 plantillas originales del ZIP contra el banco sin promocionar nada.

El generador histórico ya ha creado los 2.600 registros; esta etapa presenta
TODOS los conflictos antes de modificar el fichero de claves verificadas.
"""
from collections import Counter
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'data-src'/'cap-exams'
OUT=ROOT/'public'/'data'/'exams'
staging=json.loads((SRC/'visual_batch_candidates_2026_11_05.json').read_text(encoding='utf8'))['exams']
manifest={e['id']:e for e in json.loads((SRC/'manifest.json').read_text(encoding='utf8'))['exams']}
verified=json.loads((SRC/'answer_keys_visually_verified.json').read_text(encoding='utf8'))['exams']
unverified=json.loads((SRC/'answer_keys_unverified.json').read_text(encoding='utf8'))
if len(staging)!=16 or set(staging)&set(verified):raise AssertionError('Lote visual repetido o incompleto')
report={}
for exam_id,proof in staging.items():
    meta=manifest[exam_id]
    if (meta.get('templateFile')!=proof['sourceFile']
        or meta['category']!=proof['category']
        or meta['model']!=proof['model']):raise AssertionError('Modelo o modalidad incorrectos: '+exam_id)
    key=proof['correctAnswers']
    if len(key)!=100 or set(key)-set('ABCD'):raise AssertionError('No son 100 respuestas: '+exam_id)
    rows=json.loads((OUT/'questions'/f'{exam_id}.json').read_text(encoding='utf8'))
    if len(rows)!=100:raise AssertionError('Modelo incompleto '+exam_id)
    old=unverified.get(exam_id,'')
    differences=[{'number':n,'oldTemplate':old[n-1],'visualPdf':key[n-1]}
        for n in range(1,101) if old and old[n-1]!=key[n-1]]
    if differences and exam_id!='2023-07-29-mercancias-b':
        raise AssertionError('Letras sin validar: '+exam_id+str(differences))
    if exam_id=='2023-07-29-mercancias-b':
        if [e['number'] for e in differences]!=[6,13,19]:
            raise AssertionError('Diferencias imagen B2023 fuera de 6,13,19')
    if exam_id=='2023-07-29-mercancias-a':
        included=43
    else:included=100
    counts=Counter()
    holds=[]
    for q in rows:
        n=q['number']
        if n>included:continue
        letter=key[n-1]
        bank=q.get('bankAnswer')
        current=q.get('correctAnswer')
        if bank in 'ABCD' if bank is not None else False:
            if bank==letter:counts['bankConcordances']+=1
            else:
                counts['bankConflicts']+=1
                holds.append({'number':n,'bankAnswer':bank,'pdfAnswer':letter,
                    'previousCorrectAnswer':current,
                    'question':q['question'],
                    'pdfOption':q['options'][letter],
                    'bankOption':q['options'][bank]})
        if current in 'ABCD' if current is not None else False:
            if current!=letter:counts['previouslyScoredConflicts']+=1
            else:counts['previouslyScoredSame']+=1
        elif bank not in 'ABCD' if bank is not None else True:
            counts['newFromPdf']+=1
        if not bank:counts['withoutBank']+=1
    report[exam_id]={
        'sourceFile':proof['sourceFile'],'sourcePdfSha256':proof['sourcePdfSha256'],
        'positionsVerifiable':included,'provisionalDifferences':differences,
        'bankConcordances':counts['bankConcordances'],
        'bankConflicts':counts['bankConflicts'],
        'previouslyScoredSame':counts['previouslyScoredSame'],
        'previouslyScoredConflicts':counts['previouslyScoredConflicts'],
        'newFromPdf':counts['newFromPdf'],
        'withoutBank':counts['withoutBank'],
        'holdConflicts':holds,
    }
summary={'schemaVersion':1,'models':len(report),'visualPositions':sum(e['positionsVerifiable'] for e in report.values()),
 'newFromPdf':sum(e['newFromPdf'] for e in report.values()),
 'bankConflicts':sum(e['bankConflicts'] for e in report.values()),
 'items':report,
 'note':'Auditoría del PDF original sin promoción automática; conservar bloqueos por conflicto de enunciado y desalineación de 2023 A'}
(OUT/'visual_batch_audit_2026_11_05.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
for name,v in report.items():
    print(f"BATCH {name}: {v['positionsVerifiable']} posiciones, banco={v['bankConcordances']} conflictos={v['bankConflicts']} rescates={v['newFromPdf']} dif_lectura={len(v['provisionalDifferences'])}")
    if v['bankConflicts']:print('   BLOQUEADOS: ',[(h['number'],h['bankAnswer'],h['pdfAnswer']) for h in v['holdConflicts']])
print('BATCH TOTAL',summary['visualPositions'],summary['newFromPdf'],'conflicts',summary['bankConflicts'])
