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

def generate():
    manifest = json.loads((SRC/'manifest.json').read_text(encoding='utf-8'))['exams']
    keys = json.loads((SRC/'answer_keys_unverified.json').read_text(encoding='utf-8'))
    alignments = json.loads((SRC/'template_alignment_review.json').read_text(encoding='utf-8'))['alignments']
    visual_keys = json.loads((SRC/'answer_key_visual_corrections.json').read_text(encoding='utf-8'))['overrides']
    normative_notes = json.loads((SRC/'normative_conflicts_review.json').read_text(encoding='utf-8'))['reviews']
    corrections = json.loads((SRC/'override_transcriptions_review.json').read_text(encoding='utf-8'))
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
        packed=SRC/'raw'/f'{exam_id}.json.xz.b64'
        if path.exists() and packed.exists():
            raise RuntimeError(f'Fuentes duplicadas para {exam_id}')
        if path.exists():
            source=json.loads(path.read_text(encoding='utf-8'))
            for page in source['pages']:
                rows,bad=parse_page(page['text'],page['page'])
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
            local.append({**q,'examId':exam_id,'date':meta['date'],'category':meta['category'],'model':meta['model'],
              'id':original['id'] if original else 'cap-'+sha256(key.encode()).hexdigest()[:24],
              'canonicalQuestionId':original['id'] if original else None,'canonicalCode':original['code'] if original else None,
              'section':original['section'] if original else 'CAP-'+meta['category'],
              'code':original['code'] if original else ('CAP-'+exam_id+'-'+str(q['number'])),
              'norm':original.get('norm','') if original else '',
              'reference':original.get('reference','') if original else '',
              'questionnaireId':original['questionnaireId'] if original else 'examenes-cap',
              'correctAnswer':answer,'bankAnswer':inferred,'templateAnswer':letter,
              'rawTemplateAnswer':original_letter,'templateNumberUsed':template_number,
              'templateAlignmentStatus':align_status,'templateVisualCorrectionStatus':visual_status,
              'answerStatus':status,'matchMethod':method,'sourcePage':q['page'],'frequencyGroup':group,
              'reviewRequired':bool(q.get('transcriptionReview')) or status!='coincidencia_automatica'})
        exams.append((meta,local))
        all_rows.extend(local)
    # The denominator uses only complete textual exam models, not missing scans.
    denomination=Counter(meta['category'] for meta,rows in exams if rows)
    appears=defaultdict(set)
    for item in all_rows:appears[(item['category'],item['frequencyGroup'])].add(item['examId'])
    frequency_by_bank={}
    for row in all_rows:
        if row['canonicalQuestionId']:
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
        (OUT/'questions'/f"{meta['id']}.json").write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        index.append({**meta,'count':len(rows),'expectedCount':100,'readyCount':ready,'path':f"data/exams/questions/{meta['id']}.json",
           'status':'practicable_pendiente_auditoria' if len(rows)==100 and ready==100
            else ('parcial_en_revision' if rows else 'pendiente_transcripcion')})
    # Editable review queue for editorial verification; never auto-resolve a conflict.
    by_id={meta['id']:meta for meta,_ in exams}
    priority={'conflicto_banco':0,'conflicto_plantilla_banco':0,
              'solo_plantilla_pendiente_cotejo':1,
              'solo_plantilla_alineada_pendiente_cotejo':1,
              'sin_respuesta_verificada':2,
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
          'question':row['question'],'bankAnswer':row['bankAnswer'],'templateAnswer':row['templateAnswer'],
          'rawTemplateAnswer':row['rawTemplateAnswer'],
          'templateNumberUsed':row['templateNumberUsed'],
          'templateAlignmentStatus':row['templateAlignmentStatus'],
          'templateVisualCorrectionStatus':row['templateVisualCorrectionStatus'],
          'bankAnswerText':row['options'].get(row['bankAnswer'] or '', ''),
          'templateAnswerText':row['options'].get(row['templateAnswer'] or '', ''),
          'canonicalCode':row['canonicalCode'] or '', 'templateFile':meta.get('templateFile') or '',
          'transcriptionReview':bool(row.get('transcriptionReview')),
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
    if len(index)!=26 or len(all_rows)!=2100:
        raise RuntimeError(f"Auditoria incompleta: {len(index)} examenes y {len(all_rows)} preguntas; esperados 26 y 2100")

if __name__=='__main__':generate()
