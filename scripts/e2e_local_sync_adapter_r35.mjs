// R35 targeted real Chromium/IndexedDB integration, no Supabase data or backend.
// Test owners are deliberately fake UUIDs; never use a real account profile.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const outgoing = []
page.on('request', r => {
  if (/supabase\.co|\/rest\/v1\/|\/auth\/v1\//.test(r.url())) outgoing.push(r.url())
})
try {
  await page.goto('http://127.0.0.1:5173/')
  const result = await page.evaluate(async ({ A, B }) => {
    const scope = await import('/src/localScope.ts')
    const db = await import('/src/db.ts')
    const journal = await import('/src/localJournal.ts')
    const { createLocalSyncAdapter } = await import('/src/localSyncAdapter.ts')
    let consent = true
    const identity = userId => async () => ({
      verified: true, isAnonymous: false, consented: consent, userId
    })
    const assertReject = async (job, phrase) => {
      try { await job() } catch (error) {
        if (String(error).includes(phrase) || error?.code === phrase) return
        throw Error('Unexpected refusal: ' + error)
      }
      throw Error('Expected rejection: ' + phrase)
    }
    const session = (clientId, selected) => ({
      clientId, type: 'exam', label: 'R35', startedAt: 100, completedAt: 200,
      total: 1, answered: 1, correct: selected === 'A' ? 1 : 0,
      incorrect: selected === 'A' ? 0 : 1, score: selected === 'A' ? 100 : 0,
      answers: [{ questionId: 'r35-q', questionnaireId: 'historical',
        selected, correctAnswer: 'A', correct: selected === 'A' }]
    })
    scope.setLocalOwner(A)
    await db.clearAllData()
    await journal.recordStudyAnswer({ eventId: 'r35-local-1', questionId: 'r35-q',
      questionnaireId: 'historical', answer: 'A', correct: true })
    await db.addSession(session('r35-session-local', 'A'))
    const adapter = createLocalSyncAdapter({
      enabled: true, expectedUserId: A, getVerifiedIdentity: identity(A)
    })
    const before = await adapter.snapshot()
    if (before.events.length !== 1 || before.sessions.length !== 1)
      throw Error('Initial IDB snapshot incomplete')
    const remote = { events: [{
      eventId: 'r35-remote-1', questionId: 'r35-q',
      questionnaireId: 'historical', deviceId: 'r35-other-device',
      clock: 4, occurredAt: Date.now() + 1, kind: 'answer',
      answer: 'B', correct: false
    }], sessions: [session('r35-session-remote', 'B')] }
    await adapter.merge(remote)
    await adapter.merge(remote)
    const after = await adapter.snapshot()
    const progress = await db.getAllProgress()
    if (after.events.length !== 2 || after.sessions.length !== 2 ||
        progress.length !== 1 || progress[0].attempts !== 2 ||
        progress[0].correct !== 1 || progress[0].incorrect !== 1)
      throw Error('Merge lost data or repeated an event')
    const corrupt = structuredClone(remote)
    corrupt.events[0].correct = true // same ID, divergent payload
    await assertReject(() => adapter.merge(corrupt), 'EVENT_KEY_COLLISION')
    if ((await adapter.snapshot()).events.length !== 2)
      throw Error('Failed merge changed local events')

    consent = false
    await assertReject(() => adapter.snapshot(), 'consentimiento revocado')
    consent = true
    scope.setLocalOwner(B)
    await db.clearAllData()
    await assertReject(() => adapter.snapshot(), 'perfil cambió')
    if ((await db.getAllProgress()).length)
      throw Error('A data visible under B')
    await db.importProgress([{ questionId: 'r35-legacy', questionnaireId: 'historical',
      attempts: 3, correct: 2, incorrect: 1, streak: 1,
      lastAnsweredAt: 100, favorite: false }])
    const bAdapter = createLocalSyncAdapter({
      enabled: true, expectedUserId: B, getVerifiedIdentity: identity(B)
    })
    await assertReject(() => bAdapter.snapshot(), 'baseline manual')
    scope.setLocalOwner(A)
    const freshAdapter = createLocalSyncAdapter({
      enabled: true, expectedUserId: A, getVerifiedIdentity: identity(A)
    })
    const recovered = await freshAdapter.snapshot()
    if (recovered.events.length !== 2 || recovered.sessions.length !== 2)
      throw Error('A not preserved across user switch')
    // Avoid touching any real user's account. Clean the synthetic profiles only.
    await db.clearAllData()
    scope.setLocalOwner(B)
    await db.clearAllData()
    scope.setLocalOwner(null)
    return { initial: before.events.length, merged: after.events.length,
      sessions: after.sessions.length, attempts: progress[0].attempts,
      rejectedCollision: true, rejectedConsent: true,
      isolated: true, legacyBlocked: true }
  }, { A, B })
  assert.deepEqual(result, {
    initial: 1, merged: 2, sessions: 2, attempts: 2,
    rejectedCollision: true, rejectedConsent: true,
    isolated: true, legacyBlocked: true
  })
  assert.deepEqual(outgoing, [], 'Unexpected real Supabase request')
  console.log('R35 PASS: real IndexedDB merge, retry/idempotency, rollback, owner switch, consent, legacy block; zero cloud requests')
} finally {
  await context.close()
  await browser.close()
}
