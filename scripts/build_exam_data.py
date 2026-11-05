"""Cotejo conservador de exámenes CAP frente al banco original de 8.655 preguntas.
Las claves de las plantillas son candidatas: contradicciones quedan bloqueadas.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import csv
from hashlib import sha256
from pathlib import Path
import json
import re
import shutil
import unicodedata
import base64
import lzma
from difflib import SequenceMatcher

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data-src' / 'cap-exams'
OUT = ROOT / 'public' / 'data' / 'exams'
QSTART = re.compile(r'(?m)^[ \t]*(\d{1,3})[ \t]*\.(?:[ \t]+([^\n]*)|([^\d\s][^\n]*)|[ \t]*$)')
OPTION = re.compile(r'^\s*([abcd])(?:\s*[).]|\s+)(.*)$')
BARE = re.compile(r'^\s*([abcd])\s*$')
UPPER = re.compile(r'^\s*([ABCD])(?:\s*[).]|\s+)(.*)$')
HEADER = re.compile(r'(?i)^\s*(?:examen\s+(?:obtenci[oó]n|:)|(?:fecha|lugar|formador|duraci[oó]n|p[aá]gina|p\s*[aá]\s*g\s*i\s*n\s*a)\s*[:0-9]|(?:=){5,})')

def norm(text):
    s = unicodedata.normalize('NFKD', str(text)).encode('ascii','ignore').decode().lower()
    return ' '.join(re.sub(r'[^a-z0-9]+',' ',s).split())

def fingerprint(q):
    return norm(q['question']) + '||' + '||'.join(sorted(norm(t) for t in q['options'].values()))

def parse_page(text,page):
    positions = list(QSTART.finditer(text))
    rows, errors = [], []
    for i,match in enumerate(positions):
        number = int(match.group(1))
        if number < 1 or number > 103: continue
        part = text[match.end():positions[i+1].start() if i+1<len(positions) else len(text)]
        q = (match.group(2) or match.group(3) or '').strip()
        options = {}
        current = None
        for line in part.splitlines():
            t = line.strip()
            if not t or HEADER.match(t) or t.upper() == 'EXAMEN OBTENCIÓN DEL CAP': continue
            opt = OPTION.match(line) or BARE.match(line) or (UPPER.match(line) if q else None)
            if opt and opt.group(1).upper() not in options:
                current=opt.group(1).upper()
                options[current]=opt.group(2).strip() if opt.lastindex and opt.lastindex>=2 else ''
            elif current:
                options[current] += ' ' + t
            else: q += ' ' + t
        q=' '.join(q.split())
        options={k:' '.join(v.split()) for k,v in options.items()}
        if len(options)!=4 or any(not options.get(k) for k in 'ABCD') or len(q)<5:
            errors.append({'page':page,'number':number,'reason':'transcripcion_incompleta','optionsDetected':list(options)})
        else:
            rows.append({'number':number,'page':page,'question':q,'options':options})
    return rows,errors

# R22: corrections limited to the display text of September 2025.
# The original PDF extraction, 100 sheet letters, answer statuses, bank ids,
# source page, scoring eligibility, and frequency-group hashes remain unchanged.
# Official source:
# https://www.castillalamancha.es/sites/default/files/documentos/pdf/20250929/cap_2025_5a_cuestionarios.pdf
R22_SOURCE_URL = (
    'https://www.castillalamancha.es/sites/default/files/documentos/pdf/'
    '20250929/cap_2025_5a_cuestionarios.pdf'
)
R22_GLYPH_WORDS = {
    'EI': 'El', 'eI': 'el', 'AI': 'Al', 'aI': 'al',
    'Ios': 'los', 'Ias': 'las', 'Ia': 'la', 'Io': 'lo',
}
R22_INTERNAL_I = re.compile(r'(?<=[a-záéíóúüñ])I(?=[a-záéíóúüñ]|\b)')


def r22_normalize_display(text):
    # The PDF's text layer confuses lowercase "l" with uppercase "I".
    # Do not replace a true initial capital I in "Isotermo"/proper names.
    s = R22_INTERNAL_I.sub('l', text)
    for old, new in R22_GLYPH_WORDS.items():
        s = re.sub(r'\b' + old + r'\b', new, s)
    return s


def r22_curate_september_display(exams):
    affected = []
    for meta, rows in exams:
        if meta['id'] != '2025-09-27-mercancias-global':
            continue
        if len(rows) != 100 or not meta['templateFile']:
            raise RuntimeError('R22 requiere 100 preguntas y plantilla Septiembre 2025')
        for row in rows:
            before_question = row['question']
            before_options = dict(row['options'])
            before_scoring = (
                row['correctAnswer'], row['originalSheetAnswer'],
                row['mappedSheetAnswer'], row['bankAnswer'],
                row['answerStatus'], row['frequencyGroup'],
                row['canonicalQuestionId'], row['sourcePage'],
            )
            question = r22_normalize_display(before_question)
            if row['number'] == 3:
                # Exact, independently verified source wording (official PDF
                # page 1): "En razón de la especificidad...", not "en razón a".
                original = 'En razón a la especificidad de su objeto y de su régimen jurídico'
                replacement = 'En razón de la especificidad de su objeto y de su régimen jurídico'
                if original not in question:
                    raise RuntimeError('R22 pregunta 3: el texto esperado ha cambiado')
                question = question.replace(original, replacement, 1)
            options = {key: r22_normalize_display(value)
                       for key, value in before_options.items()}
            if set(options) != set('ABCD'):
                raise RuntimeError('R22 no puede alterar las cuatro alternativas')
            if question != before_question or options != before_options:
                row['question'] = question
                row['options'] = options
                row['textCorrection'] = {
                    'round': 'R22',
                    'sourceOfficialPdf': R22_SOURCE_URL,
                    'sourcePage': row['sourcePage'],
                    'method': ('comparacion_exacta_enunciado_pdf_oficial'
                               if row['number'] == 3
                               else 'normalizacion_glifos_capa_texto_pdf'),
                    'reviewStatus': ('confirmada_redaccion_q3_con_pdf_oficial'
                                     if row['number'] == 3 else
                                     'correccion_mecanica_cotejar_con_imagen_individual'),
                    'originalQuestion': before_question,
                    'originalOptions': before_options,
                    'changedQuestion': question != before_question,
                    'changedOptions': [k for k in 'ABCD'
                                       if options[k] != before_options[k]],
                    'answerKeysChanged': False,
                }
                affected.append(row['number'])
            if before_scoring != (
                row['correctAnswer'], row['originalSheetAnswer'],
                row['mappedSheetAnswer'], row['bankAnswer'],
                row['answerStatus'], row['frequencyGroup'],
                row['canonicalQuestionId'], row['sourcePage'],
            ):
                raise RuntimeError('R22 detecta un cambio prohibido de respuesta o procedencia')
        if 1 not in affected or 2 not in affected or 3 not in affected:
            raise RuntimeError('R22 no corrigio los primeros ejemplos comprobados')
        if rows[0]['options']['A'] != 'El origen y el propietario de los animales.':
            raise RuntimeError('R22 q1: texto oficial no recuperado')
        if rows[1]['options']['A'] != 'Vehículo jaula.':
            raise RuntimeError('R22 q2: texto oficial no recuperado')
        if not rows[2]['question'].startswith(
                'En razón de la especificidad de su objeto y de su régimen jurídico'):
            raise RuntimeError('R22 q3: discrepancia con la pregunta oficial')
        if len(affected) < 50 or len(affected) > 100:
            raise RuntimeError('R22 cantidad de glifos corregidos fuera del rango esperado')
    print('AUDIT R22 Septiembre 2025: textos display corregidos con original conservado:',
          len(affected), 'preguntas', sorted(affected))
    return affected


def generate():
    manifest = json.loads((SRC/'manifest.json').read_text(encoding='utf-8'))['exams']
    keys = json.loads((SRC/'answer_keys_unverified.json').read_text(encoding='utf-8'))
    verified_pdf_keys = json.loads((SRC/'answer_keys_visually_verified.json').read_text(encoding='utf-8'))['exams']
    visual_batch = json.loads((SRC/'visual_batch_candidates_2026_11_05.json').read_text(encoding='utf-8'))['exams']
    if set(visual_batch) & set(verified_pdf_keys): raise RuntimeError('Plantillas duplicadas')
    for exam_id, proof in visual_batch.items():
        proof['fromBatch']=True
        verified_pdf_keys[exam_id]=proof
    verified_pdf_applied = defaultdict(int)
    verified_pdf_bank_matching = defaultdict(int)
    verified_pdf_bank_conflicts = defaultdict(int)
    alignments = json.loads((SRC/'template_alignment_review.json').read_text(encoding='utf-8'))['alignments']
    visual_keys = json.loads((SRC/'answer_key_visual_corrections.json').read_text(encoding='utf-8'))['overrides']
    normative_notes = json.loads((SRC/'normative_conflicts_review.json').read_text(encoding='utf-8'))['reviews']
    corrections = json.loads((SRC/'override_transcriptions_review.json').read_text(encoding='utf-8'))
    official_evidence = json.loads((SRC/'official_public_evidence_2026_11_05.json').read_text(encoding='utf-8'))['cases']
    editorial_source = json.loads((SRC/'editorial_alignment_verified_2023_a.json').read_text(encoding='utf-8'))
    if editorial_source['examId']!='2023-07-29-mercancias-a' or len(editorial_source['approvals'])!=13:
        raise RuntimeError('El expediente editorial del modelo A no está completo')
    editorial_applied=set()
    evidence_applied = set()
    bank = defaultdict(list)
    bank_by_question = defaultdict(list)
    bank_rows = []
    original_count = 0
    for path in (ROOT/'public'/'data'/'questions').glob('*.json'):
        for item in json.loads(path.read_text(encoding='utf-8')):
            bank[fingerprint(item)].append(item)
            bank_by_question[norm(item['question'])].append(item)
            bank_rows.append(item)
            original_count += 1
    if original_count != 8655: raise RuntimeError(f'Banco original no es de 8655 preguntas: {original_count}')
    if OUT.exists():shutil.rmtree(OUT)
    (OUT/'questions').mkdir(parents=True,exist_ok=True)
    exams, warnings = [], []
    all_rows = []
    for meta in manifest:
        exam_id=meta['id']
        path=SRC/'raw'/f'{exam_id}.json'
        parsed=[]
        source_kind=None
        packed=SRC/'raw'/f'{exam_id}.json.xz.b64'
        if path.exists() and packed.exists():
            raise RuntimeError(f'Fuentes duplicadas para {exam_id}')
        if path.exists():
            source=json.loads(path.read_text(encoding='utf-8'))
            source_kind=source.get('kind')
            if source_kind not in (None,'TRANSCRIPCION_VISUAL_PENDIENTE_REVISION'):
                raise RuntimeError(f'Formato raw sin reconocer: {exam_id}: {source_kind}')
            if source_kind:
                if source.get('id')!=exam_id or source.get('sourcePdf')!=meta.get('sourcePdf'):
                    raise RuntimeError(f'Procedencia visual inconsistente: {exam_id}')
                if (source.get('pageStart'),source.get('pageEnd')) != (meta['sourcePageStart'],meta['sourcePageEnd']):
                    raise RuntimeError(f'Rango de páginas visual inconsistente: {exam_id}')
            for page in source['pages']:
                # Algunos raw históricos anteriores conservan bloques de
                # preámbulo p0. No cambiar retroactivamente su interpretación.
                if source_kind and not (meta['sourcePageStart']<=page['page']<=meta['sourcePageEnd']):
                    raise RuntimeError(f'Página visual fuera del manifiesto: {exam_id} p{page["page"]}')
                rows,bad=parse_page(page['text'],page['page'])
                if source_kind:
                    # La transcripción visual es material provisional, no texto
                    # original validado ni reconocimiento OCR verificado.
                    for row in rows:
                        row['transcriptionReview']=True
                        row['sourceMethod']='LECTURA_VISUAL_PDF_PENDIENTE_REVISION'
                parsed.extend(rows)
                warnings += [{'examId':exam_id,**item} for item in bad]
        elif packed.exists():
            # Source OCR scans are NOT validated as official text. All OCR rows
            # are prominently marked for editorial review, even if the bank matches.
            decoded=lzma.decompress(base64.b64decode(packed.read_text(encoding='ascii')))
            source=json.loads(decoded.decode('utf-8'))
            if source.get('kind')!='OCR_PARA_REVISION' or source.get('examId')!=exam_id:
                raise RuntimeError(f'Metadatos de OCR inválidos: {exam_id}')
            numbers=[]
            for cols in source['rows']:
                if len(cols)!=7:raise RuntimeError(f'Fila OCR incompleta: {exam_id}')
                page,num,question,a,b,c,d=cols
                if not all(isinstance(z,str) and len(z.strip())>=1 for z in (question,a,b,c,d)):
                    raise RuntimeError(f'Texto OCR vacío: {exam_id} q{num}')
                if not (meta['sourcePageStart']<=page<=meta['sourcePageEnd']):
                    raise RuntimeError(f'Página OCR fuera de rango: {exam_id} q{num}')
                if not (1<=num<=100) or num in numbers:
                    raise RuntimeError(f'Número OCR repetido o de reserva: {exam_id} q{num}')
                numbers.append(num)
                parsed.append({'number':num,'page':page,'question':question,
                  'options':dict(zip('ABCD',(a,b,c,d))),
                  'transcriptionReview':True,'sourceMethod':source.get('ocr','OCR')})
            if numbers!=list(range(1,101)):
                raise RuntimeError(f'Examen OCR incompleto: {exam_id}, {len(numbers)}/100')
        # Keep staged visual transcripts in version control, but DO NOT
        # publish incomplete exams or count their questions/frequencies.
        # They become visible only when all main 100 questions are present.
        if source_kind=='TRANSCRIPCION_VISUAL_PENDIENTE_REVISION' and 0<len(parsed)<100:
            warnings.append({'examId':exam_id,'reason':'transcripcion_visual_en_preparacion',
                             'count':len(parsed),'expected':100})
            parsed=[]
        overrides=corrections.get(exam_id,{})
        parsed=[q for q in parsed if str(q['number']) not in overrides]+list(overrides.values())
        by_num={}
        for q in parsed:
            if q['number'] not in by_num: by_num[q['number']]=q
            else: warnings.append({'examId':exam_id,'number':q['number'],'reason':'numero_repetido'})
        parsed=[by_num[n] for n in range(1,101) if n in by_num]
        if (path.exists() or packed.exists()) and len(parsed)!=100:
            warnings.append({'examId':exam_id,'reason':'examen_incompleto','count':len(parsed),
                             'missing':[n for n in range(1,101) if n not in by_num]})
        local=[]
        template=keys.get(exam_id,'')
        template_verified=verified_pdf_keys.get(exam_id)
        verified_limit=template_verified.get('verifiedQuestionEnd',100) if template_verified else 0
        if template_verified:
            if (template_verified['sourceFile']!=meta.get('templateFile')
                or template_verified['category']!=meta['category']
                or template_verified['model']!=meta['model']):
                raise RuntimeError(f'Plantilla PDF verificada no corresponde al examen {exam_id}')
            if (len(template_verified['correctAnswers'])!=100
                or set(template_verified['correctAnswers'])-set('ABCD')
                or len(template_verified['sourcePdfSha256'])!=64):
                raise RuntimeError(f'Clave visual PDF inválida en {exam_id}')
            if template:
                if not template_verified.get('fromBatch') or len(template)!=100:
                    raise RuntimeError(f'Clave provisional duplicada no auditada: {exam_id}')
                expected_diff=template_verified.get('allowedOldExtractionDifferences',[])
                actual_diff=[n for n in range(1,101) if template[n-1]!=template_verified['correctAnswers'][n-1]]
                if actual_diff!=expected_diff:
                    raise RuntimeError(f'Diferencias no cotejadas con PDF original: {exam_id} {actual_diff}')
            if alignments.get(exam_id) and not (exam_id=='2023-07-29-mercancias-a' and verified_limit==43):
                raise RuntimeError(f'Alineación provisional incompatible con validación completa: {exam_id}')

        for q in parsed:
            matching=bank.get(fingerprint(q),[])
            method='pregunta_y_cuatro_opciones_exactas' if matching else 'sin_coincidencia'
            mapped=set()
            if not matching:
                # Rescate conservador: enunciado igual, y el texto de la respuesta
                # debe encontrarse de manera única en las opciones del examen.
                # TODOS los candidatos del banco con ese enunciado deben coincidir.
                candidates=bank_by_question.get(norm(q['question']),[])
                proposed=set()
                consistent=bool(candidates)
                for candidate in candidates:
                    answer_text=norm(candidate['options'][candidate['correctAnswer']])
                    letters=[letter for letter,value in q['options'].items() if norm(value)==answer_text]
                    if len(letters)!=1:
                        consistent=False
                        break
                    proposed.add(letters[0])
                if consistent and len(proposed)==1:
                    matching=candidates
                    method='enunciado_y_texto_respuesta_exactos'
            for b in matching:
                wanted=norm(b['options'][b['correctAnswer']])
                mapped.update(k for k,v in q['options'].items() if norm(v)==wanted)
            inferred=next(iter(mapped)) if len(mapped)==1 else None
            original_number=q['number']
            original_letter=template[original_number-1] if len(template)>=original_number else None
            if original_letter not in ('A','B','C','D'):original_letter=None
            # The original scanned answer sheet must stay unchanged. Any
            # offset is explicit, limited, and treated as provisional evidence.
            template_number=original_number
            align_status='sin_ajuste'
            for rule in alignments.get(exam_id,{}).get('rules',[]):
                if rule['questionStart']<=original_number<=rule['questionEnd']:
                    offset=rule['templateNumberOffset']
                    template_number=original_number+offset if offset is not None else None
                    align_status=('sin_ajuste' if offset==0
                                  else 'alineacion_provisional_pendiente_revision')
                    break
            letter=(template[template_number-1]
                    if template_number is not None and 1<=template_number<=len(template)
                    else None)
            if letter not in ('A','B','C','D'):letter=None
            visual_fix=visual_keys.get(exam_id,{}).get(str(original_number))
            visual_status='sin_correccion_visual'
            if visual_fix:
                if template_number!=original_number:
                    raise RuntimeError(f'No mezclar ajustes posicionales y visuales en {exam_id} q{original_number}')
                if original_letter!=visual_fix['expectedExtracted']:
                    raise RuntimeError(f'La letra original cambió en {exam_id} q{original_number}: '
                                       f"{original_letter} vs {visual_fix['expectedExtracted']}")
                letter=visual_fix['verifiedLetter']
                if letter not in ('A','B','C','D'):
                    raise RuntimeError(f'Corrección de letra inválida en {exam_id} q{original_number}')
                visual_status='correccion_visual_documentada_pendiente_revision_editorial'
            if len(mapped)>1: status='conflicto_banco'
            elif inferred and letter and inferred!=letter: status='conflicto_plantilla_banco'
            elif inferred and letter:
                if visual_fix:
                    status='coincidencia_plantilla_corregida_visual_pendiente_revision'
                elif align_status!='sin_ajuste':
                    status='coincidencia_alineacion_provisional_pendiente_revision'
                else:
                    status='coincidencia_automatica' if method=='pregunta_y_cuatro_opciones_exactas' else 'coincidencia_enunciado_banco_plantilla_pendiente_revision'
            elif inferred:
                status='respuesta_banco_pendiente_revision' if method=='pregunta_y_cuatro_opciones_exactas' else 'respuesta_banco_enunciado_pendiente_revision'
            elif letter:status=('solo_plantilla_alineada_pendiente_cotejo' if align_status!='sin_ajuste' else 'solo_plantilla_pendiente_cotejo')
            else:status='sin_respuesta_verificada'
            original=matching[0] if matching and len(mapped)==1 else None
            key=fingerprint(q)
            group='b:'+original['code'] if original else 't:'+sha256(key.encode()).hexdigest()[:18]
            answer=inferred if status in ('coincidencia_automatica','coincidencia_alineacion_provisional_pendiente_revision','coincidencia_plantilla_corregida_visual_pendiente_revision','respuesta_banco_pendiente_revision',
                                           'coincidencia_enunciado_banco_plantilla_pendiente_revision',
                                           'respuesta_banco_enunciado_pendiente_revision') else None
            # A direct visual read of the actual answer-sheet PDF takes precedence
            # over inferred bank solutions, but a conflict stops the entire build.
            verified_pdf=False
            if template_verified and original_number<=verified_limit:
                visual_letter=template_verified['correctAnswers'][original_number-1]
                hold=template_verified.get('holdConflicts',{}).get(str(original_number))
                disagreement=len(mapped)>1 or (inferred and inferred!=visual_letter)
                if disagreement:
                    if not hold or hold['pdfAnswer']!=visual_letter or hold['bankAnswer']!=inferred:
                        raise RuntimeError(f'Conflicto no documentado entre plantilla PDF y banco: {exam_id} pregunta {original_number}')
                    verified_pdf_bank_conflicts[exam_id]+=1
                elif hold:
                    raise RuntimeError(f'Conflicto antiguo ya no presente y sigue bloqueado: {exam_id} pregunta {original_number}')
                if visual_fix and not (template_verified.get('fromBatch') and visual_fix['verifiedLetter']==visual_letter):
                    raise RuntimeError(f'Corrección visual previa incompatible con plantilla completa: {exam_id} q{original_number}')
                letter=visual_letter
                original_letter=visual_letter
                template_number=original_number
                align_status='sin_ajuste'
                visual_status='plantilla_pdf_original_verificada'
                status='conflicto_pdf_original_banco_pendiente_cotejo_enunciado' if disagreement else 'plantilla_pdf_oficial_verificada'
                answer=None if disagreement else visual_letter
                verified_pdf=True
                verified_pdf_applied[exam_id]+=1
                if inferred and not disagreement: verified_pdf_bank_matching[exam_id]+=1
            public_evidence=official_evidence.get(exam_id+':'+str(original_number))
            evidence_url=''
            evidence_source=''
            if public_evidence:
                evidence_id=exam_id+':'+str(original_number)
                if not verified_pdf and (answer is not None or status not in (
                    'sin_respuesta_verificada','solo_plantilla_pendiente_cotejo',
                    'solo_plantilla_alineada_pendiente_cotejo')):
                    raise RuntimeError(f'No sobrescribir una respuesta ya cotejada: {evidence_id}')
                if (public_evidence['examId']!=exam_id
                    or public_evidence['number']!=original_number
                    or public_evidence['sourcePage']!=q['page']
                    or norm(public_evidence['expectedQuestion'])!=norm(q['question'])):
                    raise RuntimeError(f'La pregunta pública documentada no corresponde a la fuente: {evidence_id}')
                expected_text=norm(public_evidence['correctAnswerText'])
                evidence_letters=[k for k,v in q['options'].items() if norm(v)==expected_text]
                if len(evidence_letters)!=1:
                    raise RuntimeError(f'La respuesta pública no aparece exactamente una vez en el examen: {evidence_id}')
                if letter and letter!=evidence_letters[0]:
                    raise RuntimeError(f'Conflicto entre plantilla y fuente pública: {evidence_id}')
                if public_evidence['sourceKind']!='fuente_publica_oficial_independiente':
                    raise RuntimeError(f'Fuente pública no clasificada: {evidence_id}')
                if public_evidence['editorialReviewRequired'] is not True:
                    raise RuntimeError(f'La verificación editorial debe seguir pendiente: {evidence_id}')
                if verified_pdf:
                    if answer!=evidence_letters[0] or status!='plantilla_pdf_oficial_verificada':
                        raise RuntimeError(f'Conflicto entre plantilla PDF original y fuente pública: {evidence_id}')
                    # El PDF propio ya verifica la clave; la DGT solo añade una segunda fuente.
                else:
                    answer=evidence_letters[0]
                    status='respuesta_fuente_publica_oficial_pendiente_plantilla'
                evidence_url=public_evidence['sourceUrl']
                evidence_source=public_evidence['officialSource']
                evidence_applied.add(evidence_id)
            editorial = (editorial_source['approvals'].get(str(original_number))
                         if exam_id==editorial_source['examId'] else None)
            if editorial:
                evidence_id=f'{exam_id}:{original_number}'
                if status!='solo_plantilla_alineada_pendiente_cotejo' or answer is not None:
                    raise RuntimeError(f'La resolución editorial sobrescribe una respuesta válida: {evidence_id}')
                if (not template_verified or not template_verified.get('fromBatch')
                    or editorial_source['sourceTemplateSha256']!=template_verified['sourcePdfSha256']
                    or q['page']!=editorial['sourcePage']
                    or original_number!=editorial['number']
                    or norm(q['question'])!=norm(editorial['expectedQuestion'])
                    or norm(q['options'][letter])!=norm(editorial['expectedAnswerText'])
                    or letter!=editorial['approvedAnswer']
                    or template_number!=editorial['templateNumberUsed']
                    or template_number!=original_number+1
                    or align_status!='alineacion_provisional_pendiente_revision'):
                    raise RuntimeError(f'Resolución editorial incompatible con PDF original: {evidence_id}')
                answer=letter
                status='respuesta_alineacion_editorial_confirmada'
                editorial_applied.add(original_number)
            # Preserve the 100 printed letters from every original answer PDF
            # separately from scored answers, bank inferences and editorial mapping.
            # In particular July 2023 A needs its printed n and mapped n+1
            # to remain distinct; never silently rewrite the official sheet.
            source_pdf_answer=(template_verified['correctAnswers'][original_number-1]
                               if template_verified else None)
            source_pdf_verified=bool(template_verified)
            if source_pdf_verified and source_pdf_answer not in 'ABCD':
                raise RuntimeError(f'Falta respuesta impresa: {exam_id} q{original_number}')
            mapped_pdf_answer=(template_verified['correctAnswers'][template_number-1]
                               if template_verified and template_number is not None
                               and 1<=template_number<=100 else None)
            if (source_pdf_verified and (meta.get('templateFile')!=template_verified['sourceFile']
                or q['number']!=original_number)):
                raise RuntimeError(f'Fuente visual desalineada: {exam_id} q{original_number}')
            dispute=template_verified.get('holdConflicts',{}).get(str(original_number)) if template_verified else None
            if bool(dispute)!=(status=='conflicto_pdf_original_banco_pendiente_cotejo_enunciado'):
                raise RuntimeError(f'Estado de contradicción desfasado: {exam_id} q{original_number}')
            local.append({**q,'examId':exam_id,'date':meta['date'],'category':meta['category'],'model':meta['model'],
              'id':original['id'] if original else 'cap-'+sha256(key.encode()).hexdigest()[:24],
              'canonicalQuestionId':original['id'] if original else None,'canonicalCode':original['code'] if original else None,
              'section':original['section'] if original else 'CAP-'+meta['category'],
              'code':original['code'] if original else ('CAP-'+exam_id+'-'+str(q['number'])),
              'norm':original.get('norm','') if original else '',
              'reference':original.get('reference','') if original else '',
              'questionnaireId':original['questionnaireId'] if original else 'examenes-cap',
              'correctAnswer':answer,'bankAnswer':inferred,'templateAnswer':letter,
              'originalSheetAnswer':source_pdf_answer,
              'originalSheetQuestionNumber':original_number if source_pdf_verified else None,
              'originalSheetSourceFile':template_verified['sourceFile'] if source_pdf_verified else None,
              'originalSheetSha256':template_verified['sourcePdfSha256'] if source_pdf_verified else None,
              'mappedSheetAnswer':mapped_pdf_answer,
              'mappedSheetQuestionNumber':template_number if source_pdf_verified else None,
              'answerDispute':dispute,
              'scoringEligible':answer in ('A','B','C','D'),
              'rawTemplateAnswer':original_letter,'templateNumberUsed':template_number,
              'templateAlignmentStatus':align_status,'templateVisualCorrectionStatus':visual_status,
              'answerStatus':status,'matchMethod':method,'sourcePage':q['page'],'frequencyGroup':group,
              'reviewRequired':bool(q.get('transcriptionReview')) or status not in ('coincidencia_automatica','plantilla_pdf_oficial_verificada'),
              'answerEditoriallyVerified':bool(editorial),
              'answerEditorialEvidence':editorial['verificationMethod'] if editorial else '',
              'answerEvidenceUrl':evidence_url,
              'answerEvidenceSource':evidence_source,
              'answerTemplateOfficiallyVerified':True if verified_pdf else (False if public_evidence else None),
              'answerTemplateSourceSha256':template_verified['sourcePdfSha256'] if verified_pdf else ''})
        exams.append((meta,local))
        all_rows.extend(local)
    if editorial_applied != {int(n) for n in editorial_source['approvals']}:
        raise RuntimeError('Faltan aprobaciones editoriales: '
                           +str({int(n) for n in editorial_source['approvals']}-editorial_applied))
    print('AUDIT editorial verified July 2023 A:',sorted(editorial_applied))
    for verified_exam, proof in verified_pdf_keys.items():
        expected_verified=proof.get('verifiedQuestionEnd',100)
        if verified_pdf_applied[verified_exam]!=expected_verified:
            raise RuntimeError(f'Plantilla PDF visual incompleta: {verified_exam}: {verified_pdf_applied[verified_exam]} vs {expected_verified}')
        if verified_pdf_bank_matching[verified_exam]!=proof['expectedBankConcordances']:
            raise RuntimeError(f'Concordancias visuales con banco diferentes a lo auditado: {verified_exam}')
        if verified_pdf_bank_conflicts[verified_exam]!=proof.get('expectedBankConflicts',0):
            raise RuntimeError(f'Conflictos visuales con banco distintos a lo auditado: {verified_exam}')
    print('AUDIT visual verified PDF keys:',dict(verified_pdf_applied),'bank concordances',
          dict(verified_pdf_bank_matching),'documented conflicts',dict(verified_pdf_bank_conflicts))
    if evidence_applied != set(official_evidence):
        raise RuntimeError(f'Evidencia oficial sin aplicar: {set(official_evidence)-evidence_applied}')
    r22_curate_september_display(exams)
    # The denominator uses only complete textual exam models, not missing scans.
    denomination=Counter(meta['category'] for meta,rows in exams if rows)
    appears=defaultdict(set)
    for item in all_rows:appears[(item['category'],item['frequencyGroup'])].add(item['examId'])
    frequency_by_bank={}
    for row in all_rows:
        if row['canonicalQuestionId'] and row['category']=='mercancias':
            frequency_by_bank[row['canonicalQuestionId']]={
                'count':len(appears[(row['category'],row['frequencyGroup'])]),
                'denominator':denomination[row['category']],
                'category':row['category']
            }
    (OUT/'frequency_by_bank.json').write_text(json.dumps(frequency_by_bank,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    index=[]
    statuses=Counter()
    for meta,rows in exams:
        for row in rows:
            row['examFrequency']=len(appears[(row['category'],row['frequencyGroup'])])
            row['examFrequencyDenominator']=denomination[row['category']]
            statuses[row['answerStatus']]+=1
        ready=sum(row['correctAnswer'] in ('A','B','C','D') for row in rows)
        original_sheet_count=sum(row['originalSheetAnswer'] in ('A','B','C','D') for row in rows)
        if bool(meta.get('templateFile')) != (original_sheet_count==100):
            raise RuntimeError(f'Cobertura hoja PDF distinta de 100 o cero: {meta["id"]}')
        if sum(bool(row['answerDispute']) for row in rows) != sum(
                row['answerStatus']=='conflicto_pdf_original_banco_pendiente_cotejo_enunciado' for row in rows):
            raise RuntimeError(f'Conflictos no indexados: {meta["id"]}')
        (OUT/'questions'/f"{meta['id']}.json").write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        index.append({**meta,'originalSheetAnswersCount':original_sheet_count,
            'disputedCount':sum(bool(row['answerDispute']) for row in rows),
            'scoringEligibleCount':ready,
            'hasOriginalAnswerSheet':original_sheet_count==100,
            'count':len(rows),'expectedCount':100,'readyCount':ready,'path':f"data/exams/questions/{meta['id']}.json",
           'status':'practicable_pendiente_auditoria' if len(rows)==100 and ready==100
            else ('parcial_en_revision' if rows else 'pendiente_transcripcion')})
    # Editable review queue for editorial verification; never auto-resolve a conflict.
    by_id={meta['id']:meta for meta,_ in exams}
    priority={'conflicto_banco':0,'conflicto_plantilla_banco':0,
              'solo_plantilla_pendiente_cotejo':1,
              'solo_plantilla_alineada_pendiente_cotejo':1,
              'sin_respuesta_verificada':2,
              'respuesta_fuente_publica_oficial_pendiente_plantilla':3,
              'coincidencia_alineacion_provisional_pendiente_revision':3,
              'coincidencia_plantilla_corregida_visual_pendiente_revision':3,
              'coincidencia_enunciado_banco_plantilla_pendiente_revision':3,
              'respuesta_banco_enunciado_pendiente_revision':3,
              'respuesta_banco_pendiente_revision':3,'coincidencia_automatica':4}
    review=[]
    for row in all_rows:
        if not row['reviewRequired']: continue
        meta=by_id[row['examId']]
        review.append({
          'examId':row['examId'],'date':row['date'],'category':row['category'],'model':row['model'],
          'number':row['number'],'page':row['sourcePage'],'status':row['answerStatus'],
          'matchMethod':row['matchMethod'],
          'answerEvidenceUrl':row.get('answerEvidenceUrl',''),
          'answerEvidenceSource':row.get('answerEvidenceSource',''),
          'question':row['question'],'bankAnswer':row['bankAnswer'],'templateAnswer':row['templateAnswer'],
          'rawTemplateAnswer':row['rawTemplateAnswer'],
          'templateNumberUsed':row['templateNumberUsed'],
          'templateAlignmentStatus':row['templateAlignmentStatus'],
          'templateVisualCorrectionStatus':row['templateVisualCorrectionStatus'],
          'bankAnswerText':row['options'].get(row['bankAnswer'] or '', ''),
          'templateAnswerText':row['options'].get(row['templateAnswer'] or '', ''),
          'canonicalCode':row['canonicalCode'] or '', 'templateFile':meta.get('templateFile') or '',
          'transcriptionReview':bool(row.get('transcriptionReview')),
          'sourceMethod':row.get('sourceMethod',''),
          'optionA':row['options']['A'],'optionB':row['options']['B'],
          'optionC':row['options']['C'],'optionD':row['options']['D'],
          'normativeSuggestedAnswer':normative_notes.get(
              row['examId']+':'+str(row['number']),{}).get('suggestedAnswer',''),
          'normativeSourceUrl':normative_notes.get(
              row['examId']+':'+str(row['number']),{}).get('url',''),
          'normativeStatus':normative_notes.get(
              row['examId']+':'+str(row['number']),{}).get('status','')
        })
    review.sort(key=lambda r:(priority.get(r['status'],5),r['date'],r['model'],r['number']))
    (OUT/'review_queue.json').write_text(json.dumps(review,ensure_ascii=False,indent=2),encoding='utf-8')
    with (OUT/'review_queue.csv').open('w',encoding='utf-8-sig',newline='') as fh:
        writer=csv.DictWriter(fh,fieldnames=list(review[0]) if review else ['examId','status'])
        writer.writeheader()
        writer.writerows(review)

    # Review support: repeated, independently aligned templates across exam models.
    # The evidence is advisory only: no answer status is changed by this report.
    same_bank_group=defaultdict(list)
    for row in all_rows:
        if row['canonicalCode'] and row['answerStatus']=='coincidencia_automatica':
            same_bank_group[(row['category'],row['canonicalCode'])].append(row)
    for row in review:
        supporters=[item for item in same_bank_group.get((row['category'],row['canonicalCode']),[])
                    if item['examId']!=row['examId']] if row['canonicalCode'] else []
        row['independentSupportingModels']=len({item['examId'] for item in supporters})
        row['supportingExamIds']=' | '.join(sorted({item['examId'] for item in supporters}))
        row['evidenceScope']='solo_misma_modalidad'
    (OUT/'review_queue.json').write_text(json.dumps(review,ensure_ascii=False,indent=2),encoding='utf-8')
    with (OUT/'review_queue.csv').open('w',encoding='utf-8-sig',newline='') as fh:
        writer=csv.DictWriter(fh,fieldnames=list(review[0]) if review else ['examId','status'])
        writer.writeheader()
        writer.writerows(review)

    # Complete, traceable before/after mapping for the anomalous 2023-A key.
    # This report contains proposed alignment, NOT approved corrections.
    aligned_rows=[]
    for row in all_rows:
        if row['examId']!='2023-07-29-mercancias-a':continue
        supporters=[x for x in same_bank_group.get((row['category'],row['canonicalCode']),[])
                    if x['examId']!=row['examId']] if row['canonicalCode'] else []
        aligned_rows.append({
          'examId':row['examId'],'number':row['number'],'sourcePage':row['sourcePage'],
          'question':row['question'],
          'originalTemplateNumber':row['number'],'originalTemplateLetter':row['rawTemplateAnswer'],
          'candidateTemplateNumber':row['templateNumberUsed'],'candidateTemplateLetter':row['templateAnswer'],
          'bankLetter':row['bankAnswer'],'bankCode':row['canonicalCode'] or '',
          'matchMethod':row['matchMethod'],'answerStatus':row['answerStatus'],
          'reviewRequired':row['reviewRequired'],
          'independentConfirmedModels':len({x['examId'] for x in supporters}),
          'independentExamIds':' | '.join(sorted({x['examId'] for x in supporters})),
          'optionA':row['options']['A'],'optionB':row['options']['B'],
          'optionC':row['options']['C'],'optionD':row['options']['D']
        })
    assert len(aligned_rows)==100
    with (OUT/'alignment_2023_a_review.csv').open('w',encoding='utf-8-sig',newline='') as fh:
        writer=csv.DictWriter(fh,fieldnames=list(aligned_rows[0]))
        writer.writeheader()
        writer.writerows(aligned_rows)
    print('AUDIT remaining conflicts:',
          [(q['examId'],q['number'],q['sourcePage'],q['bankAnswer'],
            q['rawTemplateAnswer'],q['templateAnswer'],
            q['question'][:80]) for q in all_rows if q['answerStatus'] in
           ('conflicto_plantilla_banco','conflicto_banco')])

    # A reviewer-friendly copy of all 100 OCR questions, with full option text.
    # This never approves an OCR transcription or promotes an answer.
    ocr_review=[item for item in review
                if item['examId']=='2025-07-26-mercancias-a']
    if len(ocr_review)!=100 or not all(item['transcriptionReview'] for item in ocr_review):
        raise RuntimeError('Se requieren 100 preguntas OCR pendientes de revisión')
    ocr_review.sort(key=lambda item:item['number'])
    with (OUT/'ocr_2025_a_review.csv').open('w',encoding='utf-8-sig',newline='') as fh:
        writer=csv.DictWriter(fh,fieldnames=list(ocr_review[0]))
        writer.writeheader()
        writer.writerows(ocr_review)
    print('AUDIT OCR 2025A candidate answers:',sum(
        q['bankAnswer'] in ('A','B','C','D') for q in ocr_review),
        'out of',len(ocr_review))

    # Suggestions for manual inspection, not new keys. An imperfect transcription
    # or paraphrase may be close to many bank questions. NEVER autocorrect from this list.
    stop={'que','con','por','para','del','los','las','una','uno','un','de','el','la','en','al',
          'es','se','si','su','sus','como','cual','cuales','cuando','entre','mas','sobre'}
    question_index=defaultdict(set)
    indexed=[]
    for i,item in enumerate(bank_rows):
        tokens=set(norm(item['question']).split())-stop
        indexed.append((item,tokens))
        for token in tokens:
            if len(token)>3: question_index[token].add(i)
    review_hints=[]
    row_lookup={(q['examId'],q['number']):q for q in all_rows}
    unresolved={'solo_plantilla_pendiente_cotejo','solo_plantilla_alineada_pendiente_cotejo','sin_respuesta_verificada',
                'conflicto_plantilla_banco','conflicto_banco'}
    for row in review:
        if row['status'] not in unresolved:continue
        query=norm(row['question'])
        tokens={tok for tok in query.split() if len(tok)>3}-stop
        hits=Counter()
        for token in tokens:
            ids=question_index.get(token,set())
            if len(ids)<1000: hits.update(ids)
        shortlisted=[idx for idx,_ in hits.most_common(55)]
        exam_question=row_lookup.get((row['examId'],row['number']),{})
        question_options={norm(v) for v in exam_question.get('options',{}).values()}
        ranked=[]
        for idx in shortlisted:
            item,candidate_tokens=indexed[idx]
            similarity=SequenceMatcher(None,query,norm(item['question'])).ratio()
            bank_options={norm(v) for v in item['options'].values()}
            overlap=len(bank_options & question_options)/4
            score=round(0.78*similarity+0.22*overlap,3)
            if score<0.52:continue
            ranked.append((score,item,similarity,overlap))
        for rank,(score,item,sim,overlap) in enumerate(sorted(ranked,key=lambda r:-r[0])[:3],1):
            review_hints.append({
                'examId':row['examId'],'number':row['number'],'category':row['category'],
                'status':row['status'],'candidateRank':rank,
                'candidateCode':item['code'],'candidateQuestion':item['question'],
                'candidateAnswerText':item['options'][item['correctAnswer']],
                'candidateReference':item.get('reference',''),
                'candidateScore':score,'questionSimilarity':round(sim,3),
                'optionOverlap':round(overlap,3),
                'approved':False,'usage':'SUGERENCIA_REVISION_NO_AUTOCORREGIR'
            })
    (OUT/'review_hints.json').write_text(json.dumps(review_hints,ensure_ascii=False,indent=2),encoding='utf-8')
    with (OUT/'review_hints.csv').open('w',encoding='utf-8-sig',newline='') as fh:
        writer=csv.DictWriter(fh,fieldnames=list(review_hints[0]) if review_hints else ['examId','number'])
        writer.writeheader()
        writer.writerows(review_hints)
    print('AUDIT review suggestions:',len(review_hints),
          'questions with suggestions:',len({(x['examId'],x['number']) for x in review_hints}))

    # Additional cross-model evidence for unresolved questions. This is a review
    # queue only: the result must NEVER change correctAnswer or published scoring.
    # A different position of an identical answer is mapped by exact option TEXT,
    # not by copying an A/B/C/D letter from another exam.
    by_exact_fingerprint=defaultdict(list)
    for existing in all_rows:
        by_exact_fingerprint[(existing['category'], fingerprint(existing))].append(existing)
    pending_total=sum(row['correctAnswer'] is None for row in all_rows)
    cross_model_queue=[]
    for unresolved_row in all_rows:
        if unresolved_row['correctAnswer'] is not None:
            continue
        others=[candidate for candidate in by_exact_fingerprint[
            (unresolved_row['category'],fingerprint(unresolved_row))]
            if candidate['examId']!=unresolved_row['examId']]
        if not others:
            continue
        evidence=[]
        for other in others:
            # Only a directly positioned template (never a shifted/visually
            # corrected or already-conflicting key) can be candidate evidence.
            if other['templateAnswer'] not in ('A','B','C','D'):
                continue
            if other['templateAlignmentStatus']!='sin_ajuste':
                continue
            if other['templateVisualCorrectionStatus']!='sin_correccion_visual':
                continue
            if other['answerStatus'] in ('conflicto_banco','conflicto_plantilla_banco'):
                continue
            answer_text=norm(other['options'][other['templateAnswer']])
            positions=[k for k,v in unresolved_row['options'].items() if norm(v)==answer_text]
            if len(positions)!=1:
                continue
            evidence.append({
                'examId':other['examId'],
                'number':other['number'],
                'sourcePage':other['sourcePage'],
                'candidateLetterInTarget':positions[0],
                'templateLetterInSource':other['templateAnswer'],
                'templateFile':by_id[other['examId']].get('templateFile') or '',
                'sourceStatus':other['answerStatus'],
                'transcriptionReview':bool(other.get('transcriptionReview')),
            })
        # One source model counts only once. Contradictory template positions
        # are kept visible for editorial review, never majority-voted.
        letters=set(item['candidateLetterInTarget'] for item in evidence)
        unique_models=len(set(item['examId'] for item in evidence))
        if len(letters)>1:
            status='contradiccion_plantillas_bloqueada'
            candidate_letter=None
        elif unique_models>=2:
            status='consenso_multimodelo_pendiente_revision'
            candidate_letter=next(iter(letters))
        elif unique_models==1:
            status='una_plantilla_pendiente_revision'
            candidate_letter=next(iter(letters))
        else:
            status='repeticion_sin_plantilla_comparable'
            candidate_letter=None
        cross_model_queue.append({
            'examId':unresolved_row['examId'],
            'number':unresolved_row['number'],
            'category':unresolved_row['category'],
            'sourcePage':unresolved_row['sourcePage'],
            'question':unresolved_row['question'],
            'originalStatus':unresolved_row['answerStatus'],
            'exactRepeatedModels':sorted(set(item['examId'] for item in others)),
            'reviewStatus':status,
            'candidateLetterUnapproved':candidate_letter,
            'candidateAnswerTextUnapproved':(
                unresolved_row['options'][candidate_letter] if candidate_letter else ''),
            'supportingModels':unique_models,
            'supportingTemplateRows':evidence,
            'approved':False,
            'willAffectCorrectAnswer':False,
            'usage':'SOLO_REVISION_NO_AUTOCORREGIR'
        })
    review_order={
        'contradiccion_plantillas_bloqueada':0,
        'consenso_multimodelo_pendiente_revision':1,
        'una_plantilla_pendiente_revision':2,
        'repeticion_sin_plantilla_comparable':3,
    }
    cross_model_queue.sort(key=lambda item:(
        review_order[item['reviewStatus']],-item['supportingModels'],
        item['examId'],item['number']))
    cross_summary=dict(Counter(item['reviewStatus'] for item in cross_model_queue))
    (OUT/'cross_model_pending_review.json').write_text(json.dumps({
        'schemaVersion':1,
        'purpose':'Coincidencias de preguntas pendientes entre exámenes; no valida respuestas ni modifica puntuación.',
        'totalUnscoredBeforeAndAfter':pending_total,
        'exactRepeatCases':len(cross_model_queue),
        'statusCounts':cross_summary,
        'items':cross_model_queue,
    },ensure_ascii=False,indent=2),encoding='utf-8')
    with (OUT/'cross_model_pending_review.csv').open('w',encoding='utf-8-sig',newline='') as fh:
        fields=['examId','number','category','sourcePage','originalStatus','reviewStatus',
                'candidateLetterUnapproved','candidateAnswerTextUnapproved',
                'supportingModels','exactRepeatedModels','question','approved','willAffectCorrectAnswer']
        writer=csv.DictWriter(fh,fieldnames=fields)
        writer.writeheader()
        for entry in cross_model_queue:
            writer.writerow({**{field:entry.get(field,'') for field in fields},
                             'exactRepeatedModels':' | '.join(entry['exactRepeatedModels'])})
    print('AUDIT independently sourced public answers:',len(evidence_applied),sorted(evidence_applied))
    print('AUDIT cross-model pending:',pending_total,'unscored,',
          len(cross_model_queue),'exact repetitions,',cross_summary)

    (OUT/'index.json').write_text(json.dumps({
      'version':'2026-11-04-auditoria','totalExamModels':len(index),'totalImportedQuestions':len(all_rows),
      'categoryCounts':dict(denomination),'exams':index,'answerStatuses':dict(statuses),'warnings':warnings,
      'frequencyExplanation':'Apariciones por modelo de examen transcrito, nunca una predicción de la siguiente prueba.'
    },ensure_ascii=False,indent=2),encoding='utf-8')
    print(f"CAP audit: {len(index)} examenes, {len(all_rows)} preguntas, {dict(statuses)}, pendientes {len(warnings)}")
    print('AUDIT visual letter corrections:', [
        (r['examId'],r['number'],r['rawTemplateAnswer'],r['templateAnswer'],r['bankAnswer'])
        for r in all_rows if r['templateVisualCorrectionStatus']!='sin_correccion_visual'
    ])
    print('AUDIT provisional alignment status:',dict(Counter(
        q['answerStatus'] for q in all_rows if q['templateAlignmentStatus']!='sin_ajuste')))
    print('AUDIT conflict distribution:', dict(Counter(
        q['examId'] for q in all_rows if q['answerStatus'] in
        ('conflicto_banco','conflicto_plantilla_banco'))))
    print('AUDIT coverage per category:',dict(Counter(q['category'] for q in all_rows)))
    print('AUDIT corrected per category:',dict(Counter(
        q['category'] for q in all_rows if q['correctAnswer'] in ('A','B','C','D'))))
    print('AUDIT rescued by exact question and answer text:',
          sum(q['matchMethod']=='enunciado_y_texto_respuesta_exactos' for q in all_rows))
    print('AUDIT incomplete models:',[(e['id'],e['count']) for e in index if e['count'] not in (0,100)])
    print('AUDIT parse warnings:', warnings[:20])
    if len(index)!=26 or len(all_rows)!=2600:
        raise RuntimeError(f"Auditoria incompleta: {len(index)} examenes y {len(all_rows)} preguntas; esperados 26 y 2600")

if __name__=='__main__':generate()
