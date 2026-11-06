interface StudyPdfButtonProps {
  busy: boolean
  disabled?: boolean
  onClick: () => void
}

/** One clear, mobile-friendly export action shared by active and completed tests. */
export default function StudyPdfButton({busy,disabled=false,onClick}:StudyPdfButtonProps) {
  return <button type="button" className="focus-study-pdf-button" disabled={disabled||busy} onClick={onClick}>
    <span className="focus-study-pdf-symbol" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6M8.5 15l2.2 2.2 4.8-4.8"/>
      </svg>
    </span>
    <span className="focus-study-pdf-copy">
      <strong>{busy?'Generando PDF…':'Descargar PDF de estudio'}</strong>
      <small>Respuestas correctas marcadas · listo para imprimir</small>
    </span>
    <span className="focus-study-pdf-arrow" aria-hidden="true">↓</span>
  </button>
}
