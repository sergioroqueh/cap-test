"""Guards for historical CAP overlay. Run after build_exam_data.py."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'public' / 'data'
bank = json.loads((root/'index.json').read_text())
assert bank['totalQuestions'] == 8655
assert bank['totalQuestionnaires'] == 33
index = json.loads((root/'exams'/'index.json').read_text())
assert index['totalExamModels'] == 26
assert index['totalImportedQuestions'] == 2600
exams = index['exams']
# No overlapping PDF source pages across principal models. The only unassigned
# ranges are the two known six-page ampliaciones, excluded from frequency.
covered_pdf_pages = [
    page
    for e in exams
    for page in range(e['sourcePageStart'], e['sourcePageEnd']+1)
]
assert len(covered_pdf_pages) == len(set(covered_pdf_pages)) == 487
assert set(range(1, 500)) - set(covered_pdf_pages) == set(range(22, 28)) | set(range(51, 57))
assert next(e for e in exams if e['id']=='2025-03-29-mercancias-global')['sourcePageEnd']==347
assert next(e for e in exams if e['id']=='2026-03-28-mercancias-global')['sourcePageStart']==348
assert next(e for e in exams if e['id']=='2022-05-21-mercancias-global')['sourcePageStart']==364
assert len([e for e in exams if e['category'] == 'mercancias']) == 25
assert len([e for e in exams if e['category'] == 'viajeros']) == 1
assert index['categoryCounts']['mercancias'] == 25
assert index['categoryCounts'].get('viajeros',0) == 1

for exam in exams:
    rows = json.loads((root/exam['path'].removeprefix('data/')).read_text())
    assert len(rows) == exam['count'], exam['id']
    assert all(1 <= q['number'] <= 100 for q in rows)
    assert all(q['sourcePage'] in range(exam['sourcePageStart'],exam['sourcePageEnd']+1) for q in rows)
    assert exam['expectedCount'] == 100
    if exam['id']=='2022-05-21-mercancias-global':
        assert len(rows)==100
        assert {q['number'] for q in rows}==set(range(1,101))
        assert {q['sourcePage'] for q in rows}==set(range(364,384))
        assert all(q.get('transcriptionReview') is True for q in rows)
        assert all(q.get('sourceMethod')=='LECTURA_VISUAL_PDF_PENDIENTE_REVISION' for q in rows)
        assert all(q['reviewRequired'] is True for q in rows)
        assert all(q['category']=='mercancias' for q in rows)
        assert all(q['correctAnswer'] is None or q['correctAnswer']==q['bankAnswer'] or q['answerStatus'] in ('respuesta_fuente_publica_oficial_pendiente_plantilla','plantilla_pdf_oficial_verificada') for q in rows)
        assert next(q for q in rows if q['number']==1)['sourcePage']==364
        assert next(q for q in rows if q['number']==100)['sourcePage']==383
    if exam['id']=='2024-04-06-mercancias-global':
        assert len(rows)==100
        assert {q['number'] for q in rows}==set(range(1,101))
        assert {q['sourcePage'] for q in rows}==set(range(1,22))
        assert all(q.get('transcriptionReview') is True for q in rows)
        assert all(q.get('sourceMethod')=='LECTURA_VISUAL_PDF_PENDIENTE_REVISION' for q in rows)
        assert all(q['reviewRequired'] is True for q in rows)
        assert all(q['category']=='mercancias' for q in rows)
        assert all(q['correctAnswer'] is None or q['correctAnswer']==q['bankAnswer'] or q['answerStatus'] in ('respuesta_fuente_publica_oficial_pendiente_plantilla','plantilla_pdf_oficial_verificada') for q in rows)
        assert next(q for q in rows if q['number']==1)['sourcePage']==1
        assert next(q for q in rows if q['number']==100)['sourcePage']==21
        assert all(q['number']<=100 for q in rows), 'No incluir reservas 101-103'
    if exam['id']=='2026-03-28-mercancias-global':
        assert len(rows)==100
        assert {q['number'] for q in rows}==set(range(1,101))
        assert {q['sourcePage'] for q in rows}==set(range(348,364))
        assert all(q.get('transcriptionReview') is True for q in rows)
        assert all(q.get('sourceMethod')=='LECTURA_VISUAL_PDF_PENDIENTE_REVISION' for q in rows)
        assert all(q['reviewRequired'] is True for q in rows)
        assert all(q['category']=='mercancias' for q in rows)
        assert all(q['correctAnswer'] is None or q['correctAnswer']==q['bankAnswer'] or q['answerStatus'] in ('respuesta_fuente_publica_oficial_pendiente_plantilla','plantilla_pdf_oficial_verificada') for q in rows)
        assert next(q for q in rows if q['number']==1)['sourcePage']==348
        assert next(q for q in rows if q['number']==100)['sourcePage']==363
    if exam['id']=='2026-09-26-mercancias-a':
        assert exam['readyCount']==90, '90 claves del banco, resto sin autocorrección y pendiente de revisión'
        assert len(rows)==100
        assert {q['number'] for q in rows}==set(range(1,101))
        assert {q['sourcePage'] for q in rows}==set(range(128,145))
        assert all(q.get('transcriptionReview') is True for q in rows)
        assert all(q.get('sourceMethod')=='LECTURA_VISUAL_PDF_PENDIENTE_REVISION' for q in rows)
        assert all(q['reviewRequired'] is True for q in rows)
        assert all(q['category']=='mercancias' for q in rows)
        assert all(q['correctAnswer'] is None or q['correctAnswer']==q['bankAnswer'] or q['answerStatus'] in ('respuesta_fuente_publica_oficial_pendiente_plantilla','plantilla_pdf_oficial_verificada') for q in rows)
        assert next(q for q in rows if q['number']==100)['sourcePage']==144
    if exam['id']=='2025-07-26-mercancias-b':
        assert exam['readyCount']==85, 'Las 85 claves proceden solo del banco; 15 siguen pendientes'
        assert len(rows)==100
        assert {q['number'] for q in rows}==set(range(1,101))
        assert {q['sourcePage'] for q in rows}==set(range(185,202))
        assert all(q.get('transcriptionReview') is True for q in rows)
        assert all(q.get('sourceMethod')=='LECTURA_VISUAL_PDF_PENDIENTE_REVISION' for q in rows)
        assert all(q['reviewRequired'] is True for q in rows)
        assert all(q['correctAnswer'] is None or q['correctAnswer']==q['bankAnswer'] or q['answerStatus'] in ('respuesta_fuente_publica_oficial_pendiente_plantilla','plantilla_pdf_oficial_verificada') for q in rows)
        assert all(q['category']=='mercancias' for q in rows)
        assert next(q for q in rows if q['number']==100)['sourcePage']==201
        assert all(q['number']<=100 for q in rows), 'Excluir preguntas de reserva'
    if exam['id']=='2025-07-26-mercancias-a':
        assert len(rows)==100
        assert {q['number'] for q in rows}==set(range(1,101))
        assert {q['sourcePage'] for q in rows}==set(range(97,112))
        assert all(q.get('transcriptionReview') is True for q in rows)
        assert all(q['reviewRequired'] is True for q in rows)
        assert all(q['correctAnswer'] is None or q['correctAnswer']==q['bankAnswer'] or q['answerStatus'] in ('respuesta_fuente_publica_oficial_pendiente_plantilla','plantilla_pdf_oficial_verificada') for q in rows)
    if exam['id']=='2023-07-29-mercancias-b':
        for n in (6,19):
            q=next(q for q in rows if q['number']==n)
            assert q['rawTemplateAnswer']=='C'
            assert q['templateAnswer']=='D'
            assert q['bankAnswer']=='D'
            assert q['correctAnswer']=='D'
            assert q['answerStatus']=='coincidencia_plantilla_corregida_visual_pendiente_revision'
            assert q['templateVisualCorrectionStatus']=='correccion_visual_documentada_pendiente_revision_editorial'
            assert q['reviewRequired']
    if exam['id']=='2026-02-07-mercancias-global':
        q=next(q for q in rows if q['number']==61)
        assert q['templateAnswer']=='A' and q['bankAnswer']=='C'
        assert q['correctAnswer'] is None
        assert q['answerStatus']=='conflicto_pdf_original_banco_pendiente_cotejo_enunciado'
        assert q['answerTemplateOfficiallyVerified'] is True
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
    assert len(rows)==100, ('Todos los 26 examenes principales deben estar completos', exam['id'])
    assert exam['count']==100 and exam['expectedCount']==100
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
                                  'sin_respuesta_verificada','conflicto_pdf_original_banco_pendiente_cotejo_enunciado'):
            assert q['correctAnswer'] is None, (exam['id'],q['number'])
        if q['correctAnswer'] is not None:
            assert q['answerStatus'] in (
                'coincidencia_automatica',
                'coincidencia_alineacion_provisional_pendiente_revision',
                'coincidencia_plantilla_corregida_visual_pendiente_revision',
                'respuesta_banco_pendiente_revision',
                'coincidencia_enunciado_banco_plantilla_pendiente_revision',
                'respuesta_banco_enunciado_pendiente_revision',
                'respuesta_fuente_publica_oficial_pendiente_plantilla',
                'plantilla_pdf_oficial_verificada')
            if q['answerStatus'] not in ('respuesta_fuente_publica_oficial_pendiente_plantilla', 'plantilla_pdf_oficial_verificada'):
                assert q['correctAnswer'] == q['bankAnswer']
            if q['answerStatus'] in (
                'coincidencia_automatica',
                'coincidencia_alineacion_provisional_pendiente_revision',
                'coincidencia_plantilla_corregida_visual_pendiente_revision',
                'coincidencia_enunciado_banco_plantilla_pendiente_revision'):
                assert q['correctAnswer'] == q['templateAnswer']
        if q.get('matchMethod') == 'enunciado_y_texto_respuesta_exactos' and q['answerStatus']!='plantilla_pdf_oficial_verificada':
            assert q['reviewRequired'], (exam['id'],q['number'])
            assert q['answerStatus'] in (
                'coincidencia_enunciado_banco_plantilla_pendiente_revision',
                'coincidencia_alineacion_provisional_pendiente_revision',
                'coincidencia_plantilla_corregida_visual_pendiente_revision',
                'respuesta_banco_enunciado_pendiente_revision',
                'conflicto_plantilla_banco',
                'plantilla_pdf_oficial_verificada')
        if q['answerStatus'] in ('conflicto_banco','conflicto_plantilla_banco'):
            assert q['correctAnswer'] is None
        if q['answerStatus'] == 'coincidencia_enunciado_banco_plantilla_pendiente_revision':
            assert q['reviewRequired']
        if q['answerStatus']=='coincidencia_plantilla_corregida_visual_pendiente_revision':
            assert q['reviewRequired']
            assert q['rawTemplateAnswer']!=q['templateAnswer']
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
review=json.loads((root/'exams'/'review_queue.json').read_text())
review61=next(q for q in review if q['examId']=='2026-02-07-mercancias-global' and q['number']==61)
assert review61['normativeSuggestedAnswer']=='C'
assert 'eur-lex.europa.eu' in review61['normativeSourceUrl']
assert review61['normativeStatus']=='pendiente_revision_editorial_no_autocorregir'

with (root/'exams'/'ocr_2025_a_review.csv').open('r',encoding='utf-8-sig',newline='') as fh:
    ocr_audit=list(csv.DictReader(fh))
assert len(ocr_audit)==100
assert [int(q['number']) for q in ocr_audit]==list(range(1,101))
assert all(q['transcriptionReview']=='True' and q['sourceMethod'] for q in ocr_audit)
assert all(q['optionA'] and q['optionB'] and q['optionC'] and q['optionD'] for q in ocr_audit)
assert sum(q['bankAnswer'] in ('A','B','C','D') for q in ocr_audit)==67

# Public government/BOE evidence, NOT the official CAP answer sheet.
evidence=json.loads((root.parent.parent/'data-src'/'cap-exams'/'official_public_evidence_2026_11_05.json').read_text())['cases']
public_answers=[]
for exam in exams:
    for q in json.loads((root/exam['path'].removeprefix('data/')).read_text()):
        if q.get('answerEvidenceUrl'):
            public_answers.append(q)
            key=q['examId']+':'+str(q['number'])
            proof=evidence[key]
            assert q['sourcePage']==proof['sourcePage']
            assert q['reviewRequired'] is (q['answerStatus']!='plantilla_pdf_oficial_verificada')
            assert q['answerEvidenceUrl']==proof['sourceUrl']
            assert q['answerTemplateOfficiallyVerified'] is (q['answerStatus']=='plantilla_pdf_oficial_verificada')
            assert q['correctAnswer'] in 'ABCD'
            assert q['options'][q['correctAnswer']]==proof['correctAnswerText']
            assert q['bankAnswer'] is None
assert len(public_answers)==len(evidence)==7
assert sum(q['answerStatus']=='respuesta_fuente_publica_oficial_pendiente_plantilla' for q in public_answers)==4
assert index['totalImportedQuestions']==2600
assert sum(q['readyCount'] for q in exams)==2039
print('PASS documentadas con BOE/DGT:',len(public_answers))

# Cross-exam review is advisory and must never silently assign a correct answer.
cross=json.loads((root/'exams'/'cross_model_pending_review.json').read_text())
assert cross['schemaVersion']==1
all_questions={}
for exam in exams:
    for question in json.loads((root/exam['path'].removeprefix('data/')).read_text()):
        all_questions[(exam['id'],question['number'])]=question
pending_count=sum(q['correctAnswer'] is None for q in all_questions.values())
assert cross['totalUnscoredBeforeAndAfter']==pending_count
assert cross['exactRepeatCases']==len(cross['items'])
assert all(item['approved'] is False and item['willAffectCorrectAnswer'] is False
           and item['usage']=='SOLO_REVISION_NO_AUTOCORREGIR'
           for item in cross['items'])
assert all('correctAnswer' not in item for item in cross['items'])
seen=set()
for item in cross['items']:
    key=(item['examId'],item['number'])
    assert key not in seen
    seen.add(key)
    target=all_questions[key]
    assert target['correctAnswer'] is None
    assert target['category']==item['category']
    assert 1<=item['number']<=100
    assert item['exactRepeatedModels']
    assert item['examId'] not in item['exactRepeatedModels']
    assert all(all_questions[(source['examId'],source['number'])]['category']==item['category']
               for source in item['supportingTemplateRows'])
    assert item['supportingModels']==len(set(
        source['examId'] for source in item['supportingTemplateRows']))
    if item['reviewStatus']=='contradiccion_plantillas_bloqueada':
        assert item['candidateLetterUnapproved'] is None
        assert len(set(e['candidateLetterInTarget']
                       for e in item['supportingTemplateRows']))>1
    elif item['candidateLetterUnapproved'] is not None:
        assert item['candidateLetterUnapproved'] in 'ABCD'
        assert item['candidateAnswerTextUnapproved']==target['options'][
            item['candidateLetterUnapproved']]
        assert item['supportingModels']>=1
        assert {e['candidateLetterInTarget'] for e in item['supportingTemplateRows']}=={
            item['candidateLetterUnapproved']}
    else:
        assert not item['supportingTemplateRows']
with (root/'exams'/'cross_model_pending_review.csv').open('r',encoding='utf-8-sig',newline='') as fh:
    cross_csv=list(csv.DictReader(fh))
assert len(cross_csv)==len(cross['items'])


# R15: cross-check against the *original user-provided PDF*, read visually.
# The digest is of the literal 100 letters in five 20-row columns, not OCR.
import hashlib
verified_meta=json.loads((root.parent.parent/'data-src'/'cap-exams'/'answer_keys_visually_verified.json').read_text())
proof=verified_meta['exams']['2025-03-29-mercancias-global']
key=proof['correctAnswers']
assert len(key)==100 and set(key)<=set('ABCD')
assert hashlib.sha256(key.encode()).hexdigest()==proof['keyDigestSha256']
assert proof['sourcePdfSha256']=='ef2729a312160717c732240d9dde37807a459f66e7ec2d86cfc60f1faaeeb70b'
assert key[24]=='C' and key[45]=='B' and key[61]=='C'
assert key[68]=='A' and key[69]=='C' and key[79]=='B'
assert key[81]=='C' and key[89]=='C' and key[99]=='B'
march_rows=json.loads((root/'exams'/'questions'/'2025-03-29-mercancias-global.json').read_text())
assert len(march_rows)==100
assert {q['number'] for q in march_rows}==set(range(1,101))
assert ''.join(q['correctAnswer'] for q in march_rows)==key
assert all(q['templateAnswer']==q['correctAnswer'] for q in march_rows)
assert all(q['answerStatus']=='plantilla_pdf_oficial_verificada' for q in march_rows)
assert all(q['answerTemplateOfficiallyVerified'] is True for q in march_rows)
assert all(q['answerTemplateSourceSha256']==proof['sourcePdfSha256'] for q in march_rows)
assert sum(q['bankAnswer'] is not None for q in march_rows)==85
assert sum(q['bankAnswer'] is None for q in march_rows)==15
assert all(not q['bankAnswer'] or q['bankAnswer']==q['correctAnswer'] for q in march_rows)
assert next(e for e in exams if e['id']=='2025-03-29-mercancias-global')['readyCount']==100
july_proof=verified_meta['exams']['2025-07-26-mercancias-a']
july_rows=json.loads((root/'exams'/'questions'/'2025-07-26-mercancias-a.json').read_text())
assert len(july_rows)==100 and len(july_proof['correctAnswers'])==100
assert hashlib.sha256(july_proof['correctAnswers'].encode()).hexdigest()==july_proof['keyDigestSha256']
assert sum(q['correctAnswer'] in 'ABCD' for q in july_rows if q['correctAnswer'] is not None)==99
assert all(q['answerStatus']=='plantilla_pdf_oficial_verificada' for q in july_rows if q['number']!=43)
assert all(q['correctAnswer']==july_proof['correctAnswers'][q['number']-1]
           for q in july_rows if q['number']!=43)
assert sum(q['bankAnswer'] is None for q in july_rows)==33
assert sum(q['bankAnswer']==q['correctAnswer'] for q in july_rows if q['bankAnswer'])==66
july_conflict=next(q for q in july_rows if q['number']==43)
assert july_conflict['bankAnswer']=='B' and july_conflict['templateAnswer']=='A'
assert july_conflict['correctAnswer'] is None
assert july_conflict['answerStatus']=='conflicto_pdf_original_banco_pendiente_cotejo_enunciado'
assert july_conflict['reviewRequired'] is True
assert july_conflict['answerTemplateOfficiallyVerified'] is True
assert next(e for e in exams if e['id']=='2025-07-26-mercancias-a')['readyCount']==99
march26_proof=verified_meta['exams']['2026-03-28-mercancias-global']
march26_rows=json.loads((root/'exams'/'questions'/'2026-03-28-mercancias-global.json').read_text())
assert len(march26_rows)==100 and len(march26_proof['correctAnswers'])==100
assert hashlib.sha256(march26_proof['correctAnswers'].encode()).hexdigest()==march26_proof['keyDigestSha256']
assert sum(q['correctAnswer'] in 'ABCD' for q in march26_rows if q['correctAnswer'] is not None)==99
assert all(q['answerStatus']=='plantilla_pdf_oficial_verificada' for q in march26_rows if q['number']!=43)
assert all(q['correctAnswer']==march26_proof['correctAnswers'][q['number']-1]
           for q in march26_rows if q['number']!=43)
assert sum(q['bankAnswer'] is not None for q in march26_rows)==81
assert sum(q['bankAnswer']==q['correctAnswer'] for q in march26_rows if q['bankAnswer'])==80
march26_conflict=next(q for q in march26_rows if q['number']==43)
assert march26_conflict['bankAnswer']=='B' and march26_conflict['templateAnswer']=='C'
assert march26_conflict['correctAnswer'] is None
assert march26_conflict['answerStatus']=='conflicto_pdf_original_banco_pendiente_cotejo_enunciado'
march26_external=next(q for q in march26_rows if q['number']==58)
assert march26_external['correctAnswer']=='C' and march26_external['bankAnswer'] is None
assert march26_external['answerStatus']=='plantilla_pdf_oficial_verificada'
assert 'dgt.es' in march26_external['answerEvidenceUrl']
assert next(e for e in exams if e['id']=='2026-03-28-mercancias-global')['readyCount']==99
print('PASS R15: marzo 2026, 99 verificadas y q43 bloqueada por discrepancia OCR/banco')
feb26_proof=verified_meta['exams']['2026-02-07-mercancias-global']
feb26_rows=json.loads((root/'exams'/'questions'/'2026-02-07-mercancias-global.json').read_text())
assert feb26_proof['sourceFile']=='Plantilla Febrero 2026.pdf'
assert feb26_proof['expectedBankConcordances']==86
assert feb26_proof['expectedPreviouslyUnscoredConflicts']==1
assert sum(q['answerStatus']=='plantilla_pdf_oficial_verificada' for q in feb26_rows)==99
assert sum(q['answerStatus']=='conflicto_pdf_original_banco_pendiente_cotejo_enunciado' for q in feb26_rows)==1
assert next(q for q in feb26_rows if q['number']==61)['correctAnswer'] is None
assert next(e for e in exams if e['id']=='2026-02-07-mercancias-global')['readyCount']==99
print('PASS R16: febrero 2026, 99 verificadas, q61 bloqueada')


# Source-key integrity for each verified visual PDF (not merely OCR candidate).
for eid,proof in verified_meta['exams'].items():
    rows=json.loads((root/'exams'/'questions'/f'{eid}.json').read_text())
    assert len(rows)==100
    assert len(proof['correctAnswers'])==100
    assert hashlib.sha256(proof['correctAnswers'].encode()).hexdigest()==proof['keyDigestSha256']
    held=set(int(x) for x in proof.get('holdConflicts',{}))
    assert sum(q['correctAnswer'] is None for q in rows)==len(held)
    assert all(q['answerTemplateOfficiallyVerified'] is True for q in rows)
    assert all(q['answerTemplateSourceSha256']==proof['sourcePdfSha256'] for q in rows)
    assert all(q['templateAnswer']==proof['correctAnswers'][q['number']-1] for q in rows)
    assert all(q['correctAnswer']==proof['correctAnswers'][q['number']-1] for q in rows if q['number'] not in held)
    assert sum(q['bankAnswer'] and q['bankAnswer']==q['templateAnswer'] for q in rows)==proof['expectedBankConcordances']
    assert sum(q['bankAnswer'] and q['bankAnswer']!=q['templateAnswer'] for q in rows)==proof.get('expectedBankConflicts',0)
    assert sum(bool(q.get('answerEvidenceUrl')) for q in rows)==proof.get('expectedPreviouslyScoredExternal',0)
    assert next(e for e in exams if e['id']==eid)['readyCount']==100-len(held)
print('PASS R15: 5 PDF originales, 500 casillas comprobadas, 2 conflictos excluidos de puntuación')


print('PASS R15: julio 2025 A, 99 verificadas y q43 bloqueada por discrepancia OCR/banco')

print('PASS R15: marzo 2025 100/100 visualmente verificados, 85/85 banco, 15 respuestas recuperadas')

# R14: solo analizar pendientes con archivo de plantilla; las restantes
# conservan su posición en CAP Test, pero se aplazan en auditoría editorial.
template_summary=json.loads((root/'exams'/'template_review_summary.json').read_text())
assert template_summary['totalUnscored']==561
assert template_summary['prioritizedWithTemplate']==381
assert template_summary['deferredWithoutTemplate']==180
assert template_summary['publishedAnswerChanges']==117
expected_deferred={
    '2025-07-26-mercancias-b',
    '2023-12-02-mercancias-global',
    '2022-05-21-mercancias-global',
    '2024-04-06-viajeros-global',
}
assert set(template_summary['modelsWithoutTemplate'])==expected_deferred
with (root/'exams'/'template_review_priority.csv').open(encoding='utf-8-sig',newline='') as fh:
    priority_rows=list(csv.DictReader(fh))
with (root/'exams'/'without_template_deferred.csv').open(encoding='utf-8-sig',newline='') as fh:
    deferred_rows=list(csv.DictReader(fh))
assert len(priority_rows)==381 and len(deferred_rows)==180
assert all(r['templateFile'] and r['pendingReason']=='VERIFICAR_IMAGEN_PLANTILLA' for r in priority_rows)
assert all(not r['templateFile'] and r['pendingReason']=='APLAZADO_SIN_ARCHIVO_PLANTILLA' for r in deferred_rows)
assert all(r['examId'] not in expected_deferred for r in priority_rows)
assert all(r['examId'] in expected_deferred for r in deferred_rows)
prioritized_keys={(r['examId'],int(r['number'])) for r in priority_rows}
deferred_keys={(r['examId'],int(r['number'])) for r in deferred_rows}
assert len(prioritized_keys)==381 and len(deferred_keys)==180
assert not (prioritized_keys & deferred_keys)
assert all(all_questions[key]['correctAnswer'] is None for key in prioritized_keys | deferred_keys)
unverified=json.loads((root/'exams'/'template_2025_03_29_unverified_comparison.json').read_text())
assert unverified['matchingExistingBank']==76
assert unverified['disagreeingWithExistingBank']==9
assert unverified['noExistingBankAnswer']==15
assert 'BLOQUEADO' in unverified['reviewStatus']
assert len(unverified['disagreements'])==9
assert len(unverified['candidatesUnapproved'])==15
assert all(all_questions[('2025-03-29-mercancias-global',int(q['number']))]['answerStatus']=='plantilla_pdf_oficial_verificada'
           for q in unverified['candidatesUnapproved'])
print('PASS R16: 381 pendientes con plantilla, 180 aplazadas, 6 plantillas leídas')

freq = json.loads((root/'exams'/'frequency_by_bank.json').read_text())
assert all(1<=v['count']<=v['denominator'] for v in freq.values())
assert all(v['category']=='mercancias' for v in freq.values()), 'El banco general no debe heredar el denominador de Viajeros'
hints=json.loads((root/'exams'/'review_hints.json').read_text())
assert all(h['approved'] is False for h in hints)
assert all(h['usage']=='SUGERENCIA_REVISION_NO_AUTOCORREGIR' for h in hints)
assert all(h['category'] in ('mercancias','viajeros') for h in hints)
assert all('correctAnswer' not in h for h in hints), 'Una sugerencia no puede convertirse en clave de respuesta'
assert all(1<=h['candidateRank']<=3 for h in hints)
print(f"PASS CAP: {len(exams)} modelos, {index['totalImportedQuestions']} preguntas, {len(freq)} preguntas enlazadas al banco")
print(f"PASS sugerencias editoriales, nunca claves: {len(hints)}")
