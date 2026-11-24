// R98: single-use, memory-only CAPTCHA challenge; no provider on import.
export function createCaptchaChallenge({render,remove,now=()=>Date.now()}){
 let widget=null,token=null,issued=0,closed=false
 const clear=()=>{token=null;issued=0}
 return {
  mount(element,sitekey,onState){
   if(closed||widget!==null||typeof sitekey!=='string'||!sitekey)throw Error('R98_CAPTCHA_CONFIG')
   const update=s=>{if(!closed)onState(s)}
   widget=render(element,{sitekey,theme:'auto',size:'flexible',action:'rutacap_auth',
    callback(v){if(!closed){clear();if(typeof v==='string'&&v.length>0&&v.length<=4096){token=v;issued=now();update('ready')}else update('error')}},
    'expired-callback'(){clear();update('expired')},
    'error-callback'(){clear();update('error');return true},
    'timeout-callback'(){clear();update('expired')}
   })
  },
  consume(){if(closed||!token||now()-issued>=240000||now()<issued){clear();throw Error('R98_CAPTCHA_REQUIRED')}const v=token;clear();return v},
  close(){closed=true;clear();if(widget!==null){remove(widget);widget=null}}
 }
}
