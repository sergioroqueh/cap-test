# C28 — Cloud persistence design, pending release gate (17/11/2026)

**Current validated user behavior:** Real Google OAuth for `info@rutacap.es` plus reload, logout, guest progress separation and Google re-login in local Vite development. These four steps were confirmed by the user. This proves *local* namespace separation and authenticated session persistence only. There is still no cloud progress synchronization or online account A/B test.

## Why C15 is insufficient
The existing, never-deployed `C15_account_schema_draft.sql` has narrow counters in `rc_question_progress`, and summary columns in `rc_study_sessions`. The current app types require:
- `QuestionProgress`: questionId, questionnaireId, attempts, correct, incorrect, streak, lastAnsweredAt, lastAnswer, lastCorrect, favorite, updatedAt.
- `StudySessionRecord`: clientId, type, label, startedAt, completedAt, total, answered, correct, incorrect, score, netPoints, gradedTotal, blank, excluded, passed, capScoring, timed, durationMinutes, finishedReason, elapsedSeconds, full `answers[]` and fields not yet known.

Using C15 as-is would silently discard fields and make cloud recovery incomplete. **Do not activate cloudConfigured or wire synchronizeAccount()** to C15; the legacy function targets `question_progress` and `study_sessions`, which are not the C28 tables.

## Alternative C28 proposal (NOT DEPLOYED)
`C28_full_fidelity_schema_draft.sql` is a separate standalone *proposal*, not an incremental production migration; it uses `rc_student_profiles`, `rc_question_progress`, `rc_study_sessions` with `payload jsonb` containing all client fields, strict ownership in separately validated `user_id`, and `question_id` or `session_key` key consistency checks. Sessions are append-only; per-question progress allows updates. `updated_at` and session `completed_at` columns are available for future queries. Bounded JSON sizes and RLS default-deny apply.

**Important not yet solved:** A client must assign/persist a stable `clientId` before syncing sessions, and define conflict resolution for simultaneous offline edits (e.g., favorites, attempts, correctness, stale devices) without losing attempts or duplicating session history. No live A/B JWT/API and multi-device roundtrip, device-clock trust, malicious JSON validation or restoration verification have been run yet. `payload` is learning data reported by the client, never an entitlement, certificate or payment record.

## Read-only / disposable tests
`C28_full_fidelity_rls_test.sql` uses fixture-only UUID users A/B, tests preserve JSON fields and full answer arrays, restrict B reads/writes and owner assignment, deny `anon` and `is_anonymous` sessions, reject mismatched payload identity, prohibit client DELETE/immutable-session UPDATE, and check cascade deletes. CI uses an isolated PostgreSQL 17 Docker service. Never run `C15_auth_fixture.sql` on a real Supabase account.

## Release gates
1. Keep `cloudConfigured=false` and continue local storage; no production deploy/merge.
2. Address two `public.rls_auto_enable()` security advisor WARNs (separate explicitly approved revocation).
3. Review C28 SQL and ensure no conflation with baseline C15 schema; decide actual migration after approval.
4. Build and test a bidirectional, idempotent sync engine with stable keys and non-lossy merge rules; fail safely offline.
5. Test real Supabase JWT REST calls for isolated users A/B after a separately approved database migration and controlled second test user; run advisors.
6. Validate no unauthorized access, auth refresh/logout, guest never uploads without opt-in, offline recovery, and session provenance; only then consider beta release.

**Safeguards:** `rutacap-dev` one existing invited account, registration closed, no schema created, no user records altered, no cloud data writes, no expenses, no production deploy/merge. GitHub `feat/cap-commercial`, PR #21 DRAFT. R32 historical frequency discrepancy is unrelated and remains open.
