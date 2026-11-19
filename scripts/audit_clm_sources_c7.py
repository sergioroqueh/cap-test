"""C7 read-only official-source retrieval and comparison; no live data writes."""
import argparse
import concurrent.futures
import datetime
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import shutil
import tempfile
from difflib import SequenceMatcher
from urllib.parse import urljoin, urlsplit, unquote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from build_exam_data import parse_page, norm

ROOT = Path(__file__).resolve().parents[1]
INV = ROOT / 'docs/commercial/clm_sources_c7.json'
RAW = ROOT / 'data-src/cap-exams/raw/2026-05-30-mercancias-global.json'
HOSTS = {'www.castillalamancha.es','castillalamancha.es','transporte.castillalamancha.es'}
MAX = 16 * 1024 * 1024

def allowed(url):
    u = urlsplit(url)
    return u.scheme == 'https' and u.hostname in HOSTS and u.port in (None,443) and not u.username and not u.password

class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed(newurl):
            raise ValueError('redirect outside official allowlist')
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def fetch(url):
    if not allowed(url):
        raise ValueError('nonofficial URL')
    with build_opener(SafeRedirect()).open(Request(url,headers={'User-Agent':'RutaCAP source audit/1.0'}), timeout=15) as res:
        if not allowed(res.geturl()):
            raise ValueError('invalid final URL')
        data = res.read(MAX+1)
        if len(data)>MAX:
            raise ValueError('size limit exceeded')
        return data, res.geturl()

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.hrefs=[]
    def handle_starttag(self, tag, attrs):
        if tag=='a':
            href=dict(attrs).get('href')
            if href: self.hrefs.append(href)

def discover(html, base):
    parser=Links(); parser.feed(html)
    found=[]
    for href in parser.hrefs:
        url=urljoin(base,href)
        if not allowed(url): continue
        name=norm(unquote(urlsplit(url).path.split('/')[-1]))
        if not urlsplit(url).path.lower().endswith('.pdf'): continue
        if any(x in name for x in ('listado','lista','admitid','excluid','reparto','resultado','aptos')): continue
        if 'cap' not in name and 'prueba' not in name: continue
        kind='questionnaire' if 'cuestionario' in name else 'answer_key' if 'plantilla' in name and 'correctora' in name else None
        if not kind: continue
        if url not in [x['url'] for x in found]: found.append({'url':url,'kind':kind,'label':name})
    return sorted(found,key=lambda x:x['url'])

def may_rows(text):
    blocks=[]; current=None
    for page,body in enumerate(text.split('\f'),1):
        if not body.strip(): continue
        header=norm(' '.join(body.splitlines()[:12]))
        # Pages only enter a block with explicit date + category + model marker.
        if not re.search(r'(?:30 05 2026|30 de mayo de 2026)',header) or not re.search(r'mercancias modelo a\b',header) or 'ampliacion' in header or 'promocion' in header:
            current=None
            continue
        rows,errors=parse_page(body,page)
        if current is None or any(r['number']==1 for r in rows):
            current={'rows':[],'errors':[],'pages':[]}; blocks.append(current)
        current['rows'].extend(rows); current['errors'].extend(errors); current['pages'].append(page)
    return blocks

def compare(block, old):
    official=block['rows']; nums=[r['number'] for r in official]; hist={r['number']:r for r in old}
    diffs=[]
    for row in official:
        n=row['number']; h=hist.get(n)
        if h is None:
            diffs.append({'number':n,'sourcePage':row['page'],'status':'reserve_or_missing_historical'}); continue
        changed=[k for k in 'ABCD' if norm(row['options'][k])!=norm(h['options'][k])]
        eq=norm(row['question'])==norm(h['question'])
        sim=round(SequenceMatcher(None,norm(row['question']),norm(h['question'])).ratio(),4)
        perm=sorted(norm(x) for x in row['options'].values())==sorted(norm(x) for x in h['options'].values())
        diffs.append({'number':n,'sourcePage':row['page'],'historicalPage':h['page'],'stemExactNormalized':eq,'stemSimilarity':sim,'changedOptions':changed,'sameOptionSetNormalized':perm})
    complete=len(nums)==len(set(nums)) and set(nums)==set(range(1,104)) and not block['errors']
    return {'pages':block['pages'],'officialParsed':len(nums),'mainParsed':len(set(nums)&set(range(1,101))),'reserveNumbers':sorted(set(nums)&{101,102,103}),'missingMain':sorted(set(range(1,101))-set(nums)),'duplicates':sorted({n for n in nums if nums.count(n)>1}),'parseErrors':block['errors'],'all103Parsed':complete,'historicalParsed':len(hist),'stemExactNormalized':sum(x.get('stemExactNormalized',False) for x in diffs),'changedOptionRows':sum(bool(x.get('changedOptions')) for x in diffs),'rows':diffs,'status':'manual_visual_and_key_review_required'}

