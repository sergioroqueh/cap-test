import { useEffect, useId, useRef } from 'react'

interface Props {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({title,message,confirmLabel,cancelLabel,onConfirm,onCancel}: Props) {
  const titleId=useId()
  const messageId=useId()
  const cancelRef=useRef<HTMLButtonElement>(null)
  const cancelCallback=useRef(onCancel)
  cancelCallback.current=onCancel
  useEffect(()=>{
    const previouslyFocused=document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();cancelCallback.current()}
    }
    document.addEventListener('keydown',escape)
    return ()=>{document.removeEventListener('keydown',escape);previouslyFocused?.focus()}
  },[])
  return <div className="focus-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onCancel()}}>
    <section role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} className="focus-dialog">
      <div className="focus-dialog-symbol" aria-hidden="true">?</div>
      <h2 id={titleId}>{title}</h2>
      <p id={messageId}>{message}</p>
      <div className="focus-dialog-actions">
        <button ref={cancelRef} className="btn light" type="button" onClick={onCancel}>{cancelLabel}</button>
        <button className="btn primary focus-dialog-confirm" type="button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>
}
