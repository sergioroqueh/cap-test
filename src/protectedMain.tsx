import React from 'react'
import ReactDOM from 'react-dom/client'
import ProtectedApp from './ProtectedApp'
import {LegalLinks} from './LegalLinks'
import {ensureProtectedWorker} from './protectedWorker'
import './styles.css'
import './focus.css'
import './commercial.css'
const root=ReactDOM.createRoot(document.getElementById('root')!)
root.render(<p role="status">Preparando acceso protegido de RutaCAP…</p>)
void ensureProtectedWorker().then(()=>{
 root.render(<React.StrictMode><ProtectedApp/><LegalLinks/></React.StrictMode>)
}).catch(()=>{
 root.render(<main><h1>RutaCAP</h1><p role="alert">No se ha podido actualizar el acceso protegido. Se requiere conexión y un navegador compatible.</p><button onClick={()=>location.reload()}>Reintentar</button><LegalLinks/></main>)
})
