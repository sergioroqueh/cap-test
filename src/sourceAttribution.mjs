// R98 attribution is documentation, never a rights grant.
const text=(x,n)=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=n&&!/[\u0000-\u001f\u007f]/.test(x)
const https=x=>{
 if(!text(x,1500)||!/^https:\/\/[A-Za-z0-9.-]+(?:\/|$)/.test(x)||/[\\\s]/.test(x))return false
 try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port}catch{return false}
}
export function validateAttribution(a){
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).sort().join('|')!=='answerUrl|conditionsUrl|issuer|questionnaireUrl|title|updatedOn'||
 !text(a.issuer,200)||!text(a.title,300)||!https(a.questionnaireUrl)||!https(a.conditionsUrl)||
 !(a.answerUrl===null||https(a.answerUrl))||!(a.updatedOn===null||(typeof a.updatedOn==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(a.updatedOn)&&Number.isFinite(Date.parse(a.updatedOn))&&new Date(a.updatedOn).toISOString().slice(0,10)===a.updatedOn)))throw Error('R98_ATTRIBUTION_INVALID')
 return a
}
export function requireSessionAttributions(questions){
 if(!Array.isArray(questions)||!questions.length)throw Error('R98_ATTRIBUTION_INVALID')
 for(const q of questions){
  const a=validateAttribution(q.sourceAttribution)
  if(q.examId&&!a.answerUrl)throw Error('R98_ATTRIBUTION_INVALID')
 }
 return questions
}
