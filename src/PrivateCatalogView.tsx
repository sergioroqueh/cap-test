import {useRef,useState} from 'react'
import {ProBrand,RegionMark,regionByCode} from './CommercialHome'
import {validatePrivateStage,LETTERS,HELD,C13_SHA,PRIVATE_STAGE_MARKER,type Stage} from './privateCatalog'
import './privateCatalog.css'

export default function PrivateCatalog(){
 const [stage,setStage]=useState<Stage|null>(null),[error,setError]=useState(''),[digest,setDigest]=useState(''),[selected,setSelected]=useState(''),[index,setIndex]=useState(0),[filter,setFilter]=useState(''),[holds,setHolds]=useState(false),[reveal,setReveal]=useState(false),[busy,setBusy]=useState(false)
 const epoch=useRef(0),input=useRef<HTMLInputElement>(null)
 function clear(){epoch.current++;setStage(null);setError('');setDigest('');setSelected('');setIndex(0);setFilter('');setHolds(false);setReveal(false);setBusy(false);if(input.current)input.current.value=''}
 async function read(file:File){
  clear();const token=epoch.current;setBusy(true)
  try{
   if(file.size>30*1024*1024)throw Error('Archivo demasiado grande (máximo 30 MB).')
   const bytes=await file.arrayBuffer()
   const parsed=validatePrivateStage(JSON.parse(new TextDecoder().decode(bytes)))
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')
   if(token!==epoch.current)return
   setStage(parsed);setDigest(hash);setSelected(parsed.models[0].id)
  }catch(e){if(token===epoch.current)setError(e instanceof Error?e.message:'No se pudo leer el paquete.')}
  finally{if(token===epoch.current)setBusy(false)}
 }
 const m=stage?.models.find(x=>x.id===selected)
 const q=filter.trim().toLocaleLowerCase('es')
 const rows=(m?.rows||[]).filter(r=>(!holds||HELD.has(r.modelId+':'+r.number))&&(!q||[String(r.number),r.question,...Object.values(r.options)].some(t=>t.toLocaleLowerCase('es').includes(q))))
 const pos=Math.min(index,Math.max(rows.length-1,0)),row=rows[pos],held=row&&HELD.has(row.modelId+':'+row.number)
 function resetPosition(){setIndex(0);setReveal(false)}
 return <div className="app rc-private" data-private-catalog={PRIVATE_STAGE_MARKER}>
  <header><ProBrand/><span className="rc-private-tag">LOCAL · EDITORIAL</span></header>
  <main className="rc-private-main">
   <section className="panel rc-private-section"><div className="rc-private-region"><RegionMark region={regionByCode('clm')}/><div><small>ARCHIVO DE TRABAJO</small><h1>Castilla-La Mancha</h1></div></div>
    <p>Catálogo editorial privado. Sin puntuación, progreso, sincronización ni publicación.</p>
    <label htmlFor="rc-file">Selecciona el paquete JSON de ensayo</label><input id="rc-file" ref={input} type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];if(f)void read(f)}}/>
    <button className="btn light" onClick={clear}>Cerrar y vaciar catálogo</button>
    {busy&&<p role="status">Comprobando archivo…</p>}{error&&<p role="alert">{error}</p>}
    {stage&&<div role="status"><b>{stage.models.length} modelos · {stage.count} posiciones</b><p>{digest===C13_SHA?'Huella del paquete C13 confirmada.':'Huella distinta de C13: paquete de ensayo no identificado.'}</p><small className="rc-hash">{digest}</small></div>}
   </section>
   {stage&&m&&<section className="panel rc-private-section">
    <label htmlFor="rc-model">Convocatoria y modalidad</label><select id="rc-model" value={selected} onChange={e=>{setSelected(e.target.value);resetPosition()}}>{stage.models.map(x=><option key={x.id} value={x.id}>{x.date} · {x.category==='mercancias'?'Mercancías':'Viajeros'} · {x.kind==='global'?'Global':'Ampliación'} · {x.variant.toUpperCase()}</option>)}</select>
    <label htmlFor="rc-filter">Buscar número o texto</label><input id="rc-filter" value={filter} onChange={e=>{setFilter(e.target.value);resetPosition()}} placeholder="Buscar pregunta…"/>
    <label className="rc-check"><input type="checkbox" checked={holds} onChange={e=>{setHolds(e.target.checked);resetPosition()}}/> Solo los seis casos señalados en C13</label>
    <div className="rc-nav"><button className="btn light" disabled={pos===0} onClick={()=>{setIndex(pos-1);setReveal(false)}}>‹ Anterior</button><b>{rows.length?pos+1:0}/{rows.length}</b><button className="btn light" disabled={pos>=rows.length-1} onClick={()=>{setIndex(pos+1);setReveal(false)}}>Siguiente ›</button></div>
    {!row?<p>Sin coincidencias.</p>:<article className="rc-question"><small>Pregunta {row.number}{row.number>=101?' · Reserva':''}</small><h2>{row.question}</h2>{held&&<p role="note" className="rc-hold">Bloqueo editorial sensible. No utilizar como instrucción práctica.</p>}
    <div className="rc-options">{LETTERS.map(k=><div key={k} className={reveal&&k===row.initialKey?'rc-key':''}><b>{k}</b><span>{row.options[k]}</span></div>)}</div>
    <button className="btn light" onClick={()=>setReveal(!reveal)}>{reveal?'Ocultar respuesta inicial':'Ver respuesta inicial'}</button>
    {reveal&&<p data-testid="initial-key">Plantilla inicial del tribunal: {row.initialKey}. No validación definitiva.</p>}
    <small className="rc-hash">PDF pregunta p. {row.sourcePage} · plantilla p. {row.templatePage} · {row.occurrenceId}</small>
    </article>}
   </section>}
  </main>
 </div>
}
