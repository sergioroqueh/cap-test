# C22 — RutaCAP local development login (17 November 2026)

Base: C21 15bb8c0dc6a4503a3135502c02ea8ca5138a5fcf. PR #21 remains DRAFT. No deploy, merge, payments, external costs, real SQL migration, private CLM content or scoring changes.

## Isolation and access
- Supabase authentication is enabled only under an explicit development opt-in on localhost/127.0.0.1 port 5173. Production builds, Pages and C5 preview retain Google disabled.
- Configure .env.local using .env.rutacap-dev.example. Only use the newly created isolated RutaCAP Supabase URL and a modern sb_publishable_ public key. The frontend never receives Google Client Secret or service_role.
- Uses supabase-js PKCE via signInWithOAuth(google), redirectTo fixed to http://localhost:5173/auth/callback, and auth.getUser verification before assigning the owner cache. Email sign-in uses OTP magic-link with shouldCreateUser:false, so only existing users can receive sign-in links.
- Guest requires no account or Supabase anonymous auth, and works even without a configured project. Guest entry persists in the browser tab session across reload; signing out explicitly resets the guest flag.
- Local IndexedDB, current test, last result and region preference use distinct keys for guest and for each verified UUID; C5 preview retains its previous namespace.
- On sign out the app leaves the owner scope and returns to the entry. Cached progress is not encrypted at rest in the shared browser profile; this is an isolated development preview, not a finished privacy posture.

## No cloud data sync
The legacy cloud data functions are deliberately disabled via cloudConfigured=false; no automatic upload of guest history, migration or access to historical question_progress/study_sessions tables. The C15 rc_ table SQL remains a reviewed draft only; no migration was run. Account UI explicitly says progress is browser-local, not synchronized between devices. Future sync must use owner RLS and consent to any guest import.

## Actual sign-in acceptance (pending new project connection)
1. Copy the example env values to .env.local locally (never publish values) and run npm install then npm run dev -- --host 127.0.0.1 --port 5173 --strictPort.
2. Ensure Supabase Redirect URLs includes http://localhost:5173/auth/callback (the currently configured http://localhost:5173/** should cover it; confirm in dashboard).
3. Google Cloud's authorized redirect remains the new Supabase project's /auth/v1/callback; Google Cloud test user is info@rutacap.es. Test real Google approval and code exchange in browser manually.
4. Verify Allow new users to sign up status. If disabled, first-time Google login cannot create a user. Do not open signups casually; decide a safe private test enrollment path.
5. Test session after reload, logout, OAuth error/retry, email magic link to existing user, offline mode and profile isolation for A/B/guest. Check that no rc_* or legacy tables are queried.
6. For any future cloud progress, first review C15 draft SQL/RLS, run two-user API isolation tests in the actual RutaCAP project and check advisors. Nothing was applied in C22.

## Testing
CI runs static gates and a real Chromium mobile+desktop local browser smoke using mock **public** config (no real OAuth provider contacted), saves screenshots of sign-in/guest and callback failure. Existing scoring, browser and editorial workflows still run. CI result must be inspected after the commit; the mock browser cannot certify real Google OAuth.