def inspect(doc, local):
    record={k:doc[k] for k in ('id','kind','url','date') if k in doc}
    try:
        if local:
            data=local.read_bytes(); final=doc['url']
        else:
            data,final=fetch(doc['url'])
        if len(data)>MAX or not data.startswith(b'%PDF-'): raise ValueError('not PDF or over size limit')
        record.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),finalUrl=final,origin='local_user_supplied' if local else 'official_https',status='pdf_retrieved_pending_visual_review')
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'source.pdf';p.write_bytes(data)
            info=subprocess.run(['pdfinfo',str(p)],capture_output=True,text=True,check=True,timeout=30).stdout
            m=re.search(r'^Pages:\s+(\d+)',info,re.M);record['pages']=int(m.group(1)) if m else None
            if doc['id']=='2026-05-questions':
                txt=subprocess.run(['pdftotext','-layout',str(p),'-'],capture_output=True,text=True,check=True,timeout=45).stdout
                old=[]
                for page in json.loads(RAW.read_text())['pages']:
                    rows,_=parse_page(page['text'],page['page']);old.extend(rows)
                blocks=may_rows(txt)
                record['mayAudit']=[compare(b,old) for b in blocks]
                if not blocks: record['status']='pdf_retrieved_no_matching_text_block_manual_review'
    except Exception as exc:
        record['errorType']=type(exc).__name__
        if isinstance(exc, HTTPError): record['httpStatus']=exc.code
        if isinstance(exc, URLError): record['reasonType']=type(exc.reason).__name__
        record['status']='retrieval_or_parse_incomplete'
    return record

def selftest():
    assert not allowed('https://transporte.castillalamancha.es.evil.test/x')
    assert not allowed('http://www.castillalamancha.es/x')
    assert len(discover('<a href="/CAP%20cuestionarios.pdf">ok</a><a href="/CAP%20listado.pdf">no</a>', 'https://www.castillalamancha.es'))==1
    page='Fecha: 30/05/2026 Examen: MERCANCIAS MODELO A\n1. Test question?\n a One\n b Two\n c Three\n d Four\n'
    b=may_rows(page)[0]
    old=[dict(b['rows'][0],options={'A':'One','B':'Other','C':'Three','D':'Four'})]
    r=compare(b,old)
    assert r['changedOptionRows']==1 and r['rows'][0]['changedOptions']==['B'] and not r['all103Parsed']
    assert may_rows(page.replace('MODELO A','MODELO B'))==[]
    print('C7 SELFTEST PASS')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=Path('clm-audit-c7.json'))
    parser.add_argument('--local-may',type=Path)
    parser.add_argument('--self-test',action='store_true')
    args=parser.parse_args()
    selftest()
    if args.self_test:return
    for tool in ('pdftotext','pdfinfo'):
        if not shutil.which(tool): raise SystemExit('Missing dependency: '+tool+' (install poppler-utils)')
    inv=json.loads(INV.read_text())
    docs=[d for d in inv['documents'] if d['url'] and d['kind'] in ('questionnaire','answer_key')]
    result={'schemaVersion':1,'generatedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'releaseAllowed':False,'portal':{'status':'not_attempted'},'documents':[]}
    if args.local_may:
        docs=[d for d in docs if d['id']=='2026-05-questions']
    else:
        try:
            html,final=fetch(inv['portal'])
            links=discover(html.decode('utf-8',errors='replace'),final)
            result['portal']={'status':'retrieved','links':links,'retrievalLimit':24}
            known={d['url'] for d in docs}
            for i,link in enumerate(links[:24]):
                if link['url'] not in known:
                    docs.append(dict(link,id='portal-discovered-'+str(i+1),date=None))
        except Exception as exc:
            result['portal']={'status':'retrieval_failed','errorType':type(exc).__name__}
            if isinstance(exc, HTTPError): result['portal']['httpStatus']=exc.code
            if isinstance(exc, URLError): result['portal']['reasonType']=type(exc.reason).__name__
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        result['documents']=list(ex.map(lambda doc:inspect(doc,args.local_may),docs))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('C7 audit report only; retrieved hashes:',sum('sha256' in d for d in result['documents']),'/',len(docs))

if __name__=='__main__': main()
