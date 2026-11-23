import { useState } from 'react'
import { passwordConfigured, setAccountPassword } from './supabase'

// Only a signed-in, email-confirmed account can use this panel.
// Supabase Auth stores password hashes; RutaCAP never persists passwords in browser storage.
export function CommercialPasswordPanel({signedIn}:{signedIn:boolean}){
 const [first,setFirst]=useState('')
 const [second,setSecond]=useState('')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 if(!signedIn || !passwordConfigured)return null
 async function submit(){
  if(busy)return
  setMessage('');setError('')
  if(first.length<12 || first.length>128){setError('Usa una contraseña de entre 12 y 128 caracteres.');return}
  if(first!==second){setError('Las contraseñas no coinciden.');return}
  setBusy(true)
  try {
   await setAccountPassword(first)
   setFirst('');setSecond('')
   setMessage('Contraseña guardada. Cuando cierres sesión podrás volver a entrar con tu correo y esta contraseña, o con un código.')
  }catch{
   setError('No se pudo guardar la contraseña. Comprueba que tu correo está confirmado y vuelve a intentarlo.')
  }finally{setBusy(false)}
 }
 return <section className="panel account" aria-label="Acceso con contraseña">
  <small>SEGURIDAD DE LA CUENTA</small>
  <h2>Acceder sin pedir un código cada vez</h2>
  <p>Puedes crear o cambiar una contraseña para tu cuenta de correo ya verificada. El inicio por código seguirá disponible.</p>
  <form className="pro-email-signin" onSubmit={e=>{e.preventDefault();void submit()}}>
   <label htmlFor="rutacap-account-password">Nueva contraseña (mínimo 12 caracteres)</label>
   <input id="rutacap-account-password" type="password" autoComplete="new-password" minLength={12} maxLength={128}
    value={first} onChange={e=>setFirst(e.target.value)} disabled={busy} required/>
   <label htmlFor="rutacap-account-password-confirm">Repetir contraseña</label>
   <input id="rutacap-account-password-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128}
    value={second} onChange={e=>setSecond(e.target.value)} disabled={busy} required/>
   <button type="submit" disabled={busy||first.length<12||first!==second}>
    {busy?'Guardando…':'Guardar contraseña'}
   </button>
  </form>
  {message&&<p role="status">{message}</p>}
  {error&&<p role="alert">{error}</p>}
 </section>
}
