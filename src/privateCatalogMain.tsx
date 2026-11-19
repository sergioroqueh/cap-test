import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import './focus.css'
import './commercial.css'
import PrivateCatalog from './PrivateCatalogView'
const permitted=import.meta.env.DEV&&import.meta.env.MODE==='catalog-local'&&location.hostname==='127.0.0.1'&&location.port==='4188'
if(permitted){
 document.documentElement.dataset.theme='dark'
 ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><PrivateCatalog/></React.StrictMode>)
}else document.getElementById('root')!.textContent='Catálogo local no disponible.'
