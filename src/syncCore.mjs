// C29: standalone, transport-agnostic draft. NOT imported by the UI or wired to Supabase.
// The source of truth for *new* progress is immutable events; C28 snapshots alone
// cannot safely sum concurrent offline answers.
export class SyncConflictError extends Error {
  constructor(code, message) { super(message); this.name = 'SyncConflictError'; this.code = code }
}
const fail = (code, message) => { throw new SyncConflictError(code, message) }
const obj = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200
const nonneg = value => Number.isSafeInteger(value) && value >= 0
// JSONB reorders object keys; semantic equality must survive a server roundtrip.
const canonical = value => Array.isArray(value) ? value.map(canonical) :
  obj(value) ? Object.fromEntries(Object.entries(value)
    .filter(([,v])=>v !== undefined).sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>[k,canonical(v)])) : value
const key = row => JSON.stringify(canonical(row))
const uuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const canonicalSession = row => {
  const { id: _localAutoIncrement, ...payload } = row
  return payload
}
function assertSession(row) {
  if (!obj(row) || !id(row.clientId) || !['study', 'exam'].includes(row.type) ||
      !nonneg(row.startedAt) || !nonneg(row.completedAt) ||
      !Array.isArray(row.answers) || !nonneg(row.answered) || !nonneg(row.correct))
    fail('SESSION_INVALID', 'Sesión inválida o sin clientId persistido')
  if (JSON.stringify(row).length > 524288)
    fail('SESSION_TOO_LARGE', 'Sesión demasiado grande para la propuesta C28')
}
function assertEvent(row) {
  if (!obj(row) || !id(row.eventId) || !id(row.questionId) ||
      !id(row.questionnaireId) || !id(row.deviceId) ||
      !Number.isSafeInteger(row.clock) || row.clock < 1 || !nonneg(row.occurredAt))
    fail('EVENT_INVALID', 'Evento sin identidad, orden lógico o fecha válidos')
  if (row.kind === 'answer') {
    if (!['A','B','C','D'].includes(row.answer) || typeof row.correct !== 'boolean')
      fail('EVENT_INVALID', 'Respuesta no válida')
  } else if (row.kind === 'favorite') {
    if (typeof row.favorite !== 'boolean') fail('EVENT_INVALID', 'Favorito no válido')
  } else if (row.kind === 'legacy-baseline') {
    const p = row.progress
    if (!obj(p) || p.questionId !== row.questionId || p.questionnaireId !== row.questionnaireId ||
        !nonneg(p.attempts) || !nonneg(p.correct) || !nonneg(p.incorrect) ||
        p.correct + p.incorrect !== p.attempts || !nonneg(p.streak) ||
        typeof p.favorite !== 'boolean')
      fail('BASELINE_INVALID', 'Instantánea histórica inválida')
  } else fail('EVENT_INVALID', 'Tipo de evento desconocido')
  if (JSON.stringify(row).length > 16384) fail('EVENT_TOO_LARGE', 'Evento demasiado grande')
}
function collect(rows, getId, check, code) {
  if (!Array.isArray(rows)) fail('INPUT_INVALID', 'Se esperaba una colección completa')
  const entries = new Map()
  for (const original of rows) {
    check(original)
    const row = structuredClone(original)
    const rowId = getId(row)
    const previous = entries.get(rowId)
    if (previous && key(previous) !== key(row))
      fail(code, 'Identificador reutilizado con contenido diferente: ' + rowId)
    entries.set(rowId, row)
  }
  return entries
}
const eventMap = events => collect(events, e=>e.eventId, assertEvent, 'EVENT_KEY_COLLISION')
const sessionMap = sessions => collect(sessions.map(canonicalSession), s=>s.clientId, assertSession, 'SESSION_KEY_COLLISION')
const sortedValues = map => [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v)
export function unionRecords(a, b) {
  const events=eventMap(a.events || []), sessions=sessionMap(a.sessions || [])
  for (const [k, v] of eventMap(b.events || [])) {
    const prior=events.get(k)
    if (prior && key(prior)!==key(v)) fail('EVENT_KEY_COLLISION', 'Evento divergente: '+k)
    events.set(k, v)
  }
  for (const [k, v] of sessionMap(b.sessions || [])) {
    const prior=sessions.get(k)
    if (prior && key(prior)!==key(v)) fail('SESSION_KEY_COLLISION', 'Sesión divergente: '+k)
    sessions.set(k, v)
  }
  return {events:sortedValues(events), sessions:sortedValues(sessions)}
}
const compareOrder = (a,b) => a.clock-b.clock ||
  a.deviceId.localeCompare(b.deviceId) || a.eventId.localeCompare(b.eventId)
