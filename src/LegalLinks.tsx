// RutaCAP public launch: legal links must remain visible without sign-in.
// Documents are hosted separately on the VPS; no personal data in GitHub.
export function LegalLinks(){
 if(import.meta.env.VITE_CAP_LAUNCH!=='true')return null
 return <footer aria-label="Información legal de RutaCAP" style={{borderTop:'1px solid #293647',padding:'1.25rem 1rem 2rem',background:'#101722',color:'#d4dee9',fontSize:'0.84rem'}}>
  <nav aria-label="Enlaces legales" style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:'0.7rem 1.3rem'}}>
   <a style={{color:'#bcd9fa'}} href="/legal/aviso-legal.html">Aviso legal</a>
   <a style={{color:'#bcd9fa'}} href="/legal/privacidad.html">Privacidad</a>
   <a style={{color:'#bcd9fa'}} href="/legal/condiciones-beta.html">Condiciones de la beta</a>
   <a style={{color:'#bcd9fa'}} href="mailto:info@rutacap.es">info@rutacap.es</a>
  </nav>
  <p style={{textAlign:'center',margin:'0.75rem 0 0',opacity:0.8}}>Preparación CAP independiente · No oficial · Beta gratuita</p>
 </footer>
}
