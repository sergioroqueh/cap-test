import { ProIcon } from './CommercialHome'

// C5 local UX prototype only. No auth client, personal data, or OAuth redirects.
export function CommercialAccountPreview({onContinue}:{onContinue:()=>void}){
 return <section className="pro-account-preview" aria-label="Acceso comercial en preparación">
  <div className="pro-account-intro"><span className="pro-account-tag">ACCESO · PREVIEW</span><h2>Tu próximo destino: aprobar.</h2><p>Una sola cuenta para conservar favoritos, resultados y tu ruta de estudio.</p></div>
  <button type="button" className="pro-google-button" disabled aria-describedby="pro-google-status"><svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#4285F4" d="M44 24.5c0-1.4-.1-2.8-.4-4.2H24v8h11.2a9.6 9.6 0 0 1-4.2 6.3v5.2h6.8c4-3.7 6.2-9.1 6.2-15.3Z"/><path fill="#34A853" d="M24 45c5.6 0 10.4-1.9 13.8-5.2L31 34.6a12.5 12.5 0 0 1-18.6-6.5H5.4v5.4A21 21 0 0 0 24 45Z"/><path fill="#FBBC05" d="M12.4 28.1a12.6 12.6 0 0 1 0-8.2v-5.4h-7a21 21 0 0 0 0 19Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.7 1 7.8 3.1l6-6A20.1 20.1 0 0 0 24 3 21 21 0 0 0 5.4 14.5l7 5.4A12.5 12.5 0 0 1 24 11.2Z"/></svg>Continuar con Google</button>
  <p id="pro-google-status" className="pro-account-status">Todavía no disponible en esta preview. No se envían datos a Google ni a Supabase.</p>
  <button type="button" className="pro-guest-button" onClick={onContinue}><span>Continuar como invitado</span><span aria-hidden="true">›</span></button>
  <div className="pro-account-benefits"><span><ProIcon name="file"/> Exámenes reales</span><span><ProIcon name="chart"/> Progreso personal</span><span><ProIcon name="bank"/> Banco general</span></div>
 </section>
}
