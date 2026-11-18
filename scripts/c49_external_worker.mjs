// C49 isolated, one-shot Node worker: stdin only; no network, no daemon.
import {runC49DurableCommand} from './c49_durable_external.mjs'
let input=''
for await(const part of process.stdin)input+=part
try{
 const request=JSON.parse(input)
 const result=runC49DurableCommand(request)
 if(request.command==='prepare'&&request.crashAt==='afterPrepare')
  process.exit(94) // intent is persisted, no response: explicit pending resolution needed
 if(request.command==='finalize'&&request.crashAt==='afterExternalCommit')
  process.exit(97) // external checkpoint and proof committed, reply lost
 process.stdout.write(JSON.stringify({result})+'\n')
}catch(e){
 process.stdout.write(JSON.stringify({error:e.code||'C49_WORKER_FAILURE'})+'\n')
 process.exitCode=1
}
