// R97: validated selection request and response; no corpus fallback.
const ID=/^[A-Za-z0-9_.:-]{1,200}$/
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MODES=['mixed-study','mixed-exam','top100','top3','top4','favorites','errors','review']
const CAPS={guest:[25,1],free:[100,3],premium:[null,null]}
const fail=()=>{throw Error('R97_SELECTION_INVALID')}
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
export function validateSelectionInput(x){
 if(!object(x)||Object.keys(x).sort().join('|')!=='category|count|hints|mode|requestId'||!MODES.includes(x.mode)||!['mercancias','viajeros'].includes(x.category)||
  !Number.isInteger(x.count)||x.count<1||x.count>100||typeof x.requestId!=='string'||!UUID.test(x.requestId)||
  !object(x.hints)||Object.keys(x.hints).length>5000)fail()
 if(x.mode==='mixed-exam'&&x.count!==100||!x.mode.startsWith('mixed-')&&x.category!=='mercancias'||
  !['favorites','errors','review'].includes(x.mode)&&Object.keys(x.hints).length)fail()
 for(const [id,v] of Object.entries(x.hints))if(!ID.test(id)||!Number.isFinite(v)||Math.abs(v)>1000000)fail()
 if(JSON.stringify(x.hints).length>500000)fail()
 return x
}
export function normalizedSelectionStem(q){
 return q.question.normalize('NFKC').toLocaleLowerCase('es').replace(/\s+/g,' ').replace(/[¿?¡!.,;:()[\]{}]/g,'').trim()
}
export function validateSelectionReply(reply,x,anonymous){
 if(!object(reply))fail()
 if(reply.status==='unavailable'){
  if('content' in reply)fail()
  return {status:'unavailable'}
 }
 if(!['ok','quota_exhausted'].includes(reply.status)||!Object.hasOwn(CAPS,reply.tier)||
  anonymous!==(reply.tier==='guest')||reply.mode!==x.mode||reply.category!==x.category||
  reply.requestId!==x.requestId||reply.requested!==x.count||typeof reply.replayed!=='boolean'||
  !/^\d{4}-\d{2}-\d{2}$/.test(reply.day||'')||typeof reply.resetAt!=='string'||!Number.isFinite(Date.parse(reply.resetAt)))fail()
 const caps=CAPS[reply.tier],remaining=[reply.questionsRemaining,reply.examsRemaining]
 if(remaining.some((v,i)=>caps[i]===null?v!==null:!Number.isSafeInteger(v)||v<0||v>caps[i]))fail()
 if(reply.status==='quota_exhausted'){
  if('content' in reply||reply.replayed||reply.tier==='premium'||remaining[x.mode==='mixed-exam'?1:0]!==0)fail()
  return reply
 }
 if(!Number.isInteger(reply.count)||reply.count<1||reply.count>x.count||
  x.mode==='mixed-exam'&&reply.count!==100||
  !object(reply.content)||Object.keys(reply.content).join('|')!=='questions'||
  !Array.isArray(reply.content.questions)||reply.content.questions.length!==reply.count)fail()
 const ids=new Set(),progress=new Set(),stems=new Set()
 for(const q of reply.content.questions){
  if(!object(q)||!ID.test(q.id||'')||!q.id.startsWith('cap:')||typeof q.examId!=='string'||!q.examId||
   q.category!==x.category||q.scoringEligible===false||!['A','B','C','D'].includes(q.originalSheetAnswer)||
   typeof q.question!=='string'||!q.question.trim()||!object(q.options)||Object.keys(q.options).sort().join('')!=='ABCD'||
   Object.values(q.options).some(v=>typeof v!=='string')||!['A','B','C','D'].includes(q.correctAnswer)||
   typeof q.section!=='string'||typeof q.questionnaireId!=='string')fail()
  const pid=q.progressId||q.id,stem=normalizedSelectionStem(q)
  if(!ID.test(pid)||!stem||ids.has(q.id)||progress.has(pid)||stems.has(stem))fail()
  if(['favorites','errors'].includes(x.mode)&&!Object.hasOwn(x.hints,pid))fail()
  const min=x.mode==='top100'?1:x.mode==='top3'?3:x.mode==='top4'?4:0
  if(min&&(!Number.isFinite(q.examFrequency)||q.examFrequency<min))fail()
  ids.add(q.id);progress.add(pid);stems.add(stem)
 }
 return reply
}
export function createSelectionRequest({publishableKey,fetchImpl}){
 if(typeof publishableKey!=='string'||!publishableKey.startsWith('sb_publishable_')||typeof fetchImpl!=='function')fail()
 return async ({accessToken,...x})=>{
  validateSelectionInput(x)
  if(typeof accessToken!=='string'||!accessToken)fail()
  const response=await fetchImpl('https://rhtbqetskghkarxhrgee.supabase.co/rest/v1/rpc/rc_deliver_selection_v1',{
   method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
   body:JSON.stringify({p_mode:x.mode,p_category:x.category,p_count:x.count,p_hints:x.hints,p_request_id:x.requestId}),
   cache:'no-store',redirect:'error',credentials:'omit'
  })
  if(!response.ok)throw Error('R97_REMOTE_'+response.status)
  return response.json()
 }
}
