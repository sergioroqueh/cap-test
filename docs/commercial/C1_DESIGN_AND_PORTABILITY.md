# CAP Test Pro — C1 · 2026-11-16

Design approved: mobile-first, road and traffic-sign identity. This branch is a private-development candidate, not a release.
Baseline R32: 2e0b9d891c5355e99e69daafddf3ff6783d6bceb (R32 evidence staged; R31 is the active scored overlay).

## Implemented
- Original SVG brand and nineteen regional pictograms (17 communities, Ceuta and Melilla), not official coats of arms.
- Commercial start/dashboard with historical and general bank access, real general-bank coverage, error/favorite/frequency shortcuts and real-exam configuration. Regional labels are catalog states, not claims of exam availability; the existing manifest does not yet contain a verified per-region provenance.
- Asphalt dark theme; light theme retained. Road-sign blues, yellow for warnings/frequency, red for errors, green for verified results or progress. Mobile-first two-column cards and desktop layout, local SVGs, no image CDN or fonts.
- Existing exam engine, duration, grading, PDF export, answer provenance and archived reviews preserved. C1 does not change any questions or scoring.
- New manifest and brand icon; explicit independent preparation wording.

## Portability
`npm run build:preview` generates an isolated local-data preview (no Supabase, no service worker).
`npm run build` retains `/cap-test/` default; `CAP_PUBLIC_BASE=/ npm run build` produces a root-domain build. The service worker derives its URL from registered scope and only cleans caches within its own prefix.
Do not put the commercial branch on production GitHub Pages. Do not point a commercial build at the current private Supabase project. A separate project, RLS review, OAuth redirect allowlist, Google consent configuration and data-portability/migration plan are needed before account beta. No payment, Google sign-in or account changes in C1. Current private email/password flow retained for compatibility; Google and guest flow must be completed against isolated infrastructure.
No purchase or deployment authorized.

## Validation
Existing CI and browser regression suite plus new mobile region picker, bank navigation and overflow check. Review CI and screenshots before approving C1.

## C2 — Regional badges refinement
C1 CI run 43951506628 passed app and preview compilation, exam engine, historical scoring/data audits and R32 staging; browser suite stopped on the new assertion '8655' vs '8.655' (Spanish Intl convention does not always group four-digit numbers). C2 fixes the presentation with deterministic grouping, without changing bank counts or scoring.
All 19 placeholder outline icons are replaced with original solid 48-unit SVG regional emblems, enamel-like colored tiles, local vector resources, and responsive sizing. Castilla-La Mancha uses a crenellated castle with negative-space arch and windows; Madrid uses seven stars; all shapes are illustrative rather than official institutional heraldry. Regional source availability remains unverified, not implied by the badge.
Added mobile/desktop catalog screenshots and checks for 19 unique shapes, IDs, legibility and overflow. C2 validation is required before considering the preview ready. No live deployment / production changes.
