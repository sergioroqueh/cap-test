# C18 — Visual QA expansion and CLM editorial gates · 2026-11-17

## Safe scope
Base C17 `c32255deb8966d12f607dfa9b235e9e1eea2ee78`; PR #21 DRAFT against unchanged `main` `d979ecac504f2099b885a2d2a371c070ef4fb808`.
This round changes automated screenshots only. It does not change historical question files, answer keys, scoring, IDs, UI behavior, release gates, DNS, Supabase or deployments.

## C17 CI evidence inspected before this change
The C17 HEAD has 6 completed/success workflows: 43980004346, 43980004354, 43980004314, 43980004478, 43980004381 and primary Validate CAP Test 43980004342.
Downloaded **actual** C17 artifact 14282053226 (`cap-focus-mobile-desktop-screenshots`, 20 PNG, ZIP CRC valid), not merely the workflow summary.
Reviewed the dark 390×844 and 1440×900 C17 archive captures: Close is a single line, 2026/2025 chronological groups and Mercancías/Viajeros selector render, and the explicit archive territorial caveat remains readable. Also viewed mobile/desktop regional chooser, light home/profile, 320 quiz and major mobile/desktop states. These represent screenshot-level observations, not a universal visual PASS across all widths, browsers and interactions.

## C18 browser evidence enlargement
In `scripts/e2e_cap_focus.mjs`, add deterministic screenshot capture of:
- `c18-mobile-320-regions.png` (320×740 territory selector);
- `c18-mobile-320-convocations.png` (320×740 open archive);
- `c18-light-desktop-convocations.png` (1440×900 light theme archive).
Existing checks for 320px document fit, archive close nowrap, 390px region/account/quiz/results and desktop overflow remain in force. Capture outputs must be **downloaded and visually inspected** after the C18 CI passes. A green workflow alone cannot close C18 visual acceptance.

## Corpus CLM: gate preserved (NOT a release approval)
Private C13 stage was inspected in an indexed personal file reference (text only; original raw bytes not materialized, so **fresh SHA-256 validation not claimed**). Its global flags remain `stageOnly=true`, `releaseAllowed=false`, `scoringAllowed=false`. Six `editorialHoldC13` records were located, all with scoring/release flags false:
- May 2026 Mercancías 29 and 85;
- September 2026 Mercancías 22 and 48;
- September 2026 Viajeros 32 and 42.
May 2026 Mercancías 32 retains `identityStatus=legacy_changed_keep_old_progress_separate`, `progressMigrationAllowed=false`; do not repurpose existing progress/ID.
No original CLM questionnaire or official template PDF was re-compared page-by-page in this round. No claim of independent text/image fidelity or verified content rights. All CLM private records stay outside public checkout/CI and remain excluded from scoring and release.

## R32 status checked separately
PR #20 remains DRAFT at `2e0b9d891c5355e99e69daafddf3ff6783d6bceb`; 4/4 workflows complete/success.
R32 CI logs explicitly report 128 occurrences / 92 groups; staged classifications: 80 confirmed, 36 notes, 11 pending and 1 proposed exclusion; applied 0. Do not confuse review classifications with exam official keys or applied grading changes.

## Public-source reuse concern
The CLM transport portal provides links to CAP questionnaires and correction sheets; public availability does **not** in itself certify commercial republication rights. The CC BY wording on the separate Castilla-La Mancha open-data portal should not be assumed to cover arbitrary PDFs on the transport portal. State Law 37/2007 admits commercial reuse with conditions/exclusions, including third-party IP. Request document-specific conditions/permission before any public beta catalog. Do not collect candidate lists from linked result documents.

## Next gate
1. Verify C18 six workflows and download/inspect the newly generated 320px/light screenshots, recording screen-specific PASS/FAIL.
2. Recover the authorized private C13 raw stage and original PDFs for hash and source-vs-row comparison; continue six holds, final template/rectification cross-check and 62 legacy restoration candidates without changing IDs/scoring.
3. Verify reuse conditions and permissions for each CLM document before any beta or public text distribution.
4. No merge, pages deploy, new cloud service, subscription or expenses.
