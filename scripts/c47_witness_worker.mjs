// C47 disposable independent worker; all requests arrive via stdin.
import {createC47WitnessAuthority} from './c47_witness_authority.mjs'
let input=''
for await(const chunk of process.stdin)input+=chunk
try{
 const {dbPath,witnessPath,action,payload={},options={}}=JSON.parse(input)
 if(!['registerDevice','revoke','advance','decide','inspect','getPublicKey']
     .includes(action))throw Object.assign(Error('ACTION_INVALID'),{code:'ACTION_INVALID'})
 const api=createC47WitnessAuthority({dbPath,witnessPath})
 let result
 if(action==='registerDevice')result=api.registerDevice(payload,options)
 else if(action==='revoke')result=api.revoke(payload.deviceId,options)
 else if(action==='advance')result=api.advance(payload.delta,options)
 else if(action==='decide')result=api.decide(payload,options)
 else result=api[action]()
 api.close()
 process.stdout.write(JSON.stringify({result})+'\n')
}catch(e){
 process.stdout.write(JSON.stringify({error:e.code||e.message})+'\n')
 process.exitCode=1
}
