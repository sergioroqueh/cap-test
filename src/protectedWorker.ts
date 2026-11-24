// Wait for the replacement worker before mounting any protected content UI.
export async function ensureProtectedWorker():Promise<void>{
 if(!('serviceWorker' in navigator)||!window.isSecureContext)throw Error('R94_WORKER_REQUIRED')
 const sw=navigator.serviceWorker
 await sw.register('/sw.js',{scope:'/',updateViaCache:'none'})
 const deadline=Date.now()+15000
 while(Date.now()<deadline){
  const controller=sw.controller
  if(controller){
   const version=await new Promise<string>(resolve=>{
    const channel=new MessageChannel()
    const timer=window.setTimeout(()=>{channel.port1.close();resolve('')},500)
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(String(event.data))}
    try{controller.postMessage('R94_WORKER_VERSION',[channel.port2])}catch{clearTimeout(timer);channel.port1.close();resolve('')}
   })
   if(version==='rutacap-protected-network-only-v1'&&sw.controller===controller)return
  }
  await new Promise(resolve=>setTimeout(resolve,200))
 }
 throw Error('R94_WORKER_NOT_READY')
}
