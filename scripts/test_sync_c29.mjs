import test from 'node:test'
import assert from 'node:assert/strict'
import {SyncConflictError,unionRecords,replayProgress,nextLogicalClock,
  createAnswerEvent,createFavoriteEvent,syncOfflineFirst} from '../src/syncCore.mjs'

const owner='11111111-1111-4111-8111-111111111111'
const other='22222222-2222-4222-8222-222222222222'
const ident=(userId=owner)=>({verified:true,isAnonymous:false,consented:true,userId})
const empty=()=>({events:[],sessions:[]})
const answer=(eventId,deviceId,clock,correct,baselineId)=>createAnswerEvent({
  eventId,deviceId,clock,questionId:'cap-42',questionnaireId:'hist-2026',
  answer:correct?'A':'B',correct,occurredAt:1763400000000+clock,
  ...(baselineId?{baselineId}:{})
})
const fav=(eventId,deviceId,clock,favorite)=>createFavoriteEvent({
  eventId,deviceId,clock,questionId:'cap-42',questionnaireId:'hist-2026',
  favorite,occurredAt:1763400000000+clock
})
const exam=(id)=>({clientId:id,type:'exam',label:'CAP',startedAt:1000,
  completedAt:2000,answered:2,correct:1,incorrect:1,total:2,score:50,
  answers:[{questionId:'cap-42',questionnaireId:'hist-2026',selected:'A',correctAnswer:'A',correct:true},
           {questionId:'cap-43',questionnaireId:'hist-2026',selected:'D',correctAnswer:'A',correct:false}]})
class Local {
  constructor(records=empty()){this.rows=structuredClone(records);this.writes=0}
  async ensureSessionIds(idFactory){
    const copy=structuredClone(this.rows)
    for(const session of copy.sessions) if(!session.clientId) session.clientId=idFactory()
    this.rows=copy;this.writes++
  }
  async snapshot(){return structuredClone(this.rows)}
  async merge(incoming){this.rows=unionRecords(this.rows,incoming);this.writes++}
}
class Remote {
  constructor(){this.byUser=new Map();this.calls=0;this.failAfterInsert=false}
  async pull(id){this.calls++;return structuredClone(this.byUser.get(id)||empty())}
  async insertMissing(id,rows){
    this.calls++
    this.byUser.set(id,unionRecords(this.byUser.get(id)||empty(),rows))
    if(this.failAfterInsert){this.failAfterInsert=false;throw Error('Simulated network loss after server commit')}
  }
}
let nextId=0
const makeId=()=>('00000000-0000-4000-8000-'+String(++nextId).padStart(12,'0'))
const run=(local,remote,identity=ident())=>syncOfflineFirst({
  local,remote,identity,idFactory:makeId,cloudEnabled:true})