export function replayProgress(events) {
  const rows = [...eventMap(events).values()]
  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.questionId)) groups.set(row.questionId, [])
    groups.get(row.questionId).push(row)
  }
  const result = []
  for (const [questionId, group] of groups) {
    group.sort(compareOrder)
    const baselines=group.filter(e=>e.kind==='legacy-baseline')
    if (baselines.length > 1)
      fail('AMBIGUOUS_LEGACY', 'Existen varios puntos de partida sin procedencia compartida: '+questionId)
    const baseline=baselines[0]
    // The baseline precedes recorded events, regardless of its device clock.
    let p=baseline ? structuredClone(baseline.progress) :
      {questionId,questionnaireId:group[0].questionnaireId,attempts:0,correct:0,
       incorrect:0,streak:0,lastAnsweredAt:0,favorite:false}
    if (baseline) p={...p,questionId}
    // An event captured independently of the baseline must not be replayed on top
    // of an unrelated imported snapshot. Only explicit baseline references qualify.
    for (const event of group) {
      if (event.kind==='legacy-baseline') continue
      if (baseline && event.baselineId !== baseline.eventId)
        fail('BASELINE_NOT_ACKNOWLEDGED', 'Evento sin referencia al origen histórico: '+event.eventId)
      if (!baseline && event.baselineId != null)
        fail('BASELINE_MISSING', 'No se encuentra el punto de partida: '+event.baselineId)
      if (event.questionnaireId!==p.questionnaireId)
        fail('QUESTIONNAIRE_COLLISION', 'La misma pregunta corresponde a cuestionarios distintos')
      if (event.kind==='answer') {
        p.attempts++; p.correct+=Number(event.correct); p.incorrect+=Number(!event.correct)
        p.streak=event.correct?p.streak+1:0
        p.lastAnswer=event.answer; p.lastCorrect=event.correct
        p.lastAnsweredAt=event.occurredAt
      } else if (event.kind==='favorite') p.favorite=event.favorite
      p.updatedAt=Math.max(p.updatedAt||0,event.occurredAt)
    }
    result.push(p)
  }
  return result.sort((a,b)=>a.questionId.localeCompare(b.questionId))
}
export function nextLogicalClock(observed, ownClock=0) {
  if (!nonneg(ownClock)) fail('CLOCK_INVALID', 'Reloj local inválido')
  const clocks=eventMap(observed).values()
  let maximum=ownClock
  for (const e of clocks) maximum=Math.max(maximum,e.clock)
  if (!Number.isSafeInteger(maximum+1)) fail('CLOCK_OVERFLOW', 'Reloj lógico agotado')
  return maximum+1
}
export function createAnswerEvent({eventId,deviceId,clock,questionId,questionnaireId,
  answer,correct,occurredAt,baselineId}) {
  const event={eventId,deviceId,clock,questionId,questionnaireId,kind:'answer',
    answer,correct,occurredAt,...(baselineId?{baselineId}:{})}
  assertEvent(event); return event
}
export function createFavoriteEvent({eventId,deviceId,clock,questionId,questionnaireId,
  favorite,occurredAt,baselineId}) {
  const event={eventId,deviceId,clock,questionId,questionnaireId,kind:'favorite',
    favorite,occurredAt,...(baselineId?{baselineId}:{})}
  assertEvent(event); return event
}
// Local adapter contract:
// ensureSessionIds(idFactory) atomically writes a stable clientId to EVERY legacy row.
// snapshot() returns ALL rows (not a truncated recent-sessions list).
// merge(records) atomically inserts missing rows and must reject ID/content mismatches;
// it may never clear the existing database.
// Remote adapter contract:
// pull(userId) returns a complete validated owner-scoped dataset;
// insertMissing(userId, records) does insert-only with conflict validation, never upsert.
// Authorization/owner must be enforced by the future backend, NOT a user_id in payload.
export async function syncOfflineFirst({identity,cloudEnabled=false,local,remote,idFactory}) {
  // The UI does not import or call this draft. Default-deny even with a transport present.
  if (!cloudEnabled) return {status:'disabled',events:0,sessions:0}
  if (!identity?.verified || identity.isAnonymous !== false ||
      !uuid(identity.userId) || identity.consented !== true)
    return {status:'denied',events:0,sessions:0}
  if (!local || !remote || typeof idFactory!=='function')
    fail('ADAPTER_INVALID', 'Faltan adaptadores o generador de identidad')
  await local.ensureSessionIds(idFactory) // MUST be durable before any network write.
  const before=await local.snapshot()
  const upstream=await remote.pull(identity.userId) // Network failure preserves local rows.
  const union=unionRecords(before,upstream) // Detect all conflicts before writing.
  replayProgress(union.events) // Reject ambiguous legacy counts before any upload.
  await local.merge(union) // Persist cloud data locally BEFORE attempting uploads.
  await remote.insertMissing(identity.userId,union)
  // A racing device may have uploaded while we wrote; read again and merge.
  const final=unionRecords(await local.snapshot(),await remote.pull(identity.userId))
  replayProgress(final.events)
  await local.merge(final)
  return {status:'ok',events:final.events.length,sessions:final.sessions.length}
}
