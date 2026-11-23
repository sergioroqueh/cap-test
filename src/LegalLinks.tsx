import './legalLinks.css'

// RutaCAP public launch: legal links must remain available without sign-in.
// Documents are generated privately on the VPS; no owner DNI/address in GitHub.
export function LegalLinks(){
 if(import.meta.env.VITE_CAP_LAUNCH!=='true')return null

 return <footer className="pro-legal-footer" aria-label="Información legal de RutaCAP">
  <div className="pro-legal-inner">
   <div className="pro-legal-identity">
    <strong>RutaCAP</strong>
    <span>Preparación CAP independiente · Beta gratuita · No oficial</span>
   </div>
   <div className="pro-legal-links" role="navigation" aria-label="Enlaces legales">
    <a href="/legal/aviso-legal.html">Aviso legal</a>
    <a href="/legal/privacidad.html">Privacidad</a>
    <a href="/legal/condiciones-beta.html">Condiciones de la beta</a>
    <a href="mailto:info@rutacap.es">Contacto</a>
   </div>
  </div>
 </footer>
}
