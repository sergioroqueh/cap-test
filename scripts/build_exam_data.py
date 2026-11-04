"""Cotejo conservador de exámenes CAP frente al banco original de 8.655 preguntas.
Las claves de las plantillas son candidatas: contradicciones quedan bloqueadas.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from hashlib import sha256
from pathlib import Path
import json
import re
import shutil
import unicodedata

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
    corrections = json.loads((SRC/'override_transcriptions_review.json').read_text(encoding='utf-8'))
    bank = defaultdict(list)
    original_count = 0
    for path in (ROOT/'public'/'data'/'questions').glob('*.json'):
        for item in json.loads(path.read_text(encoding='utf-8')):
            bank[fingerprint(item)].append(item); original_count += 1
    if original_count != 8655: raise RuntimeError(f'Banco original no es de 8655 preguntas: {original_count}')
    if OUT.exists():shutil.rmtree(OUT)
    (OUT/'questions').mkdir(parents=True,exist_ok=True)
    exams, warnings = [], []
    all_rows = []
    for meta in manifest:
        exam_id=meta['id']
        path=SRC/'raw'/f'{exam_id}.json'
        parsed=[]
        if path.exists():
            source=json.loads(path.read_text(encoding='utf-8'))
            for p in source['pages']:
                rows,bad=parse_page(p['text'],p['page'])
                parsed.extend(rows)
                warnings += [{'examId':exam_id,**item} for item in bad]
        overrides=corrections.get(exam_id,{})
        parsed=[q for q in parsed if str(q['number']) not in overrides]+list(overrides.values())
        by_num={}
        for q in parsed:
            if q['number'] not in by_num: by_num[q['number']]=q
            else: warnings.append({'examId':exam_id,'number':q['number'],'reason':'numero_repetido'})
        parsed=[by_num[n] for n in range(1,101) if n in by_num]
        if path.exists() and len(parsed)!=100:
            warnings.append({'examId':exam_id,'reason':'examen_incompleto','count':len(parsed),
                             'missing':[n for n in range(1,101) if n not in by_num]})
        local=[]
        template=keys.get(exam_id,'')
        for q in parsed:
            matching=bank.get(fingerprint(q),[])
            mapped=set()
            for b in matching:
                wanted=norm(b['options'][b['correctAnswer']])
                mapped.update(k for k,v in q['options'].items() if norm(v)==wanted)
            inferred=next(iter(mapped)) if len(mapped)==1 else None
            letter=template[q['number']-1] if len(template)>=q['number'] else None
            if letter not in ('A','B','C','D'):letter=None
            if len(mapped)>1: status='conflicto_banco'
            elif inferred and letter and inferred!=letter: status='conflicto_plantilla_banco'
            elif inferred and letter: status='coincidencia_automatica'
            elif inferred:status='respuesta_banco_pendiente_revision'
            elif letter:status='solo_plantilla_pendiente_cotejo'
            else:status='sin_respuesta_verificada'
            original=matching[0] if matching and len(mapped)==1 else None
            key=fingerprint(q)
            group='b:'+original['code'] if original else 't:'+sha256(key.encode()).hexdigest()[:18]
            answer=inferred if status in ('coincidencia_automatica','respuesta_banco_pendiente_revision') else None
            local.append({**q,'examId':exam_id,'date':meta['date'],'category':meta['category'],'model':meta['model'],
              'id':original['id'] if original else 'cap-'+sha256(key.encode()).hexdigest()[:24],
              'canonicalQuestionId':original['id'] if original else None,'canonicalCode':original['code'] if original else None,
              'section':original['section'] if original else 'CAP-'+meta['category'],
              'code':original['code'] if original else ('CAP-'+exam_id+'-'+str(q['number'])),
              'norm':original.get('norm','') if original else '',
              'reference':original.get('reference','') if original else '',
              'questionnaireId':original['questionnaireId'] if original else 'examenes-cap',
              'correctAnswer':answer,'bankAnswer':inferred,'templateAnswer':letter,
              'answerStatus':status,'sourcePage':q['page'],'frequencyGroup':group,
              'reviewRequired':bool(q.get('transcriptionReview')) or status!='coincidencia_automatica'})
        exams.append((meta,local))
        all_rows.extend(local)
    # The denominator uses only complete textual exam models, not missing scans.
    denomination=Counter(meta['category'] for meta,rows in exams if len(rows)==100)
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
        index.append({**meta,'count':len(rows),'readyCount':ready,'path':f"data/exams/questions/{meta['id']}.json",
           'status':'practicable_pendiente_auditoria' if len(rows)==100 and ready==100
            else ('parcial_en_revision' if rows else 'pendiente_transcripcion')})
    (OUT/'index.json').write_text(json.dumps({
      'version':'2026-11-04-auditoria','totalExamModels':len(index),'totalImportedQuestions':len(all_rows),
      'categoryCounts':dict(denomination),'exams':index,'answerStatuses':dict(statuses),'warnings':warnings,
      'frequencyExplanation':'Apariciones por modelo de examen transcrito, nunca una predicción de la siguiente prueba.'
    },ensure_ascii=False,indent=2),encoding='utf-8')
    print(f"CAP audit: {len(index)} examenes, {len(all_rows)} preguntas, {dict(statuses)}, pendientes {len(warnings)}")
    if len(index)!=26 or len(all_rows)!=1900:
        raise RuntimeError(f"Auditoria incompleta: {len(index)} examenes y {len(all_rows)} preguntas; esperados 26 y 1900")

if __name__=='__main__':generate()
