# CAP Test Pro — C3 visual audit · 2026-11-16

## C2 verified baseline
- HEAD 300989e4950c6c8a01533a689a3b2b1d40d73456; PR #21 draft.
- CI 43952291806, job 133597665705: SUCCESS, 23 mobile/desktop scenarios; engine, audits and both builds passed.
- Actual C2 screenshots artifact 14269130793 (9 PNGs); browser review of home, regional list, quiz and results on mobile and desktop.
- C2 preview artifact 14269030813, independently built, no live deployment.
- Observations: dark brand text barely visible, mobile profile gear too close to logo, PDF before question creates vertical friction, two mobile full-page quiz screenshots measured 420px/397px despite nominal 390px viewport. Previous overflow check against innerWidth can miss an inflated mobile layout viewport. C2 desktop hierarchy works, lacks road scene and brighter identity of approved mockup. Full-page screenshots can place sticky elements in middle of capture; add top-of-viewport snapshots.

## C3 modifications
- Local SVG road landscape, original road brand mark, blue road sign with yellow word highlight, stronger action colors. No external imagery or fonts. Regional badges C2 retained.
- Dashboard copy and responsive tablet/desktop grid adjusted; regional archive status remains honest.
- Restore brand contrast and profile position. Guard quiz intrinsic grid sizing, long labels, footer actions and mobile text wrapping. Primary next action emphasized and PDF below quiz controls. Unfinished session visible above dashboard.
- Test document width against nominal Playwright viewport width, not current window innerWidth; mobile 320/390 and desktop 1440, new viewport captures. Existing scoring and historical data unchanged.
- CI creates a local-only independent commercial artifact (cap-test-pro-commercial-preview) with build commit metadata, README and Windows Python launcher, after passing regression suite. No hosting or deploy workflow; no service worker and no Supabase in preview mode.
- C3 checks and actual C3 screenshot review are required before accepting the refinement. Do not claim C3 validated on the basis of C2 results.

## Boundaries
Main d979ecac504f2099b885a2d2a371c070ef4fb808 unchanged. PR #21 remains draft. No Google OAuth, payments, region source import, production deployment or changes to scoring/bank. Next: verify C3 CI and screenshot artifact; if needed correct any browser defects, then prepare optional isolated account onboarding.
