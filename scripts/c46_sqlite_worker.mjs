// C46 separate Node process worker. JSON request through stdin, not command-line secrets.
import {createC46SqliteAuthority} from './c46_sqlite_authority.mjs'
let raw=''
for await(const part of process.stdin)raw+=part
try {
 const {dbPath,config={},action,payload={},options={}}=JSON.parse(raw)
 const api=createC46SqliteAuthority({dbPath,...config})
 if(!['registerDevice','revokeDevice','advanceTime','renewPolicy','decide','inspect','auditTrail']
  .includes(action))throw Object.assign(Error('ACTION_INVALID'),{code:'ACTION_INVALID'})
 const result=api[action](...(action==='decide'||action==='revokeDevice'
   ?[payload,options]:action==='registerDevice'?[payload]:action==='advanceTime'?
   [payload.delta]:action==='renewPolicy'?[payload.ttl]:[]))
 process.stdout.write(JSON.stringify({result})+'\n')
 api.close()
} catch(e){process.stdout.write(JSON.stringify({error:e.code||e.message})+'\n');process.exitCode=1}
