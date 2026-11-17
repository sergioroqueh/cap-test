import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { exportDatabase } from './db'
import { inspectFullBackup, restoreFullBackup } from './backupRecovery'
import { localOwnerGeneration, onLocalOwnerChanged } from './localScope'
import './backupPanel.css'

type Summary = Awaited<ReturnType<typeof inspectFullBackup>>
type Pending = { data: unknown; generation: number; filename: string; details: Summary }
type Phase = 'idle' | 'reading' | 'ready' | 'restoring' | 'exporting'
type Notice = { kind: 'error' | 'success'; message: string }

const MAX_FILE_BYTES = 50_000_000
function explain(error: unknown): string {
  if (error instanceof SyntaxError) return 'El archivo no contiene un JSON válido.'
  if (error instanceof Error) return error.message || 'No se ha podido completar la operación.'
  return 'Ha ocurrido un error al procesar la copia.'
}
function sameProfile(generation: number): void {
  if (localOwnerGeneration() !== generation) {
    throw Error('Has cambiado de perfil. Selecciona de nuevo la copia desde la cuenta actual.')
  }
}

/** C33: responsive UI only. Backup selection never writes to IndexedDB.
 * All data remains local; the restore function rechecks owner and checksum.
 */
export default function BackupPanel({ refresh }: { refresh: () => Promise<void> }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const selectButton = useRef<HTMLButtonElement>(null)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const pending = useRef<Pending | null>(null)
  const shareFile = useRef<{file: File;generation: number} | null>(null)
  const mounted = useRef(true)
  const sequence = useRef(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<Pending | null>(null)
  const [canShare, setCanShare] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const busy = phase === 'reading' || phase === 'restoring' || phase === 'exporting'

  useEffect(() => {
    mounted.current = true
    const unsubscribe = onLocalOwnerChanged(() => {
      // Fail closed even when the component remains mounted during auth changes.
      sequence.current++
      pending.current = null
      shareFile.current = null
      setCanShare(false)
      setPreview(null)
      setNotice(null)
      setPhase('idle')
      if (fileInput.current) fileInput.current.value = ''
    })
    return () => {
      mounted.current = false
      sequence.current++
      pending.current = null
      shareFile.current = null
      unsubscribe()
    }
  }, [])
  useEffect(() => {
    if (!preview) return
    previewHeading.current?.focus({preventScroll: true})
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && phase === 'ready') {
        event.preventDefault()
        cancel()
      }
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [preview, phase])
  function update(phaseNext: Phase, message?: Notice | null) {
    if (!mounted.current) return
    setPhase(phaseNext)
    if (message !== undefined) setNotice(message)
  }
  function cancel() {
    if (busy) return
    sequence.current++
    pending.current = null
    setPreview(null)
    if (fileInput.current) fileInput.current.value = ''
    update('idle', null)
    selectButton.current?.focus({preventScroll:true})
  }
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || busy) return
    const ticket = ++sequence.current
    const generation = localOwnerGeneration()
    pending.current = null
    setPreview(null)
    update('reading', null)
    try {
      if (file.size > MAX_FILE_BYTES) throw Error('La copia supera el máximo de 50 MB.')
      if (file.size === 0) throw Error('El archivo está vacío.')
      const parsed: unknown = JSON.parse(await file.text())
      sameProfile(generation)
      const details = await inspectFullBackup(parsed)
      sameProfile(generation)
      if (!mounted.current || ticket !== sequence.current) return
      const item: Pending = { data: parsed, generation, filename: file.name, details }
      pending.current = item
      setPreview(item)
      update('ready')
    } catch (error) {
      if (!mounted.current || ticket !== sequence.current) return
      update('idle', {kind:'error',message:explain(error)})
    }
  }
  async function exportNow() {
    if (busy) return
    const generation = localOwnerGeneration()
    const ticket = ++sequence.current
    shareFile.current = null
    setCanShare(false)
    update('exporting', null)
    try {
      const backup = await exportDatabase()
      sameProfile(generation)
      if (!mounted.current || ticket !== sequence.current) return
      const json = JSON.stringify(backup, null, 2)
      const blob = new Blob([json], {type:'application/json'})
      const filename = 'rutacap-copia-local-' + new Date().toISOString().slice(0,10) + '.json'
      const file = new File([blob], filename, {type:'application/json'})
      shareFile.current = {file, generation}
      let shareSupported = false
      try {
        shareSupported = typeof navigator.canShare === 'function' &&
          typeof navigator.share === 'function' && navigator.canShare({files:[file]})
      } catch { /* Older Safari Web Share implementations may reject file probes. */ }
      setCanShare(shareSupported)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.hidden = true
      document.body.appendChild(anchor)
      try { anchor.click() } finally {
        anchor.remove()
        // A short delay is important for some mobile download implementations.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
      update(preview ? 'ready' : 'idle', {
        kind:'success',
        message:'Copia preparada. Comprueba la carpeta de descargas de tu dispositivo.'
      })
    } catch (error) {
      if (!mounted.current || ticket !== sequence.current) return
      update(preview ? 'ready' : 'idle', {kind:'error',message:explain(error)})
    }
  }
  async function shareNow() {
    const item = shareFile.current
    if (busy || !item) return
    try {
      sameProfile(item.generation)
      if (typeof navigator.share !== 'function' ||
          typeof navigator.canShare !== 'function' ||
          !navigator.canShare({files:[item.file]}))
        throw Error('Este dispositivo no admite compartir archivos desde el navegador.')
      // Safari requires navigator.share to be called directly from a user gesture.
      await navigator.share({files:[item.file], title:'Copia local RutaCAP'})
      if (mounted.current) setNotice({kind:'success',message:'Se ha abierto el menú para compartir la copia.'})
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (mounted.current) setNotice({kind:'error',message:explain(error)})
    }
  }
  async function restoreNow() {
    const item = pending.current
    if (busy || !item) return
    const ticket = ++sequence.current
    update('restoring', null)
    try {
      sameProfile(item.generation)
      const result = await restoreFullBackup(item.data)
      // The engine checks ownership and aborts the transaction on a switch.
      // Do not claim a committed restore was reverted if profile changed after commit.
      if (!mounted.current || ticket !== sequence.current) return
      pending.current = null
      setPreview(null)
      await refresh()
      if (!mounted.current || ticket !== sequence.current) return
      selectButton.current?.focus({preventScroll:true})
      update('idle', {
        kind:'success',
        message:'Copia restaurada: ' + result.questions + (result.questions === 1 ? ' pregunta, ' : ' preguntas, ') +
          result.sessions + (result.sessions === 1 ? ' sesión y ' : ' sesiones y ') +
          result.events + (result.events === 1 ? ' operación.' : ' operaciones.')
      })
    } catch (error) {
      if (!mounted.current || ticket !== sequence.current) return
      // Invalid or obsolete selections must be reselected; no silent retries.
      pending.current = null
      setPreview(null)
      update('idle', {kind:'error',message:explain(error)})
    }
  }

  return <section className="panel backup-panel" aria-labelledby="backup-title" aria-busy={busy}>
    <div className="backup-heading">
      <h2 id="backup-title">Copia de seguridad</h2>
      <span className="backup-local-label">Solo en este dispositivo</span>
    </div>
    <p id="backup-description">Guarda tus preguntas, sesiones finalizadas y respuestas completas. No incluye exámenes en curso ni preferencias. La nube sigue desactivada.</p>
    <div className="backup-actions">
      <button type="button" className="btn light" disabled={busy}
        onClick={() => void exportNow()}>
        {phase === 'exporting' ? 'Preparando copia…' : '↓ Exportar copia'}
      </button>
      <button ref={selectButton} type="button" className="btn light" disabled={busy}
        aria-describedby="backup-description" onClick={() => fileInput.current?.click()}>
        {phase === 'reading' ? 'Comprobando archivo…' : '↑ Seleccionar copia'}
      </button>
      <input ref={fileInput} className="backup-file-input" type="file"
        accept=".json,application/json" aria-label="Archivo de copia de seguridad RutaCAP"
        tabIndex={-1} onChange={event => void choose(event)} />
    </div>
    {phase === 'reading' && <p className="backup-phase" role="status">Comprobando el contenido del archivo…</p>}
    {phase === 'restoring' && <p className="backup-phase" role="status">Guardando los datos verificados en este navegador…</p>}
    {canShare && shareFile.current && <div className="backup-share">
      <p>¿No se ha descargado? En Safari puedes usar el menú Compartir y elegir «Guardar en Archivos».</p>
      <button type="button" className="btn light" disabled={busy} onClick={() => void shareNow()}>Compartir archivo</button>
    </div>}
    {preview && <div id="backup-preview" className="backup-preview" aria-labelledby="backup-preview-title">
      <h3 ref={previewHeading} tabIndex={-1} id="backup-preview-title">Antes de restaurar</h3>
      <p className="backup-file-name" title={preview.filename}>{preview.filename}</p>
      <div className="backup-counts" role="group" aria-label="Contenido verificado">
        <span><strong>{preview.details.questions.toLocaleString('es-ES')}</strong> {preview.details.questions === 1 ? 'pregunta' : 'preguntas'}</span>
        <span><strong>{preview.details.sessions.toLocaleString('es-ES')}</strong> {preview.details.sessions === 1 ? 'sesión' : 'sesiones'}</span>
        <span><strong>{preview.details.events.toLocaleString('es-ES')}</strong> {preview.details.events === 1 ? 'operación' : 'operaciones'}</span>
      </div>
      {preview.details.legacy && <p className="backup-warning">Copia antigua sin propietario: solo puede restaurarse en un perfil invitado vacío.</p>}
      <p>Los registros compatibles se añadirán sin borrar los existentes. Los conflictos se rechazan; no se suman contadores antiguos desconocidos.</p>
      <div className="backup-actions backup-confirm-actions">
        <button type="button" className="btn light" disabled={busy} onClick={cancel}>Cancelar</button>
        <button type="button" className="btn primary" disabled={busy}
          onClick={() => void restoreNow()}>
          {phase === 'restoring' ? 'Restaurando…' : 'Confirmar restauración'}
        </button>
      </div>
    </div>}
    {notice && <p className={'backup-notice '+notice.kind}
      role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
  </section>
}
