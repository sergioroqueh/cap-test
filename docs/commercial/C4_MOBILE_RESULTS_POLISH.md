# CAP Test Pro — C4 mobile density and results · 2026-11-16

## Validated C3 baseline
- HEAD 2d7002df4b5835fcf00a9b98499dd8fd1e3e3c23; PR #21 draft against main.
- CI 43953164783 / job 133600704466 SUCCESS, 10/10 engine tests, 24/24 browser scenarios, all four workflows green.
- Preview artifact 14268841974 (ZIP CRC verified; local launcher and data included); screenshot artifact 14268721995 (13 PNGs inspected/listed). GitHub PR build metadata uses a synthetic merge SHA 3fb0c70a4523ed14f96514576f63cf44b9ee0747, not branch HEAD; run artifact metadata binds to C3 HEAD.
- Actual viewport screenshots: home 390x844, quiz 390x844, narrow quiz 320x740, desktop 1440x900. Full-page mobile screenshots are all 390px wide. Previous horizontal overflow corrected.
- C3 visual audit: header logo now legible; two-column layout and regional emblems work. Amber local-preview notice consumes 51px and mobile quiz controls put the question at y=378 before answer choices. Result card is overwhelmingly red on failed exams, little visual hierarchy; time and answer precision not surfaced. User requests ongoing polish, prefers mobile mockup.

## C4 changes
- Compact persistent preview notice; no disabling of isolation notice or account protection.
- Smaller mobile header/quiz chrome, improved spacing and footer action hierarchy, no changes to timer, question marking, study/exam semantics or scoring.
- Road-sign result card for all outcomes, distinct status colour, real elapsed duration and precision among graded answered questions (blank/excluded not treated as incorrect); no fabricated scores or readiness estimates. Existing grading explanations and official provenance retained. Direct repaso action and next practice.
- C2 regional badges retained. Subtle card finishes, no external dependencies or images.
- Browser tests add mobile banner height, question placement, result metrics, result viewport fit, new captures. C4 must pass before use.

## Release constraints
C3 is the latest fully validated local preview at time of writing. C4 new preview only generated after CI passes. No public preview, production deploy, merge, domain purchase, Google OAuth or Supabase changes. No changes in original bank or scoring. Main remains d979ecac504f2099b885a2d2a371c070ef4fb808.
Next: verify C4 artifacts, polish based on real usage; then catalog verified Castilla-La Mancha sources and design separate account onboarding.
