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
// Original, solid regional emblems. Inspired by local symbols, not official heraldry.
// All share a 48-unit canvas and use negative space instead of thin outline strokes.
export const REGIONS=[
 ['clm','Castilla-La Mancha','#bc1739','M8 40H40V36H36V18H32V9H28V12H26V7H22V12H20V9H16V18H12V36H8ZM19 40V32A5 5 0 0 1 29 32V40ZM22 19H26V24H22ZM15 22H18V27H15ZM30 22H33V27H30Z'],
 ['an','Andalucía','#167747','M5 39H43V35H40V18H43V14H31V18H34V35H28V25L24 20L20 25V35H14V18H17V14H5V18H8V35H5ZM8 10Q24 -1 40 10L36 13Q24 5 12 13Z'],
 ['ar','Aragón','#a76b20','M8 40H40V36H37V13L31 5L25 13V36H23V13L17 5L11 13V36H8ZM15 18H19V24H15ZM29 18H33V24H29ZM15 29H19V35H15ZM29 29H33V35H29Z'],
 ['as','Asturias','#145ba4','M21 5H27V15H39V22H27V37H32V42H16V37H21V22H9V15H21ZM10 24L14 24L18 34H15L14 31H10L9 34H6ZM11 28L12 26L13 28ZM34 24C26 24 27 36 33 34V31C30 31 30 27 34 27S38 31 35 31V34C41 36 42 24 34 24Z'],
 ['ib','Illes Balears','#80509b','M6 37Q12 33 18 37T30 37T42 37V40Q36 36 30 40T18 40T6 40ZM10 33L14 15Q7 16 5 10Q12 8 16 12Q15 5 23 6Q25 12 19 15Q26 13 30 19Q22 21 18 17L16 33ZM28 33V25L35 9V24H42L35 33Z'],
 ['cn','Canarias','#226eaa','M4 35L18 11L26 24L33 13L44 35ZM14 18L18 11L23 20L19 18L17 21ZM6 39Q12 36 18 39T30 39T42 39V42Q36 39 30 42T18 42T6 42ZM32 6H38V11H32Z'],
 ['cb','Cantabria','#a82e40','M4 32L16 10L25 25L33 16L44 32ZM12 17L16 10L20 17L16 15ZM5 37Q11 33 17 37T29 37T41 37V40Q35 36 29 40T17 40T5 40Z'],
 ['cl','Castilla y León','#92365d','M5 40H43V36H39V27H34V19H30V27H27V12H30V6H25V9H22V6H17V12H20V27H16V19H12V27H9V36H5ZM21 40V33Q24 28 27 33V40ZM22 16H25V21H22ZM12 30H15V34H12ZM33 30H36V34H33Z'],
 ['ct','Cataluña','#b57b12','M7 11H41V37H7ZM12 14V34H16V14ZM20 14V34H24V14ZM28 14V34H32V14ZM36 14V34H39V14Z'],
 ['vc','Comunitat Valenciana','#ae6b20','M5 40H43V36H39V18H34V11H31V18H27V26H21V18H17V11H14V18H9V36H5ZM21 40V32Q24 28 27 32V40ZM13 23H17V28H13ZM31 23H35V28H31ZM9 7H39V10H9Z'],
 ['ex','Extremadura','#407742','M20 40V30H8L4 23L8 17L7 11L15 7L20 9L24 4L30 8L37 8L41 15L39 19L44 24L39 30H28V40ZM10 40H38V43H10Z'],
 ['ga','Galicia','#287eac','M21 5H27V14H37V20H27V30H21V20H11V14H21ZM8 25H40L36 31Q24 44 12 31ZM19 36H29L31 42H17Z'],
 ['ri','La Rioja','#9d294c','M22 7Q29 2 37 7Q35 15 26 15L24 19H20L24 12Q17 9 12 11Q11 5 22 7ZM13 16A6 6 0 1 0 13 28A6 6 0 1 0 13 16ZM26 16A6 6 0 1 0 26 28A6 6 0 1 0 26 16ZM19 27A6 6 0 1 0 19 39A6 6 0 1 0 19 27ZM32 25A5 5 0 1 0 32 35A5 5 0 1 0 32 25ZM25 37A4 4 0 1 0 25 45A4 4 0 1 0 25 37Z'],
 ['md','Comunidad de Madrid','#bd1935','STAR7'],
 ['mc','Región de Murcia','#a92d40','M7 32L5 14L15 22L24 8L33 22L43 14L41 32ZM9 35H39V40H9ZM12 26L17 26L17 29H12ZM22 26H26V29H22ZM31 26H36V29H31Z'],
 ['nc','Navarra','#b62338','M7 7H41V41H7ZM11 11V37H37V11ZM12 13L16 10L38 32L35 36ZM10 34L33 11L37 14L14 37ZM21 9H27V39H21ZM9 21H39V27H9Z'],
 ['pv','País Vasco','#258052','M24 24C12 29 6 20 9 13C13 4 26 9 24 24ZM24 24C19 12 28 6 35 9C44 13 39 26 24 24ZM24 24C36 19 42 28 39 35C35 44 22 39 24 24ZM24 24C29 36 20 42 13 39C4 35 9 22 24 24Z'],
 ['ce','Ceuta','#53667b','M5 40H43V36H39V25H32V13H35V8H29V11H25V8H19V13H22V25H16V19H10V36H5ZM21 40V33Q24 29 27 33V40ZM25 17H29V22H25Z'],
 ['ml','Melilla','#426a9e','M4 39H44V35H40V22H35V16H30V22H27V14H30V9H25V4L35 8L25 12V14H21V22H18V16H13V22H8V35H4ZM20 39V32Q24 27 28 32V39ZM12 26H16V30H12ZM32 26H36V30H32Z']
] as const
type Region=typeof REGIONS[number]
function formatCount(n:number){return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.')}
function starPath(cx:number,cy:number,r:number){
 return Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5;const v=i%2?r*.43:r;return (i?'L':'M')+(cx+Math.cos(a)*v).toFixed(2)+' '+(cy+Math.sin(a)*v).toFixed(2)}).join('')+'Z'
}
export function RegionMark({region}:{region:Region}){
 return <span className="pro-region-mark" data-region={region[0]} style={{backgroundColor:region[2]}}><svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true" focusable="false">{region[0]==='md'?<>{[[9,17],[19,17],[29,17],[39,17],[14,30],[24,30],[34,30]].map(([x,y])=><path key={x+':'+y} d={starPath(x,y,5)}/>)}</>:<path fillRule="evenodd" d={region[3]}/>}</svg></span>
}
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
   <div className="pro-progress"><div><b>Banco explorado</b><strong>{coverage} %</strong></div><div className="pro-track" role="progressbar" aria-label="Banco general explorado" aria-valuenow={coverage} aria-valuemin={0} aria-valuemax={100}><i style={{width:coverage+'%'}}/></div><button onClick={p.onStats}>{formatCount(seen)} de {formatCount(p.bankCount)} preguntas vistas <span>›</span></button></div>
  </div>
  <div className="pro-main-grid">
   <article className="pro-route-card"><div className="pro-card-title"><ProIcon name="file"/><h2>Exámenes oficiales</h2></div><p>Convocatorias reales, con plantilla y trazabilidad.</p>
    <button className="pro-region-feature" aria-expanded={regions} aria-controls="pro-region-list" onClick={()=>setRegions(!regions)}><RegionMark region={REGIONS[0]}/><span><b>Castilla-La Mancha</b><small>Comunidad prioritaria</small></span><span aria-hidden="true">{regions?'⌃':'›'}</span></button>
    <button className="pro-archive-link" disabled={!p.hasArchive} onClick={p.onArchive}>Consultar archivo histórico <span>›</span></button><small className="pro-archive-note">{p.archiveCount} modelos con plantilla · procedencia regional en catalogación</small>
   </article>
   <button className="pro-route-card pro-bank" onClick={p.onBank}><div className="pro-card-title"><ProIcon name="bank"/><h2>Banco de preguntas</h2></div><strong>{formatCount(p.bankCount)}</strong><p>preguntas disponibles</p><span className="pro-bank-link">Entrar al banco <span>›</span></span></button>
  </div>
  {regions&&<section className="pro-regions" id="pro-region-list"><h2>Comunidades autónomas</h2><p>El archivo regional se incorporará conforme se verifiquen las fuentes.</p><div className="pro-region-grid">{REGIONS.map(r=><div className="pro-region-row" key={r[0]}><RegionMark region={r}/><span><b>{r[1]}</b><small>{r[0]==='clm'?'Prioritaria · en catalogación':'En preparación'}</small></span></div>)}</div></section>}
  <div className="pro-quick-grid">{actions.map(([icon,title,desc,action,color])=><button key={title} className={'pro-quick '+color} onClick={action} disabled={p.working||!p.hasArchive}><ProIcon name={icon}/><span><b>{title}</b><small>{desc}</small></span><span aria-hidden="true">›</span></button>)}</div>
  <p className="pro-independent">Preparación independiente · No es una aplicación oficial.</p>
 </section>
}
