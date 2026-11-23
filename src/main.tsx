import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LegalLinks } from './LegalLinks'
import './styles.css'
import './focus.css'
import './commercial.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <LegalLinks />
  </React.StrictMode>
)

if (import.meta.env.PROD && import.meta.env.VITE_CAP_PREVIEW !== 'true' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}