test('C29 fails closed: disabled means no local or remote reads/writes',async()=>{
  const remote=new Remote(),local=new Local({events:[answer('a','dev-a',1,true)],sessions:[]})
  assert.equal((await syncOfflineFirst({identity:ident(),local,remote,idFactory:makeId})).status,'disabled')
  assert.equal(remote.calls,0);assert.equal(local.writes,0)
})
test('C29 denies guests, missing opt-in, unverified accounts and anonymous JWT',async()=>{
  const remote=new Remote(),local=new Local()
  for(const identity of [null,{...ident(),isAnonymous:true},{...ident(),consented:false},
    {...ident(),verified:false}])assert.equal((await run(local,remote,identity)).status,'denied')
  assert.equal(remote.calls,0);assert.equal(local.writes,0)
})
test('C29 two offline devices contribute independent answers, replay is deterministic',async()=>{
  const remote=new Remote()
  const a=new Local({events:[answer('a1','dev-a',1,true),answer('a2','dev-a',2,false)],sessions:[]})
  const b=new Local({events:[answer('b1','dev-b',1,true),fav('b2','dev-b',2,true)],sessions:[]})
  assert.equal((await run(a,remote)).status,'ok')
  await run(b,remote);await run(a,remote);await run(b,remote)
  const stored=await remote.pull(owner)
  assert.equal(stored.events.length,4)
  assert.deepEqual(await a.snapshot(),await b.snapshot())
  const p=replayProgress(stored.events)[0]
  assert.deepEqual([p.attempts,p.correct,p.incorrect,p.favorite],[3,2,1,true])
  assert.equal(nextLogicalClock(stored.events),3)
})
test('C29 repeated sync is idempotent even when network fails after remote insert',async()=>{
  const remote=new Remote(),local=new Local({events:[answer('k1','dev-a',1,true)],sessions:[exam('s1')]})
  remote.failAfterInsert=true
  await assert.rejects(run(local,remote),/network loss/)
  assert.equal((await remote.pull(owner)).sessions.length,1)
  await run(local,remote);await run(local,remote)
  const rows=await remote.pull(owner)
  assert.equal(rows.events.length,1);assert.equal(rows.sessions.length,1)
  assert.equal(rows.sessions[0].answers.length,2)
})
test('C29 legacy session identifiers are persisted before retry and do not change',async()=>{
  const remote=new Remote(),old=exam('temporary')
  delete old.clientId
  old.id=17 // IndexedDB internal integer ID is never uploaded
  const local=new Local({events:[],sessions:[old]})
  remote.failAfterInsert=true
  await assert.rejects(run(local,remote))
  const first=(await local.snapshot()).sessions[0].clientId
  assert.ok(first);assert.equal((await remote.pull(owner)).sessions[0].clientId,first)
  await run(local,remote)
  assert.equal((await local.snapshot()).sessions[0].clientId,first)
  assert.equal((await remote.pull(owner)).sessions.length,1)
  assert.equal('id' in (await remote.pull(owner)).sessions[0],false)
})
test('C29 collisions are rejected instead of overwriting history',async()=>{
  assert.throws(()=>unionRecords({events:[answer('same','d1',1,true)],sessions:[]},
    {events:[answer('same','d2',1,false)],sessions:[]}),e=>e.code==='EVENT_KEY_COLLISION')
  assert.throws(()=>unionRecords({events:[],sessions:[exam('s1')]},
    {events:[],sessions:[{...exam('s1'),score:12}]}),e=>e.code==='SESSION_KEY_COLLISION')
})
test('C29 rejects independent legacy baselines instead of adding unknown overlap',()=>{
  const base={questionId:'cap-42',questionnaireId:'hist-2026',attempts:2,correct:1,
    incorrect:1,streak:0,lastAnsweredAt:200,favorite:false}
  const legacy=(id,deviceId)=>({eventId:id,deviceId,clock:1,occurredAt:201,
    questionId:'cap-42',questionnaireId:'hist-2026',kind:'legacy-baseline',progress:base})
  assert.throws(()=>replayProgress([legacy('base-a','dev-a'),legacy('base-b','dev-b')]),
    e=>e.code==='AMBIGUOUS_LEGACY')
  assert.throws(()=>replayProgress([legacy('base-a','dev-a'),answer('new','dev-b',2,true)]),
    e=>e.code==='BASELINE_NOT_ACKNOWLEDGED')
  const p=replayProgress([legacy('base-a','dev-a'),answer('new','dev-b',2,true,'base-a')])[0]
  assert.equal(p.attempts,3);assert.equal(p.correct,2)
})
test('C29 remote tenant separation and no cross-user restoring',async()=>{
  const remote=new Remote()
  await run(new Local({events:[answer('only-a','dev-a',1,true)],sessions:[exam('session-a')]}),remote)
  const b=new Local({events:[answer('only-b','dev-b',1,false)],sessions:[exam('session-b')]})
  await run(b,remote,ident(other))
  assert.equal((await remote.pull(owner)).events[0].eventId,'only-a')
  assert.equal((await remote.pull(other)).events[0].eventId,'only-b')
  assert.equal((await b.snapshot()).sessions[0].clientId,'session-b')
})
test('C29 favorite uses logical ordering and tie-break, not unreliable device clocks',()=>{
  const p=replayProgress([fav('x','dev-a',5,true),fav('y','dev-b',5,false)])[0]
  assert.equal(p.favorite,false)
  const reversed=replayProgress([fav('y','dev-b',5,false),fav('x','dev-a',5,true)])[0]
  assert.deepEqual(p,reversed)
})
test('C29 incomplete or malformed rows fail before network write',async()=>{
  const remote=new Remote()
  const local=new Local({events:[{eventId:'broken',questionId:'cap-42'}],sessions:[]})
  await assert.rejects(run(local,remote),e=>e instanceof SyncConflictError && e.code==='EVENT_INVALID')
  assert.equal(remote.byUser.size,0)
})
