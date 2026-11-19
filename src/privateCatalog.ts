export const PRIVATE_STAGE_MARKER='RUTACAP_PRIVATE_CATALOG_C14'
export type Letter='A'|'B'|'C'|'D'
export const LETTERS:Letter[]=['A','B','C','D']
export type Row={occurrenceId:string;modelId:string;number:number;sourcePage:number;templatePage:number;sourceHash:string;templateHash:string;initialKey:Letter;question:string;options:Record<Letter,string>}
export type Model={id:string;date:string;category:string;kind:string;variant:string;rows:Row[]}
export type Stage={sourceCorpusSha256:string;models:Model[];count:number}
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v)
const str=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=20000
const page=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=10000
const fail=(s:string):never=>{throw new Error(s)}
export function validatePrivateStage(value:unknown):Stage{
 if(!obj(value)||value.schemaVersion!==1||value.stageOnly!==true||value.releaseAllowed!==false||value.scoringAllowed!==false||!hex(value.sourceCorpusSha256)||!Array.isArray(value.occurrences)||value.occurrences.length<1||value.occurrences.length>50000)throw new Error('Paquete de ensayo inválido o no bloqueado.')
 const entries=value.occurrences,models=new Map<string,Model>(),ids=new Set<string>(),prefixes=new Map<string,string>()
 for(const x of entries){
  if(!obj(x)||x.releaseAllowed!==false||x.scoringAllowed!==false||x.progressMigrationAllowed!==false)throw new Error('Registro con permisos incompatibles.')
  if(!str(x.occurrenceId)||!str(x.modelId)||!str(x.question)||!page(x.number)||!page(x.sourcePage)||!page(x.templatePage)||!hex(x.sourceHash)||!hex(x.templateHash)||!LETTERS.includes(x.initialKey as Letter)||!obj(x.options))throw new Error('Registro incompleto.')
  const options=x.options,answer=x.initialKey as Letter
  if(Object.keys(options).length!==4||LETTERS.some(k=>!str(options[k])))throw new Error('Alternativas inválidas.')
  const p=x.occurrenceId.match(/^clm:(\d{4}-\d{2}-\d{2}):(mercancias|viajeros):(global|promotion):([a-z0-9]+):(\d{3})$/)
  if(!p||Number(p[5])!==x.number||ids.has(x.occurrenceId))throw new Error('Identificador incoherente o duplicado.')
  ids.add(x.occurrenceId)
  const prefix=p.slice(1,5).join(':'),other=prefixes.get(prefix)
  if(other&&other!==x.modelId)fail('Modelo dividido en identificadores distintos.')
  prefixes.set(prefix,x.modelId)
  let m=models.get(x.modelId)
  if(!m){m={id:x.modelId,date:p[1],category:p[2],kind:p[3],variant:p[4],rows:[]};models.set(m.id,m)}
  if([m.date,m.category,m.kind,m.variant].join(':')!==prefix)fail('Modelo incoherente.')
  if(m.rows.length&&(m.rows[0].sourceHash!==x.sourceHash||m.rows[0].templateHash!==x.templateHash||m.rows[0].templatePage!==x.templatePage))fail('Procedencia incoherente.')
  m.rows.push({occurrenceId:x.occurrenceId,modelId:x.modelId,number:x.number,sourcePage:x.sourcePage,templatePage:x.templatePage,sourceHash:x.sourceHash,templateHash:x.templateHash,initialKey:answer,question:x.question,options:{A:options.A as string,B:options.B as string,C:options.C as string,D:options.D as string}})
 }
 for(const m of models.values()){
  m.rows.sort((a,b)=>a.number-b.number)
  const expected=m.kind==='global'?Array.from({length:103},(_,i)=>i+1):[...Array.from({length:25},(_,i)=>i+1),101]
  if(m.rows.length!==expected.length||m.rows.some((r,i)=>r.number!==expected[i]))fail('Modelo incompleto o posiciones incoherentes.')
 }
 return {sourceCorpusSha256:value.sourceCorpusSha256,models:[...models.values()],count:entries.length}
}
export const C13_SHA='9dc09e69f7c96c40a1973ed90439eb7428a606ff448245e2a8a07448d5307cc0'
export const HELD=new Set(['may-m-a:29','may-m-a:85','sep-m-a:48','sep-m-a:22','sep-v-a:32','sep-v-a:42'])
