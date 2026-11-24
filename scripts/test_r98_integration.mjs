import {createCaptchaChallenge} from '../src/captchaChallenge.mjs'
import {validateAttribution,requireSessionAttributions} from '../src/sourceAttribution.mjs'
function runCaptchaTests(create){
 const results=[],assert=v=>{if(!v)throw Error('assertion failed')};
 function reject(fn){try{fn()}catch(e){if(!String(e.message).startsWith('R98_'))throw e;return}throw Error('expected failure')}
 const fixture=()=>{let now=1000,callbacks,removed=0;const states=[];const c=create({now:()=>now,render:(el,opts)=>{callbacks=opts;return 'synthetic'},remove:()=>removed++});c.mount({},'synthetic-sitekey',s=>states.push(s));return {c,states,cb:callbacks,advance:n=>now+=n,removed:()=>removed}}
 function test(n,f){f();results.push(n)}
 test('no token before CAPTCHA success',()=>{const f=fixture();reject(()=>f.c.consume())})
 test('token consumed once',()=>{const f=fixture();f.cb.callback('synthetic-token');assert(f.states.at(-1)==='ready');assert(f.c.consume()==='synthetic-token');reject(()=>f.c.consume())})
 test('provider expiration clears token',()=>{const f=fixture();f.cb.callback('synthetic-token');f.cb['expired-callback']();reject(()=>f.c.consume());assert(f.states.at(-1)==='expired')})
 test('local conservative expiration',()=>{const f=fixture();f.cb.callback('synthetic-token');f.advance(240000);reject(()=>f.c.consume())})
 test('provider error clears token',()=>{const f=fixture();f.cb.callback('synthetic-token');f.cb['error-callback']();reject(()=>f.c.consume());assert(f.states.at(-1)==='error')})
 test('timeout clears token',()=>{const f=fixture();f.cb.callback('synthetic-token');f.cb['timeout-callback']();reject(()=>f.c.consume())})
 test('invalid token rejected',()=>{const f=fixture();f.cb.callback('');reject(()=>f.c.consume());f.cb.callback('x'.repeat(4097));reject(()=>f.c.consume())})
 test('closed widget ignores late callbacks and removes once',()=>{const f=fixture();f.c.close();f.cb.callback('synthetic-token');f.c.close();reject(()=>f.c.consume());assert(f.removed()===1&&f.states.length===0)})
 return results
}
function runAttributionTests(validate,requireSources){
 const result=[],assert=x=>{if(!x)throw Error('assertion failed')},a={issuer:'Synthetic issuer',title:'Synthetic question bank',questionnaireUrl:'https://example.invalid/questionnaire',answerUrl:null,conditionsUrl:'https://example.invalid/conditions',updatedOn:null}
 const reject=fn=>{try{fn()}catch(e){if(e.message==='R98_ATTRIBUTION_INVALID')return;throw e}throw Error('expected reject')}
 const test=(name,fn)=>{fn();result.push(name)}
 test('valid source metadata without invented update date',()=>assert(validate(a)===a))
 test('missing attribution denied',()=>reject(()=>requireSources([{id:'q'}])))
 test('historical question requires answer source',()=>reject(()=>requireSources([{examId:'synthetic',sourceAttribution:a}])))
 test('valid historical attribution accepted',()=>assert(requireSources([{examId:'synthetic',sourceAttribution:{...a,answerUrl:'https://example.invalid/key'}}]).length===1))
 test('reject arbitrary protocol, credentials and private fields',()=>{reject(()=>validate({...a,questionnaireUrl:'javascript:alert(1)'}));reject(()=>validate({...a,conditionsUrl:'https://user@example.invalid/x'}));reject(()=>validate({...a,rightsReference:'PRIVATE'}))})
 test('do not accept bad update date',()=>reject(()=>validate({...a,updatedOn:'unknown'})))
 return result
}
const passed=[...runCaptchaTests(createCaptchaChallenge),...runAttributionTests(validateAttribution,requireSessionAttributions)]
for(const test of passed)console.log('PASS',test)
console.log(passed.length+' R98 synthetic component checks passed')
