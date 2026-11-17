import type { Question } from './types'
import './answerProvenance.css'

// Evidence in a question can be an official printed key, an independent public
// document, a technical review, or a loose reference from the original bank.
// Never silently promote one of those evidence levels to another.
const asHttps = (value: string | undefined | null) => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch { return null }
}
const shortFile = (value: string) => value.replace(/^.*[\\/]/, '')
const shortUrl = (value: string) => {
  try { return new URL(value).hostname.replace(/^www\./, '') }
  catch { return 'Fuente externa' }
}

export default function AnswerProvenance({question:q}:{question:Question}) {
  const sheetName = q.originalSheetSourceFile?.trim() || ''
  const hasOriginalKey = !!q.originalSheetAnswer
  const sheetSha = q.originalSheetSha256?.trim() || ''
  const independentUrl = asHttps(q.answerEvidenceUrl)
  const technicalUrls = [...new Set((q.technicalDecision?.sources || []).map(asHttps).filter((url):url is string=>!!url))]
  const bankNorm = q.norm?.trim() || ''
  const bankReference = q.reference?.trim() || ''
  const scored = q.scoringEligible !== false
  const sheetVerified = hasOriginalKey && !!sheetName && !!sheetSha
  const mappedNumber = q.mappedSheetQuestionNumber
  const originalNumber = q.originalSheetQuestionNumber

  return <section className="answer-provenance" aria-label="Fuente de la respuesta">
    <div className="answer-provenance-head">
      <strong>{scored ? 'Fuente de la respuesta' : 'Trazabilidad · sin puntuación'}</strong>
      <span>{sheetVerified?'Documento cotejado':independentUrl?'Fuente pública documentada':'Verificación pendiente'}</span>
    </div>
    {hasOriginalKey && <p>
      <b>{sheetVerified
        ? q.answerTemplateOfficiallyVerified === true?'Plantilla correctora oficial cotejada':'Documento de respuestas cotejado'
        : 'Clave histórica registrada (plantilla sin cotejo documental acreditado)'}:</b>{' '}
      {sheetName ? shortFile(sheetName) : 'sin nombre de documento verificado'}.
      {' '}Letra impresa <b>{q.originalSheetAnswer}</b>
      {originalNumber ? ', casilla '+originalNumber : ''}
      {sheetSha && <> · SHA-256 <code title={sheetSha}>{sheetSha.slice(0,12)}…</code></>}.
      {q.answerTemplateOfficiallyVerified === false && <small>La oficialidad del documento no se ha confirmado.</small>}
      {mappedNumber && originalNumber && mappedNumber !== originalNumber && <small>La correspondencia editorial utiliza la casilla {mappedNumber}; no se altera la hoja original.</small>}
      {scored && q.originalSheetAnswer !== q.correctAnswer && <small>La letra aplicada al estudio difiere de la impresa; consultar la decisión editorial específica.</small>}
    </p>}
    {!hasOriginalKey && q.examId && <p><b>Plantilla de la convocatoria:</b> no hay una respuesta impresa verificada para esta posición. La clave de estudio no debe presentarse como oficial.</p>}
    {independentUrl && <p>
      <b>Fuente pública adicional:</b>{' '}
      <a href={independentUrl} target="_blank" rel="noopener noreferrer">{q.answerEvidenceSource?.trim() || shortUrl(independentUrl)} ↗</a>
      <small>Referencia independiente; no sustituye la plantilla ni constituye por sí sola una aprobación editorial completa.</small>
    </p>}
    {technicalUrls.length > 0 && <div className="answer-provenance-links">
      <b>Normativa y documentos usados en la revisión {q.technicalDecision?.round || 'técnica'}:</b>
      {technicalUrls.map((url,index)=><a href={url} target="_blank" rel="noopener noreferrer" key={url}>{index+1}. {shortUrl(url)} ↗</a>)}
      <small>Revisión técnica editorial, no rectificación del tribunal.</small>
    </div>}
    {(bankNorm || bankReference) && <p>
      <b>Referencia incluida en el banco general (pendiente de contraste individual):</b>
      {' '}{[bankNorm,bankReference].filter(Boolean).join(' · ')}
    </p>}
    {!hasOriginalKey && !independentUrl && technicalUrls.length===0 && !bankNorm && !bankReference &&
      <p><b>Fuente pendiente.</b> La solución está registrada en el banco, pero falta una referencia individual comprobable.</p>}
    {hasOriginalKey && technicalUrls.length===0 && !independentUrl && !bankNorm && !bankReference &&
      <small>La plantilla documenta la letra histórica; aún no consta una justificación normativa individual en esta ficha.</small>}
  </section>
}
