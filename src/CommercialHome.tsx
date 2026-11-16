import { useState } from 'react'
export type ProIconName='road'|'file'|'bank'|'warning'|'star'|'repeat'|'flag'|'home'|'chart'|'person'
export function ProIcon({name}:{name:ProIconName}){
 const paths:Record<ProIconName,string>={
 road:'M4 21C5 11 13 4 21 3M11 21C10 12 16 6 21 3M8 21l1-4m2-4 2-3m3-3 2-2',
 file:'M6 3h9l3 3v15H6zM14 3v5h4M9 12h6m-6 4h6',
 bank:'m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5',
 warning:'M12 3 2 20h20zM12 9v5m0 3v.2',
 star:'m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z',
 repeat:'M20 10a8 8 0 0 0-14-4L3 9m0-5v5h5M4 14a8 8 0 0 0 14 4l3-3m0 5v-5h-5',
 flag:'M5 22V3m0 1c5-4 9 4 15 0v12c-6 4-10-4-15 0M10 4v11m5-10v12M5 9c5-4 9 4 15 0',
 home:'m3 11 9-8 9 8M5 10v11h14V10m-9 11v-7h4v7',
 chart:'M4 20V12h4v8zm6 0V7h4v13zm6 0V3h4v17z',
 person:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-2a8 6 0 0 1 16 0v2z'}
 return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>
}
export function ProBrand(){return <span className="pro-brand"><span className="pro-brand-mark"><ProIcon name="road"/></span><span>CAP Test <b>Pro</b><small>PREPARACIÓN CAP</small></span></span>}
// Original illustrative pictograms, not official coats of arms. Coverage is independent.
export const REGIONS=[
 ['clm','Castilla-La Mancha','#a72c42','M3 21h18V10h-3V5h-4v5h-4V5H6v5H3zM10 21v-5h4v5'],
 ['an','Andalucía','#167957','M2 21h20M4 21V11a3 3 0 0 1 6 0v10m4 0V11a3 3 0 0 1 6 0v10M7 8l5-5 5 5'],
 ['ar','Aragón','#ac7728','M3 21h18M6 21V8h4v13m4 0V8h4v13M5 8l3-5 3 5m2 0 3-5 3 5'],
 ['as','Asturias','#256ca4','M12 3v18M5 9h14M8 4l4 3 4-3M7 21h10'],
 ['ib','Illes Balears','#b27823','M2 18c5-5 8 5 13 0s7-2 7-2M6 15V8m0 0c-2-3-4-1-4-1m4 1c2-3 5-1 5-1M16 12l3-7 2 7z'],
 ['cn','Canarias','#4679ad','M2 20 10 5l5 9 3-5 4 11zM8 9l2-4 3 6'],
 ['cb','Cantabria','#a74244','M2 19 8 5l6 14 5-9 3 9M4 22h16'],
 ['cl','Castilla y León','#923c73','M3 21V8h3V4h4v4h4V4h4v4h3v13zM10 21v-5h4v5'],
 ['ct','Cataluña','#bc8526','M3 5h18v14H3zM7 5v14m4-14v14m4-14v14m4-14v14'],
 ['vc','Comunitat Valenciana','#be782b','M3 21h18M6 21V10h4v11m4 0V10h4v11M5 10 8 4l3 6m2 0 3-6 3 6'],
 ['ex','Extremadura','#387d52','M3 20h18M12 20v-7M4 12a5 5 0 0 1 3-6 5 5 0 0 1 10 0 5 5 0 0 1 3 6z'],
 ['ga','Galicia','#387ea4','M12 2v20M5 8h14M7 4h10M7 20h10'],
 ['ri','La Rioja','#9b354a','M12 2v5m-4-2 4 2 4-2M7 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm10 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-5 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
 ['md','Comunidad de Madrid','#b82f42','M12 3l2 4 5 .7-3.5 3.5.8 4.8-4.3-2.3-4.3 2.3.8-4.8L5 7.7 10 7zM3 21h18'],
 ['mc','Región de Murcia','#a84448','M3 21h18M5 10l3 3 4-8 4 8 3-3-1 7H6z'],
 ['nc','Navarra','#b02f43','M3 3h18v18H3zM3 3l18 18M21 3 3 21M12 3v18M3 12h18'],
 ['pv','País Vasco','#39856c','M3 3h18v18H3zM3 3l18 18M21 3 3 21M12 3v18M3 12h18'],
 ['ce','Ceuta','#476879','M3 20h18M5 20V8h14v12M8 8V3h8v5M10 20v-5h4v5'],
 ['ml','Melilla','#4d76aa','M3 20h18M5 20v-9h4V7h6v4h4v9M12 7V3l5 2-5 2']
] as const
type Region=typeof REGIONS[number]
export function RegionMark({region}:{region:Region}){return <span className="pro-region-mark" style={{background:region[2]}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={region[3]}/></svg></span>}
type Props={bankCount:number;seenCount:number;hasArchive:boolean;archiveCount:number;onArchive:()=>void;onBank:()=>void;onErrors:()=>void;onFavorites:()=>void;onTop:()=>void;onExam:()=>void;onStats:()=>void;working:boolean}
export default function CommercialHome(p:Props){
 const [regions,setRegions]=useState(false)
 const seen=Math.min(p.bankCount,p.seenCount),coverage=p.bankCount?Math.round(seen/p.bankCount*100):0
 const actions:[ProIconName,string,string,()=>void,string][]=[
 ['warning','Errores','Repasa tus fallos',p.onErrors,'red'],['star','Favoritos','Preguntas guardadas',p.onFavorites,'yellow'],
 ['repeat','Más repetidas','Frecuencia real',p.onTop,'yellow'],['flag','Simulacro','100 preguntas · 2 h',p.onExam,'blue']]
 return <section className="pro-dashboard" aria-label="Inicio CAP Test Pro">
  <div className="pro-welcome"><span className="pro-kicker">TU RUTA CAP <i aria-hidden="true">//</i></span><h1>Seguimos en ruta.</h1><p>Elige cómo quieres preparar tu próximo examen.</p></div>
  <div className="pro-destination">
   <div className="pro-sign"><div><small>TU PRÓXIMO DESTINO</small><strong>aprobar<span>.</span></strong></div><ProIcon name="road"/></div>
   <div className="pro-progress"><div><b>Banco explorado</b><strong>{coverage} %</strong></div><div className="pro-track" role="progressbar" aria-label="Banco general explorado" aria-valuenow={coverage} aria-valuemin={0} aria-valuemax={100}><i style={{width:coverage+'%'}}/></div><button onClick={p.onStats}>{seen.toLocaleString('es-ES')} de {p.bankCount.toLocaleString('es-ES')} preguntas vistas <span>›</span></button></div>
  </div>
  <div className="pro-main-grid">
   <article className="pro-route-card"><div className="pro-card-title"><ProIcon name="file"/><h2>Exámenes oficiales</h2></div><p>Convocatorias reales, con plantilla y trazabilidad.</p>
    <button className="pro-region-feature" aria-expanded={regions} aria-controls="pro-region-list" onClick={()=>setRegions(!regions)}><RegionMark region={REGIONS[0]}/><span><b>Castilla-La Mancha</b><small>Comunidad prioritaria</small></span><span aria-hidden="true">{regions?'⌃':'›'}</span></button>
    <button className="pro-archive-link" disabled={!p.hasArchive} onClick={p.onArchive}>Consultar archivo histórico <span>›</span></button><small className="pro-archive-note">{p.archiveCount} modelos con plantilla · procedencia regional en catalogación</small>
   </article>
   <button className="pro-route-card pro-bank" onClick={p.onBank}><div className="pro-card-title"><ProIcon name="bank"/><h2>Banco de preguntas</h2></div><strong>{p.bankCount.toLocaleString('es-ES')}</strong><p>preguntas disponibles</p><span className="pro-bank-link">Entrar al banco <span>›</span></span></button>
  </div>
  {regions&&<section className="pro-regions" id="pro-region-list"><h2>Comunidades autónomas</h2><p>El archivo regional se incorporará conforme se verifiquen las fuentes.</p><div className="pro-region-grid">{REGIONS.map(r=><div className="pro-region-row" key={r[0]}><RegionMark region={r}/><span><b>{r[1]}</b><small>{r[0]==='clm'?'Prioritaria · en catalogación':'En preparación'}</small></span></div>)}</div></section>}
  <div className="pro-quick-grid">{actions.map(([icon,title,desc,action,color])=><button key={title} className={'pro-quick '+color} onClick={action} disabled={p.working||!p.hasArchive}><ProIcon name={icon}/><span><b>{title}</b><small>{desc}</small></span><span aria-hidden="true">›</span></button>)}</div>
  <p className="pro-independent">Preparación independiente · No es una aplicación oficial.</p>
 </section>
}
