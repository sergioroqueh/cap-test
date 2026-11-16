# CAP Test Pro — C5 account architecture (proposal, not deployed) · 2026-11-16

## Baseline and C4 audit
C4 HEAD 54b3a02eb0386fc114fc2bcc98761d1c3dc1e732, PR #21 draft.
CI 43954810950 / job 133606421941 SUCCESS, 10/10 engine, 24/24 mobile/desktop browser scenarios; 4/4 workflows. ZIP preview 14269323051, screenshot ZIP 14269058467 (14 PNGs). Both ZIP CRCs checked. Reviewed 390x844 and 320x740 phone, 1440x900 desktop, full-page regional catalog/quiz/results. No horizontal overflow evident. C4 compact header and blue results card retained; singular -1 punto / 1 punto corrected. Long question on 320px still requires scrolling; do not shrink wording excessively. Full-page sticky-header positioning may reflect capture scroll state.
C5: working local selection of all 19 territories, default Castilla-La Mancha for pilot, home and profile synchronized, versioned local key cap-test-pro-preview-region-v1, validated codes only, no claim of regional archive coverage. Guest profile with Google button explicitly disabled; no external account requests. New tests cover selection, reload, independent browser, mobile/desktop profile and no third-party network.

## Environments and release gate
- Private CAP Test on main remains untouched (existing production and project).
- C5 preview: local guest only; same isolated C3/C4 IndexedDB namespace preserves existing preview progress. Local region preference contains no identity. No Supabase client, OAuth, service worker or cloud writes.
- Commercial non-preview: fail closed in src/supabase.ts. Legacy VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY never read. Separate planned VITE_CAP_PRO_SUPABASE_URL / VITE_CAP_PRO_SUPABASE_PUBLISHABLE_KEY. The explicit release gate returns false even if values exist; no project created, no subscription, no domain registration, no publication. Do not flip this gate until security acceptance. Remove dead legacy password UI and data migration paths in the future commercial adapter; do not use them for commercial users.
- Future staging and production: separate Supabase projects (independent from private CAP Test and CuadernoTécnico), distinct Google OAuth clients, exact redirect allowlists, no production secrets in CI previews. No assumption about tier or price until separately approved. Public client gets only publishable key; Google secret stays server-side/provider configuration; no service-role key or Google tokens exposed to app/browser storage manually. No new dependencies in this round.

## Desired flow
1. Entry with Google or guest. No email/password required for initial commercial UX. Local guest stays anonymous (not Supabase anonymous auth).
2. Google button calls Supabase social login (provider google), authorization code + PKCE using supabase-js; explicit base-path callback, no arbitrary redirect argument, exact allowed app origin/path per environment; SDK handles code exchange in same browser, remove callback query via replaceState after success. Sign-in cancellation/error returns to entry with retry; no token or code logs. Request minimum identity scopes only; never Gmail/Drive or contacts. No third-party OAuth server feature required.
3. Validate identity via getUser before opening cloud data; account state machine loading / guest / signing-in / onboarding / signed-in / error. Handle sign-out and auth change; abort stale work and clear or close account-scoped caches. Prevent concurrent sign-in in same browser. Browser session storage policy/CSP reviewed before real OAuth.
4. On first login, select exam region explicitly (CLM highlighted, all 19 options, can change, skip if not known). Store user preference on owner-only profile; changing it must not delete progress or reclassify historical exams. Keep region preference and verified exam region distinct.
5. Guest import is explicit opt-in, preview totals before importing, idempotent per guest snapshot, no automatic merge, no overwrite of unknown ownership. Sign-out never exposes previous user's progress; namespace IndexedDB and localStorage by environment + verified user ID (and distinct guest namespace). Separate pending mutations per owner; cancel/revalidate before retry. Current legacy synchronizeAccount auto-upload is not suitable for commercial mode.
6. Account screen: change region, export progress, sign out, request account deletion (future authenticated server operation with reauthentication, revoke sessions/clear local caches). Privacy notice and terms must exist before real user collection. No payment implementation now.

## Proposed data model (not SQL migrations; nothing executed)
- auth.users: provider-managed identity; verified user UUID only, no extra identity info required.
- student_profiles: user_id UUID PK/FK auth.users ON DELETE CASCADE, preferred_region nullable enum/validated code (clm, an, ar, as, ib, cn, cb, cl, ct, vc, ex, ga, ri, md, mc, nc, pv, ce, ml), onboarding_completed_at, created_at, updated_at. Region is preference not authorization.
- question_progress: (user_id, stable question_id) PK; attempts, correct, incorrect, streak, favorite, last_answered_at; constraints and version. Stable IDs from bank; do not re-key history on region change.
- study_sessions: (user_id, session_id UUID) PK, exam/source reference, scoring/bank version, start/end, results and answer snapshot, idempotent append/upsert. Scope guest and real user separately. No client-side score entitlement.
- guest_imports: user_id, snapshot_digest unique per user, import status and counts. Transactional server processing; duplicate retries do not duplicate sessions. Never trust supplied user_id.
- exam_catalog: stable exam_id, region_code nullable (unknown allowed), modality, date, model, source URL, verified source/answer version, editorial status. Public metadata only if rights verified. Independent editorial write channel; never infer region from preferred region.
- future entitlements (not implemented): backend-only writes and verified payment events; read access for owner. UI flags or user_metadata never authorize paid content. Static bundles include answers today, thus not a secure paid-content boundary; commercial distribution requires server-controlled entitlement/content delivery and licensing assessment.

## Proposed RLS policy shape
All exposed tables RLS enabled; revoke default grants, explicit grant only necessary operations to authenticated roles. Owner tables policy USING ((select auth.uid()) = user_id) and for INSERT/UPDATE WITH CHECK ((select auth.uid()) = user_id). SELECT + UPDATE pair, forbid ownership changes; validate types/constraints; restrict columns/server-only operations as necessary. Anonymous guests have no database CRUD. No SECURITY DEFINER bypass, no authorization from editable user_metadata. Entitlements/editorial writes server-only. This is a design, not a verified database schema. Before any release run local migrations and advisors; tests with anonymous + users A/B must deny reads/writes/owner swaps, replay imports and verify account removal/revocation, cross-device sync and cache privacy, no unauthenticated content entitlement. No real project touched.

## Official references checked
https://supabase.com/docs/guides/auth/social-sign-in/auth-google
https://supabase.com/docs/reference/javascript/auth-signinwithoauth
https://supabase.com/docs/guides/auth/sessions/pkce-flow
https://supabase.com/docs/guides/auth/redirect-urls
https://supabase.com/docs/guides/database/postgres/row-level-security
Supabase changelog markdown could not be retrieved by web tool (unsupported markdown content type); check official changelog again before enabling live integration.
## Next gate
C5 CI pending. Verify preview account/regional screenshots and regressions. Then prioritize CLM official source inventory and actual verified catalog, and prepare isolated local integration/SQL tests for OAuth/data model. No activate real connection without user approval. Do not modify main or deploy.
