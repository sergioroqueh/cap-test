// R94: public metadata only, no paths, stems, solutions or source documents.
const id=/^[A-Za-z0-9_.:-]{1,200}$/
const revision=/^[A-Za-z0-9_.:-]{1,100}$/
const tiers=['guest','free','premium']
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exact=(x,keys)=>plain(x)&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|')
const fail=()=>{throw Error('R94_CATALOG_INVALID')}
export function validatePublicCatalog(value){
 if(!exact(value,['schemaVersion','items'])||value.schemaVersion!==1||!Array.isArray(value.items)||value.items.length>20000)fail()
 const seen=new Set()
 for(const r of value.items){
  if(!exact(r,['kind','contentId','revision','minimumTier','category','count','label'])||
    !['question','exam'].includes(r.kind)||typeof r.contentId!=='string'||!id.test(r.contentId)||
    typeof r.revision!=='string'||!revision.test(r.revision)||!tiers.includes(r.minimumTier)||
    !['general','mercancias','viajeros'].includes(r.category)||
    r.count!==(r.kind==='question'?1:100)||
    typeof r.label!=='string'||!(/^(?:Banco general · Pregunta [1-9][0-9]*|CAP (?:Mercancías|Viajeros) · (?:Pregunta [1-9][0-9]*|\d{4}-\d{2}-\d{2} · Modelo [A-Za-z0-9-]{1,20}))$/).test(r.label))fail()
  const key=r.kind+':'+r.contentId
  if(seen.has(key))fail()
  seen.add(key)
 }
 return value
}
export function validateDeliveredUnit(reply,item){
 if(reply.status!=='ok'||reply.kind!==item.kind||reply.contentId!==item.contentId||
    reply.revision!==item.revision||!exact(reply.content,['questions'])||
    !Array.isArray(reply.content.questions)||reply.content.questions.length!==item.count)fail()
 const seen=new Set()
 for(const q of reply.content.questions){
   if(!plain(q)||typeof q.id!=='string'||!id.test(q.id)||seen.has(q.id)||
      typeof q.question!=='string'||!q.question.trim()||!exact(q.options,['A','B','C','D'])||
      Object.values(q.options).some(x=>typeof x!=='string')||
      !['A','B','C','D'].includes(q.correctAnswer)||
      typeof q.section!=='string'||typeof q.questionnaireId!=='string'||
      (q.scoringEligible!==undefined&&typeof q.scoringEligible!=='boolean'))fail()
   if(item.category!=='general'&&(!q.id.startsWith('cap:')||typeof q.examId!=='string'||!q.examId))fail()
   seen.add(q.id)
 }
 if(item.kind==='exam'&&item.category!=='general'){
   const ids=new Set(reply.content.questions.map(q=>q.examId))
   if(ids.size!==1||reply.content.questions.some((q,i)=>q.number!==i+1))fail()
 }
 return reply.content.questions
}
