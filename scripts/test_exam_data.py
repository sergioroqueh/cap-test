"""Guards for historical CAP overlay. Run after build_exam_data.py."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'public' / 'data'
bank = json.loads((root/'index.json').read_text())
assert bank['totalQuestions'] == 8655
assert bank['totalQuestionnaires'] == 33
index = json.loads((root/'exams'/'index.json').read_text())
assert index['totalExamModels'] == 26
assert index['totalImportedQuestions'] == 2000
exams = index['exams']
assert len([e for e in exams if e['category'] == 'mercancias']) == 25
assert len([e for e in exams if e['category'] == 'viajeros']) == 1
assert index['categoryCounts']['mercancias'] == 19
assert index['categoryCounts'].get('viajeros',0) == 1

for exam in exams:
    rows = json.loads((root/exam['path'].removeprefix('data/')).read_text())
    assert len(rows) == exam['count'], exam['id']
    assert all(1 <= q['number'] <= 100 for q in rows)
    assert all(q['sourcePage'] in range(exam['sourcePageStart'],exam['sourcePageEnd']+1) for q in rows)
    assert exam['expectedCount'] == 100
    if exam['category'] == 'viajeros':
        assert exam['id'] == '2024-04-06-viajeros-global'
        assert len(rows) == 100, 'Viajeros debe mantener las 100 preguntas principales'
        assert {q['sourcePage'] for q in rows} == set(range(28,50))
    if exam['id'] == '2023-07-29-mercancias-a':
        assert len(rows) == 100
        for q in rows:
            n=q['number']
            if 1<=n<=43:
                assert q['templateNumberUsed']==n
                assert q['templateAlignmentStatus']=='sin_ajuste'
                assert q['templateAnswer']==q['rawTemplateAnswer']
            elif 44<=n<=99:
                if n==44:
                    assert q['rawTemplateAnswer']=='C' and q['templateAnswer']=='B'
                if n==89:
                    assert q['rawTemplateAnswer']=='A' and q['templateAnswer']=='D'
                if n==94:
                    assert q['rawTemplateAnswer']=='C' and q['templateAnswer']=='B'
                assert q['templateNumberUsed']==n+1
                assert q['templateAlignmentStatus']=='alineacion_provisional_pendiente_revision'
                assert q['reviewRequired']
                assert q['answerStatus']!='coincidencia_automatica'
            else:
                assert q['templateNumberUsed'] is None
                assert q['templateAnswer'] is None
                assert q['reviewRequired']
    assert sum(q['correctAnswer'] in ('A','B','C','D') for q in rows) == exam['readyCount']
    assert len({q['number'] for q in rows}) == len(rows)
    for q in rows:
        assert 1 <= q['number'] <= 100
        assert q['category'] == exam['category']
        assert q['examId'] == exam['id']
        assert set(q['options']) == set('ABCD')
        assert q['examFrequency'] >= 1
        assert q['examFrequency'] <= q['examFrequencyDenominator']
        if q['answerStatus'] in ('conflicto_banco','conflicto_plantilla_banco',
                                  'solo_plantilla_pendiente_cotejo','solo_plantilla_alineada_pendiente_cotejo',
                                  'sin_respuesta_verificada'):
            assert q['correctAnswer'] is None, (exam['id'],q['number'])
        if q['correctAnswer'] is not None:
            assert q['answerStatus'] in (
                'coincidencia_automatica',
                'coincidencia_alineacion_provisional_pendiente_revision',
                'respuesta_banco_pendiente_revision',
                'coincidencia_enunciado_banco_plantilla_pendiente_revision',
                'respuesta_banco_enunciado_pendiente_revision')
            assert q['correctAnswer'] == q['bankAnswer']
            if q['answerStatus'] in (
                'coincidencia_automatica',
                'coincidencia_alineacion_provisional_pendiente_revision',
                'coincidencia_enunciado_banco_plantilla_pendiente_revision'):
                assert q['correctAnswer'] == q['templateAnswer']
        if q.get('matchMethod') == 'enunciado_y_texto_respuesta_exactos':
            assert q['reviewRequired'], (exam['id'],q['number'])
            assert q['answerStatus'] in (
                'coincidencia_enunciado_banco_plantilla_pendiente_revision',
                'coincidencia_alineacion_provisional_pendiente_revision',
                'respuesta_banco_enunciado_pendiente_revision',
                'conflicto_plantilla_banco')
        if q['answerStatus'] in ('conflicto_banco','conflicto_plantilla_banco'):
            assert q['correctAnswer'] is None
        if q['answerStatus'] == 'coincidencia_enunciado_banco_plantilla_pendiente_revision':
            assert q['reviewRequired']
        if q['answerStatus']=='coincidencia_alineacion_provisional_pendiente_revision':
            assert q['reviewRequired']
            assert q['templateAlignmentStatus']!='sin_ajuste'
            assert q['correctAnswer'] == q['templateAnswer'] == q['bankAnswer']
        if q.get('transcriptionReview'):
            assert q['reviewRequired']

import csv
with (root/'exams'/'alignment_2023_a_review.csv').open('r',encoding='utf-8-sig',newline='') as fh:
    audit=list(csv.DictReader(fh))
assert len(audit)==100 and [int(q['number']) for q in audit]==list(range(1,101))
assert audit[88]['originalTemplateLetter']=='A' and audit[88]['candidateTemplateLetter']=='D'
assert audit[99]['candidateTemplateNumber']=='' and audit[99]['candidateTemplateLetter']==''
assert sum(q['answerStatus']=='conflicto_plantilla_banco' for q in audit)==0

freq = json.loads((root/'exams'/'frequency_by_bank.json').read_text())
assert all(1<=v['count']<=v['denominator'] for v in freq.values())
hints=json.loads((root/'exams'/'review_hints.json').read_text())
assert all(h['approved'] is False for h in hints)
assert all(h['usage']=='SUGERENCIA_REVISION_NO_AUTOCORREGIR' for h in hints)
assert all(h['category'] in ('mercancias','viajeros') for h in hints)
assert all('correctAnswer' not in h for h in hints), 'Una sugerencia no puede convertirse en clave de respuesta'
assert all(1<=h['candidateRank']<=3 for h in hints)
print(f"PASS CAP: {len(exams)} modelos, {index['totalImportedQuestions']} preguntas, {len(freq)} preguntas enlazadas al banco")
print(f"PASS sugerencias editoriales, nunca claves: {len(hints)}")
