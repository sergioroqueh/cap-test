# C24 — Supabase dev connection / read-only security preflight — 2026-11-17

**Scope:** `sergioroqueh/cap-test`, `feat/cap-commercial`, PR #21 DRAFT. No merge/deploy, no SQL migrations or data writes, no CLM private catalog changes, no scoring changes or expenses.

## Verified via separate ChatGPT Supabase connection
The Supabase link named **RutaCAP** returns exactly one project, `rutacap-dev` (reference `rhtbqetskghkarxhrgee`, `eu-west-1`, `ACTIVE_HEALTHY`). Its public API origin is `https://rhtbqetskghkarxhrgee.supabase.co`.

Read-only project/tool results on November 17:
- 0 `auth.users` and 0 `auth.identities`; **no real Google login has yet succeeded**.
- 0 public tables; 0 public policies; 0 applied migrations.
- One active modern `sb_publishable_` API key is present, but **no API key value is stored in the repo or this document**.
- Health advisors: none.
- Security advisors: two WARN findings for **the same privileged function**, not two separate functions: `public.rls_auto_enable()`, callable by `anon` and `authenticated`. It is owned by `postgres`, defined as `SECURITY DEFINER`, attached to an enabled `ensure_rls` `ddl_command_end` event trigger. `proacl IS NULL`, default public EXECUTE grants apply.

**Proposed scoped hardening, NOT EXECUTED** (requires explicit authorization):
```sql
revoke execute on function public.rls_auto_enable()
  from PUBLIC, anon, authenticated;
```

After explicit approval, apply only in `rutacap-dev`, confirm both `has_function_privilege` results are false, `get_advisors(type='security')` clears, and `ensure_rls` remains enabled. The statement does not drop/disable the event trigger. Security references:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## C24 defense in depth: PIN dev OAuth to the new project
`src/supabase.ts` now accepts only the exact `https://rhtbqetskghkarxhrgee.supabase.co` project origin, only in local Vite development on port 5173, and only with explicit `VITE_RUTACAP_AUTH_DEV=true` and a `sb_publishable_` key. This prevents mistakenly configuring PROSOEL or CuadernoTécnico as the login provider. `.env.rutacap-dev.example` includes that **public** URL and only a placeholder for the publishable key.

CI uses a *fake publishable key* with the exact project URL. The browser E2E harness intercepts and aborts any request to the real endpoint, failing if a request is observed. Its mocks never exercise real Google OAuth. Cloud data sync remains permanently off: `cloudConfigured=false`.

## What the connector cannot verify
Supabase database/project MCP methods cannot inspect hosted Auth provider settings, `Allow new users to sign up`, `Site URL` or Redirect URLs. Zero users does **not** prove signups are disabled. Public web fetch to `/auth/v1/settings` was not accessible. Therefore those settings **remain unverified**; do not assert that Google real login works.

To check the dashboard safely:
1. Authentication → Providers: Google enabled; email provider according to private pilot policy.
2. Authentication → URL Configuration: Site URL `http://localhost:5173`; Redirect URLs include `http://localhost:5173/auth/callback`.
3. Google Cloud OAuth client: authorized redirect `https://rhtbqetskghkarxhrgee.supabase.co/auth/v1/callback`; consent-screen test email `info@rutacap.es` explicitly allowed. Google secret stays solely in Supabase/Google dashboard.
4. Check whether new-user signup is permitted. The first Google test user is not registered yet; if public signup is disabled, arrange controlled test-user enrollment before OAuth. Do not enable public registrations without explicit approval.
5. Local user-only Google test: copy example env to `.env.local`, supply public publishable key privately, run `npm install` and `npm run dev -- --host localhost --port 5173 --strictPort`. Verify Google PKCE callback, token verification via `auth.getUser()`, reload, logout, second account A/B isolation and guest. Do not send tokens or callback URLs in chat.

## Database release gate
`docs/commercial/sql/C15_account_schema_draft.sql` is an unexecuted draft with explicit grants and owner RLS. Its A/B test runs in disposable PostgreSQL in CI; it is not yet an actual Supabase JWT/API test. No `rc_*` tables or cloud sync have been enabled. A future live test requires explicit authorization for a schema migration and controlled test-user creation, after OAuth signups and the two WARN advisors are resolved.
