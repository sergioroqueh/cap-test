import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {prepareCatalog} from './prepare_private_catalog_r94.mjs'
const q={id:'synthetic-q',question:'SYNTHETIC_STEM',options:{A:'a',B:'b',C:'c',D:'d'},correctAnswer:'A',section:'1',questionnaireId:'x',rawEditorialOnly:'SYNTHETIC_PRIVATE_NOTE'}
const path='data/questions/synthetic.json'
const data=Buffer.from(JSON.stringify([q]))
const sha256=createHash('sha256').update(data).digest('hex')
const sources=new Map([
 ['data/index.json',Buffer.from(JSON.stringify({questionnaires:[{id:'synthetic',path,count:1}]}))],
 ['data/exams/index.json',Buffer.from(JSON.stringify({exams:[]}))],
 [path,data]
])
const readSource=p=>{assert.ok(sources.has(p));return sources.get(p)}
const approval={path,sha256,approved:true,rightsReference:'synthetic test only',minimumTier:'guest',units:['question'],sourceAttribution:{issuer:'Synthetic authority',title:'Synthetic test',questionnaireUrl:'https://example.invalid/questions',answerUrl:null,conditionsUrl:'https://example.invalid/terms',updatedOn:null}}
const run=(items)=>prepareCatalog({readSource,approvals:{schemaVersion:1,sources:items}})
assert.equal(run([]).privateRows.length,0)
const r=run([approval])
assert.equal(r.catalog.items.length,1)
assert.equal(r.privateRows[0].publishable,false)
assert.equal(r.privateRows[0].payload.questions[0].sourceAttribution.issuer,'Synthetic authority')
assert.throws(()=>run([{...approval,sourceAttribution:null}]))
assert.equal(r.privateRows[0].payload.questions[0].correctAnswer,'A')
assert.equal(r.privateRows[0].payload.questions[0].question,q.question)
assert.ok(!JSON.stringify(r.catalog).includes('SYNTHETIC_STEM'))
assert.ok(!JSON.stringify(r.privateRows).includes('SYNTHETIC_PRIVATE_NOTE'))
assert.throws(()=>run([{...approval,approved:false}]))
assert.throws(()=>run([{...approval,sha256:'0'.repeat(64)}]))
assert.throws(()=>run([{...approval,rightsReference:''}]))
assert.throws(()=>run([{...approval,path:'../private.json'}]))
assert.throws(()=>run([approval,approval]))
assert.throws(()=>run([{...approval,units:['exam']}]))
assert.equal(JSON.parse(data.toString())[0].rawEditorialOnly,'SYNTHETIC_PRIVATE_NOTE')
console.log('PASS R94 offline catalog export with real SHA-256; synthetic data only')
