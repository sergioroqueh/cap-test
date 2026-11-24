// Offline-only preparation. No credentials, network, SQL execution or upload.
// Default deny: source files require exact SHA-256 and explicit rights approval.
import {createHash} from 'node:crypto'
import {readFileSync,realpathSync,lstatSync,mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {resolve,join,dirname,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {projectHistoricalQuestions} from '../src/historicalProjection.mjs'
import {validatePublicCatalog,validateDeliveredUnit} from '../src/protectedCatalogContract.mjs'
const hash=x=>createHash('sha256').update(x).digest('hex')
const fail=m=>{throw Error('R94 '+m)}
const sourcePattern=/^data\/(?:questions|exams\/questions)\/[a-z0-9-]+\.json$/
const parse=x=>JSON.parse(x.toString('utf8'))
export function prepareCatalog({readSource,approvals}){
 if(!approvals||approvals.schemaVersion!==1||!Array.isArray(approvals.sources))fail('approval manifest invalid')
 const bank=parse(readSource('data/index.json')),exams=parse(readSource('data/exams/index.json'))
 const byPath=new Map([...bank.questionnaires.map(m=>[m.path,{m,category:'general'}]),...exams.exams.map(m=>[m.path,{m,category:m.category}])])
 const seen=new Set(),items=[],privateRows=[]
 let ordinal=0
 for(const a of approvals.sources){
  if(!a||!sourcePattern.test(a.path)||seen.has(a.path)||!['guest','free','premium'].includes(a.minimumTier)||
    a.approved!==true||typeof a.rightsReference!=='string'||!a.rightsReference.trim()||
    !/^[a-f0-9]{64}$/.test(a.sha256||'')||!Array.isArray(a.units)||!a.units.length||
    new Set(a.units).size!==a.units.length||a.units.some(x=>!['question','exam'].includes(x)))fail('invalid source approval')
  seen.add(a.path)
  const info=byPath.get(a.path)
  if(!info)fail('source not in original index')
  const {m,category}=info
  if(category==='general'&&a.units.includes('exam'))fail('general exam composition not yet approved')
  if(category!=='general'&&(!m.hasOriginalAnswerSheet||m.count!==100))fail('historical model without original answer sheet')
  const raw=readSource(a.path)
  if(hash(raw)!==a.sha256)fail('source digest differs from approval')
  const rows=parse(raw)
  if(!Array.isArray(rows)||rows.length!==m.count)fail('source count mismatch')
  const projected=category==='general'?rows:projectHistoricalQuestions(rows,m)
  if(projected.length!==rows.length)fail('historical projection incomplete')
  const categoryLabel=category==='general'?'Banco general':category==='mercancias'?'CAP Mercancías':'CAP Viajeros'
  function add(kind,contentId,label,questions){
   const payload={questions}
   const serialized=JSON.stringify(payload)
   if(Buffer.byteLength(serialized)>2097152)fail('unit exceeds private catalog budget')
   const revision=hash(serialized)
   const item={kind,contentId,revision,minimumTier:a.minimumTier,category,count:questions.length,label}
   validateDeliveredUnit({status:'ok',kind,contentId,revision,content:payload},item)
   items.push(item)
   privateRows.push({kind,content_id:contentId,revision,minimum_tier:a.minimumTier,publishable:false,payload})
  }
  if(a.units.includes('question'))for(const q of projected){
   ordinal++
   add('question',q.id,categoryLabel+' · Pregunta '+ordinal,[q])
  }
  if(a.units.includes('exam'))add('exam',m.id,categoryLabel+' · '+m.date+' · Modelo '+m.model,projected)
 }
 const catalog=validatePublicCatalog({schemaVersion:1,items})
 return {catalog,privateRows,report:{schemaVersion:1,approvedSources:seen.size,units:items.length,questions:items.filter(x=>x.kind==='question').length,exams:items.filter(x=>x.kind==='exam').length,publicationEnabled:false}}
}
function main(){
 const argv=process.argv.slice(2)
 if(argv.length!==4||argv[0]!=='--approval'||argv[2]!=='--out')fail('usage: --approval /private/approval.json --out /private/new-directory')
 const root=realpathSync('.'),approval=realpathSync(argv[1]),out=resolve(argv[3])
 if(approval===root||approval.startsWith(root+sep)||out===root||out.startsWith(root+sep)||root.startsWith(out+sep)||existsSync(out))fail('approval/output must be outside repository; output must be new')
 const parent=realpathSync(dirname(out))
 if(parent===root||parent.startsWith(root+sep))fail('output parent is inside repository')
 const publicRoot=realpathSync('public')
 const readSource=path=>{
   if(!sourcePattern.test(path)&&!['data/index.json','data/exams/index.json'].includes(path))fail('invalid source path')
   const target=join(publicRoot,path)
   if(!lstatSync(target).isFile()||realpathSync(target)!==target)fail('source not a regular file')
   return readFileSync(target)
 }
 const result=prepareCatalog({readSource,approvals:parse(readFileSync(approval))})
 mkdirSync(out,{mode:0o700})
 for(const [name,value] of [['public-catalog.json',result.catalog],['PRIVATE-catalog-rows.json',result.privateRows],['PRIVATE-report.json',result.report]])
   writeFileSync(join(out,name),JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'})
 console.log(JSON.stringify(result.report))
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main()
