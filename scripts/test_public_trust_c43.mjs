// C43: isolated browser verification of root-pinned policy, key rotation and anti-replay.
// ALL private keys exist only in this Node CI process, never in served browser sources.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto'
import {chromium,webkit} from 'playwright'
import {canonical,sha256} from './c39_snapshot_transfer.mjs'

const paths=new Map([
 ['/c41_browser_journal.mjs',readFileSync(new URL('./c41_browser_journal.mjs',import.meta.url))],
 ['/c43_public_trust.mjs',readFileSync(new URL('./c43_public_trust.mjs',import.meta.url))]
])
const root=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const key1=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const key2=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const intruder=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const PUBLIC=key=>key.publicKey.export({format:'jwk'})
const OWNER='11111111-1111-4111-8111-111111111111'
const OTHER='22222222-2222-4222-8222-222222222222'
const TIME=1000
const namespace=()=>randomUUID().replaceAll('-','').slice(0,24)
const signPart=(privateKey,domain,body)=>sign('sha256',Buffer.from(domain+'\0'+canonical(body)),
 {key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
const keyEntry=(kid,publicJwk,status='active',extras={})=>({
 kid,publicJwk,notBefore:0,notAfter:30000,status,...extras
})
const KEY1=keyEntry('kid-a',PUBLIC(key1))
const KEY2=keyEntry('kid-b',PUBLIC(key2))
const baseKeys=[KEY1,KEY2]
function policy({revision=1,epoch=1,keys=baseKeys,expiresAt=20000,issuedAt=500,signer=root.privateKey}={}){
 const body={version:1,revision,epoch,issuer:'rutacap-c43-fixture',
  audience:'rutacap-c43-offline',issuedAt,expiresAt,keys}
 return {...body,signature:signPart(signer,'RUTACAP-C43-TRUST-P256-V1',body)}
}
function grant({kid='kid-a',signer=key1.privateKey,ownerId=OWNER,sessionId='session-a',
 jti='jti-1',epoch=1,issuedAt=700,notBefore=700,expiresAt=3000,
 snapshotId='c43-snap',checkpoint='checkpoint-1',answer='A'}={}){
 const rows=[{stream:'events',ordinal:1,item:{eventId:'ev-1',answer}}]
 const manifest={ownerId,snapshotId,checkpoint,counts:{events:1,sessions:0},
  digest:sha256({ownerId,snapshotId,checkpoint,rows}),expiresAt}
 const body={version:2,kid,epoch,issuer:'rutacap-c43-fixture',
  audience:'rutacap-c43-offline',ownerId,sessionId,jti,
  issuedAt,notBefore,expiresAt,manifest}
 return {...body,signature:signPart(signer,'RUTACAP-C43-GRANT-P256-V2',body)}
}
let server,base
test.before(async()=>{
 server=createServer((req,res)=>{
  if(paths.has(req.url)){
   res.writeHead(200,{'content-type':'text/javascript;charset=utf-8','cache-control':'no-store'})
   res.end(paths.get(req.url))
  }else if(req.url==='/'){
   res.writeHead(200,{'content-type':'text/html;charset=utf-8','cache-control':'no-store'})
   res.end('<!doctype html><meta charset="utf-8"><title>C43 offline fixture</title>')
  }else{res.writeHead(404);res.end()}
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 base='http://127.0.0.1:'+server.address().port
})
test.after(async()=>new Promise(resolve=>server.close(resolve)))
async function setup(page,{ns=namespace(),clock=TIME,rootPublic=PUBLIC(root)}={}){
 await page.goto(base+'/')
 await page.evaluate(async({ns,clock,rootPublic})=>{
  const m=await import('/c43_public_trust.mjs')
  window.fixtureClock=clock
  window.trust=m.createC43Trust({namespace:ns,rootPublicJwk:rootPublic,
   now:()=>window.fixtureClock})
 },{ns,clock,rootPublic})
}
const call=(page,fn,args)=>page.evaluate(fn,args)
async function close(page){
 if(page.isClosed())return
 await page.evaluate(async()=>{try{await window.trust.close()}catch{}})
 await page.close()
}
const apply=(page,p,options)=>call(page,({p,options})=>window.trust.applyPolicy(p,options),{p,options})
const accept=(page,g,options={})=>call(page,({g,options})=>
 window.trust.accept({envelope:g,ownerId:g.ownerId,sessionId:g.sessionId,...options}),{g,options})
const err=async(page,expr,expected,args)=>{
 const code=await call(page,async({expr,args})=>{
  try{
   if(expr==='policy')await window.trust.applyPolicy(args.policy,args.options)
   else if(expr==='grant')await window.trust.accept({envelope:args.grant,
    ownerId:args.ownerId??args.grant.ownerId,
    sessionId:args.sessionId??args.grant.sessionId,
    abortBeforeCommit:args.abortBeforeCommit})
   else if(expr==='page')await window.trust.checkBeforePage(args)
   return 'UNEXPECTED'
  }catch(e){return e.code}
 },{expr,args})
 assert.equal(code,expected)
}
for(const [engine,launcher] of [['Chromium',chromium],['WebKit-Linux',webkit]]){
 test('C43 '+engine+' trust policy and ledger',{timeout:180000},async t=>{
  const browser=await launcher.launch({headless:true})
  t.after(()=>browser.close())
  const context=await browser.newContext({serviceWorkers:'block'})
  t.after(()=>context.close())
  await context.route('**/*',route=>
   route.request().url().startsWith(base+'/')?route.continue():route.abort())

  await t.test('pinned public root accepts signed policy; grant verified; retry is idempotent',async()=>{
   const p=await context.newPage();await setup(p)
   const po=policy(),g=grant()
   assert.equal((await apply(p,po)).revision,1)
   assert.deepEqual(await accept(p,g),{resumed:false,revision:1,jti:'jti-1'})
   assert.deepEqual(await accept(p,g),{resumed:true,revision:1,jti:'jti-1'})
   assert.equal(await call(p,()=>window.trust.countGrants()),1)
   const noPriv=await call(p,()=>Object.values(window.trust).every(x=>typeof x!=='object'))
   assert.ok(noPriv)
   await close(p)
  })

  await t.test('untrusted root, forged policy, unknown signature and private JWK refused',async()=>{
   const p=await context.newPage();await setup(p)
   await err(p,'policy','SIGNATURE_INVALID',{policy:policy({signer:intruder.privateKey})})
   await err(p,'policy','SIGNATURE_INVALID',{policy:{...policy(),revision:8}})
   await err(p,'policy','SIGNATURE_INVALID',{policy:{...policy(),epoch:4}})
   const wrong=await context.newPage();await setup(wrong,{rootPublic:PUBLIC(intruder)})
   await err(wrong,'policy','SIGNATURE_INVALID',{policy:policy()})
   await close(wrong)
   await close(p)
  })

  await t.test('monotonic policy rejects rollback, same-revision fork and rollback of epoch',async()=>{
   const p=await context.newPage();await setup(p)
   const p1=policy(),p2=policy({revision:2,epoch:2}),fork=policy({revision:2,epoch:2,expiresAt:18000})
   await apply(p,p1);await apply(p,p2)
   await err(p,'policy','POLICY_ROLLBACK',{policy:p1})
   await err(p,'policy','POLICY_ROLLBACK',{policy:fork})
   await err(p,'policy','POLICY_ROLLBACK',{policy:policy({revision:3,epoch:1})})
   assert.equal((await apply(p,p2)).idempotent,true)
   await close(p)
  })

  await t.test('rotation: kid-b accepts; retired kid-a only previously issued grant, no fallback',async()=>{
   const p=await context.newPage();await setup(p)
   const retired=keyEntry('kid-a',PUBLIC(key1),'retired',{retiredAt:1200})
   await apply(p,policy({revision:2,keys:[retired,KEY2]}))
   assert.equal((await accept(p,grant({kid:'kid-b',signer:key2.privateKey,jti:'b1'}))).resumed,false)
   assert.equal((await accept(p,grant({jti:'a-old',issuedAt:700}))).resumed,false)
   await call(p,()=>{window.fixtureClock=1500})
   await err(p,'grant','KEY_INACTIVE',{grant:grant({jti:'a-new',issuedAt:1300,notBefore:1300})})
   await err(p,'grant','KEY_REVOKED',{grant:grant({jti:'x',kid:'unknown'})})
   await close(p)
  })

  await t.test('revocation epoch blocks cached grant even when key still valid',async()=>{
   const p=await context.newPage();await setup(p)
   const g=grant()
   await apply(p,policy())
   await accept(p,g)
   await apply(p,policy({revision:2,epoch:2,keys:[keyEntry('kid-a',PUBLIC(key1),'revoked'),KEY2]}))
   await err(p,'grant','EPOCH_REVOKED',{grant:g})
   await err(p,'grant','EPOCH_REVOKED',{grant:grant({kid:'kid-b',signer:key2.privateKey,jti:'epoch-old'})})
   const updated=grant({kid:'kid-b',signer:key2.privateKey,jti:'epoch-new',epoch:2})
   assert.equal((await accept(p,updated)).resumed,false)
   await close(p)
  })

  await t.test('replay nonce reused in another session or generation is rejected',async()=>{
   const p=await context.newPage();await setup(p)
   await apply(p,policy())
   await accept(p,grant({jti:'shared'}))
   await err(p,'grant','REPLAY_REJECTED',{grant:grant({jti:'shared',sessionId:'session-b'})})
   await err(p,'grant','REPLAY_REJECTED',{grant:grant({jti:'shared',snapshotId:'different'})})
   await err(p,'grant','GRANT_CLAIMS_INVALID',{grant:grant({jti:'other'}),ownerId:OTHER})
   await close(p)
  })

  await t.test('future/expired claims and expired signing keys fail closed, no fallback',async()=>{
   const p=await context.newPage();await setup(p)
   await apply(p,policy({keys:[keyEntry('kid-a',PUBLIC(key1),'active',{notAfter:2000}),KEY2]}))
   await err(p,'grant','KEY_INACTIVE',{grant:grant({expiresAt:3000})})
   await err(p,'grant','GRANT_CLAIMS_INVALID',{grant:grant({jti:'future',notBefore:1500})})
   await err(p,'grant','GRANT_CLAIMS_INVALID',{grant:grant({jti:'expired',expiresAt:999})})
   await call(p,()=>{window.fixtureClock=20001})
   await err(p,'grant','POLICY_INVALID',{grant:grant({jti:'post-expiry'})})
   await close(p)
  })

  await t.test('two tabs: revocation catches paused transfer with BroadcastChannel and IDB',async()=>{
   const ns=namespace(),a=await context.newPage(),b=await context.newPage()
   await setup(a,{ns});await setup(b,{ns})
   const p1=policy(),p2=policy({revision:2,epoch:2,keys:[
    keyEntry('kid-a',PUBLIC(key1),'revoked'),KEY2]})
   await apply(a,p1)
   await accept(a,grant())
   await call(a,()=>{window.awaiting=new Promise(resolve=>window.release=resolve)
    window.pending=window.trust.checkBeforePage({revision:1,wait:()=>window.awaiting})
     .then(()=>'UNEXPECTED',e=>e.code)})
   await apply(b,p2)
   await a.waitForFunction(async()=>{
    const e=await window.trust.getPolicy();return e.revision===2
   })
   await call(a,()=>window.release())
   assert.equal(await call(a,()=>window.pending),'TRUST_CHANGED')
   await err(a,'grant','EPOCH_REVOKED',{grant:grant()})
   await close(a);await close(b)
  })

  await t.test('policy change still blocks old manifest after tab reload/missed broadcast',async()=>{
   const ns=namespace(),a=await context.newPage();await setup(a,{ns})
   const p1=policy(),p2=policy({revision:2,epoch:2,keys:[
    keyEntry('kid-a',PUBLIC(key1),'revoked'),KEY2]})
   await apply(a,p1)
   await accept(a,grant())
   await close(a)
   const b=await context.newPage();await setup(b,{ns});await apply(b,p2)
   await close(b)
   const reloaded=await context.newPage();await setup(reloaded,{ns})
   await err(reloaded,'grant','EPOCH_REVOKED',{grant:grant()})
   await close(reloaded)
  })

  await t.test('IDB injected abort leaves neither policy advance nor partial grant',async()=>{
   const p=await context.newPage();await setup(p)
   const p1=policy()
   await err(p,'policy','INJECTED_ABORT',{policy:p1,options:{abortBeforeCommit:true}})
   assert.equal(await call(p,async()=>{
    try{await window.trust.getPolicy();return 'UNEXPECTED'}catch(e){return e.code}
   }),'NO_TRUST_POLICY')
   await apply(p,p1)
   await err(p,'grant','INJECTED_ABORT',{grant:grant(),abortBeforeCommit:true})
   assert.equal(await call(p,()=>window.trust.countGrants()),0)
   assert.equal((await accept(p,grant())).resumed,false)
   await close(p)
  })

  await t.test('two tabs racing revisions cannot downgrade newest trusted policy',async()=>{
   const ns=namespace(),a=await context.newPage(),b=await context.newPage()
   await setup(a,{ns});await setup(b,{ns})
   await apply(a,policy())
   const rev2=policy({revision:2}),rev3=policy({revision:3,epoch:2})
   const states=await Promise.all([
    call(a,async p=>{try{return (await window.trust.applyPolicy(p)).revision}
       catch(e){return e.code}},rev2),
    call(b,async p=>{try{return (await window.trust.applyPolicy(p)).revision}
       catch(e){return e.code}},rev3)
   ])
   assert.ok(states.includes(3))
   assert.ok(states.every(x=>[2,3,'POLICY_ROLLBACK'].includes(x)))
   assert.equal((await call(a,()=>window.trust.getPolicy())).revision,3)
   await close(a);await close(b)
  })
 })
}
