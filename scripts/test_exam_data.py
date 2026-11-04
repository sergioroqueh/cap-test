"""Guards for historical CAP overlay. Run after build_exam_data.py."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'public' / 'data'
bank = json.loads((root/'index.json').read_text())
assert bank['totalQuestions'] == 8655
assert bank['totalQuestionnaires'] == 33
index = json.loads((root/'exams'/'index.json').read_text())
assert index['totalExamModels'] == 26
assert index['totalImportedQuestions'] == 1900
exams = index['exams']
assert len([e for e in exams if e['category'] == 'mercancias']) == 25
assert len([e for e in exams if e['category'] == 'viajeros']) == 1
assert index['categoryCounts']['mercancias'] == 19
assert index['categoryCounts'].get('viajeros',0) == 0

for exam in exams:
    rows = json.loads((root/exam['path'].removeprefix('data/')).read_text())
    assert len(rows) == exam['count'], exam['id']
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
                                  'solo_plantilla_pendiente_cotejo','sin_respuesta_verificada'):
            assert q['correctAnswer'] is None, (exam['id'],q['number'])
        if q['correctAnswer'] is not None:
            assert q['answerStatus'] in ('coincidencia_automatica',
                                          'respuesta_banco_pendiente_revision')
            assert q['correctAnswer'] == q['bankAnswer']
            if q['answerStatus'] == 'coincidencia_automatica':
                assert q['correctAnswer'] == q['templateAnswer']
        if q.get('transcriptionReview'):
            assert q['reviewRequired']

freq = json.loads((root/'exams'/'frequency_by_bank.json').read_text())
assert all(1<=v['count']<=v['denominator'] for v in freq.values())
print(f"PASS CAP: {len(exams)} modelos, {index['totalImportedQuestions']} preguntas, {len(freq)} preguntas enlazadas al banco")
