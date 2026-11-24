import {validatePublicCatalog,validateDeliveredUnit} from '../src/protectedCatalogContract.mjs'
import {projectHistoricalQuestions} from '../src/historicalProjection.mjs'
function runContractTests(validatePublicCatalog,validateDeliveredUnit,projectHistoricalQuestions){
 const results=[]
 const assert=b=>{if(!b)throw Error('assertion failed')}
 function rejects(fn){try{fn()}catch(e){if(String(e.message).includes('R94_CATALOG_INVALID'))return;throw e}throw Error('expected reject')}
 const base={kind:'question',contentId:'q1',revision:'r1',minimumTier:'guest',category:'general',count:1,label:'Banco general · Pregunta 1'}
 const row={id:'q1',question:'SYNTHETIC ONLY',options:{A:'a',B:'b',C:'c',D:'d'},correctAnswer:'A',section:'1',questionnaireId:'x'}
 const catalog=items=>({schemaVersion:1,items})
 const reply=(item,questions)=>({status:'ok',kind:item.kind,contentId:item.contentId,revision:item.revision,content:{questions}})
 function test(name,fn){fn();results.push(name)}
 test('empty catalog closed by default',()=>assert(validatePublicCatalog(catalog([])).items.length===0))
 test('public metadata only',()=>assert(validatePublicCatalog(catalog([base])).items.length===1))
 test('public metadata rejects stems or answer keys',()=>{rejects(()=>validatePublicCatalog(catalog([{...base,question:'leak'}])));rejects(()=>validatePublicCatalog(catalog([{...base,correctAnswer:'A'}])))})
 test('public metadata rejects arbitrary paths and labels',()=>{rejects(()=>validatePublicCatalog(catalog([{...base,path:'data/questions/x.json'}])));rejects(()=>validatePublicCatalog(catalog([{...base,label:'secret stem'}])))})
 test('duplicate units and invalid tier denied',()=>{rejects(()=>validatePublicCatalog(catalog([base,base])));rejects(()=>validatePublicCatalog(catalog([{...base,minimumTier:'beta'}])))})
 test('one delivered question unchanged',()=>assert(validateDeliveredUnit(reply(base,[row]),base)[0]===row))
 test('question delivery rejects extra rows and envelope keys',()=>{rejects(()=>validateDeliveredUnit(reply(base,[row,row]),base));rejects(()=>validateDeliveredUnit({...reply(base,[row]),content:{questions:[row],bank:[row]}},base))})
 test('wrong revision and denied content not usable',()=>{rejects(()=>validateDeliveredUnit({...reply(base,[row]),revision:'r2'},base));rejects(()=>validateDeliveredUnit({status:'quota_exhausted'},base))})
 test('invalid option or answer denied',()=>{rejects(()=>validateDeliveredUnit(reply(base,[{...row,correctAnswer:'E'}]),base));rejects(()=>validateDeliveredUnit(reply(base,[{...row,options:{A:'a',B:'b',C:'c'}}]),base))})
 const meta={id:'sample-2026-a',hasOriginalAnswerSheet:true}
 const raw=Array.from({length:100},(_,i)=>({...row,id:'raw'+i,number:i+1,canonicalQuestionId:'canonical'+i,originalSheetAnswer:'A',correctAnswer:'A'}))
 raw[0]={...raw[0],technicalDecision:{restoredOptions:{A:'a',B:'fixed',C:'c',D:'d'},technicalAnswer:'B',action:'correct'}}
 raw[1]={...raw[1],correctAnswer:null,technicalDecision:{technicalAnswer:null,action:'exclude'}}
 const item={kind:'exam',contentId:meta.id,revision:'r1',minimumTier:'free',category:'mercancias',count:100,label:'CAP Mercancías · 2026-01-01 · Modelo A'}
 const projected=projectHistoricalQuestions(raw,meta)
 test('historical correction and excluded scoring unchanged',()=>{assert(projected.length===100&&projected[0].correctAnswer==='B'&&projected[0].options.B==='fixed'&&projected[1].correctAnswer==='A'&&projected[1].scoringEligible===false&&projected[0].progressId==='canonical0');assert(raw[0].correctAnswer==='A'&&raw[1].correctAnswer===null)})
 test('complete historical exam accepted',()=>assert(validateDeliveredUnit(reply(item,projected),item).length===100))
 test('incomplete or mixed historical exam denied',()=>{rejects(()=>validateDeliveredUnit(reply(item,projected.slice(0,99)),item));const mixed=projected.map((q,i)=>i===99?{...q,examId:'other'}:q);rejects(()=>validateDeliveredUnit(reply(item,mixed),item))})
 test('duplicate question IDs denied',()=>{const bad=projected.map((q,i)=>i===99?{...q,id:projected[0].id}:q);rejects(()=>validateDeliveredUnit(reply(item,bad),item))})
 return results
}
const passed=runContractTests(validatePublicCatalog,validateDeliveredUnit,projectHistoricalQuestions)
for(const name of passed)console.log('PASS',name)
console.log(passed.length+' R94 contract tests passed (synthetic only)')
