export type CaptchaState='ready'|'error'|'expired'
export function createCaptchaChallenge(opts:{render:(element:HTMLElement,options:Record<string,unknown>)=>string;remove:(widget:string)=>void;now?:()=>number}):{mount(element:HTMLElement,sitekey:string,onState:(state:CaptchaState)=>void):void;consume():string;close():void}
