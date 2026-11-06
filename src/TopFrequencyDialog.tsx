import { useEffect, useId, useRef } from 'react'

type Option = 'cap-top100' | 'cap-top3' | 'cap-top4'

interface Props {
  counts: {three:number;four:number} | null
  onSelect: (source:Option) => void
  onCancel: () => void
}

/** Frequency picker uses the existing CAP Focus modal style and accessible focus behavior. */
export default function TopFrequencyDialog({counts,onSelect,onCancel}:Props) {
  const titleId=useId()
  const descriptionId=useId()
  const firstRef=useRef<HTMLButtonElement>(null)
  const onCancelRef=useRef(onCancel)
  onCancelRef.current=onCancel
  useEffect(()=>{
    const previouslyFocused=document.activeElement as HTMLElement | null
    firstRef.current?.focus()
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onCancelRef.current()}
    }
    document.addEventListener('keydown',keydown)
    return ()=>{document.removeEventListener('keydown',keydown);previouslyFocused?.focus()}
  },[])
  return <div className="focus-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onCancel()}}>
    <section className="focus-dialog focus-top-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div className="focus-dialog-symbol" aria-hidden="true">★</div>
      <h2 id={titleId}>Top más repetidas</h2>
      <p id={descriptionId}>Elige cuántas preguntas frecuentes quieres practicar. No se incluyen duplicadas ni preguntas sin puntuación.</p>
      <div className="focus-top-dialog-options">
        <button type="button" ref={firstRef} onClick={()=>onSelect('cap-top100')}>
          <span><strong>Top 100</strong><small>Las 100 más frecuentes del archivo</small></span><span className="focus-top-dialog-count">100 preguntas</span>
        </button>
        <button type="button" onClick={()=>onSelect('cap-top3')}>
          <span><strong>Desde 3 repeticiones</strong><small>Todas las que aparecen 3 veces o más</small></span><span className="focus-top-dialog-count">{counts ? counts.three+' preguntas' : 'Calculando…'}</span>
        </button>
        <button type="button" onClick={()=>onSelect('cap-top4')}>
          <span><strong>Desde 4 repeticiones</strong><small>Todas las que aparecen 4 veces o más</small></span><span className="focus-top-dialog-count">{counts ? counts.four+' preguntas' : 'Calculando…'}</span>
        </button>
      </div>
      <p className="focus-top-dialog-note">Los tests de 3+ y 4+ se realizan sin reloj oficial: no son simulacros CAP de 100 preguntas.</p>
      <button type="button" className="btn light focus-top-dialog-cancel" onClick={onCancel}>Cancelar</button>
    </section>
  </div>
}
