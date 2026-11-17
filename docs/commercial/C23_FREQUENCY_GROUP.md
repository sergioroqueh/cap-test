# C23 — Deterministic frequency-group selection · 17/11/2026

Repo `sergioroqueh/cap-test`; commercial-only branch `feat/cap-commercial`; PR #21 DRAFT. Do not deploy, merge, change scoring or import private CLM source data.

## Observed regression
Previous R32 staged ledger expected 2/2/1 for 2024-04-06 Mercancías Q24, 2025-07-26 B Q23, 2025-07-26 A Q20. C22 build returned 3/3/3 and R32 frozen check correctly failed at row group/frequency identity. Nothing in scoring changed.

C23 diagnostic in GitHub Actions run 44174121343 and 44174713349 established that all three exam rows have the same normalized question stem but **different full option sets**. Bank matching is:
- April 2024 Q24: fallback `enunciado_y_texto_respuesta_exactos`, overlap with candidate code 63040 = 1 option and code 64829 = 1.
- July 2025 B Q23: fallback method, overlap 63040 = 3 options and 64829 = 2.
- July 2025 A Q20: four-option exact match to code 63040, overlap 63040 = 4 and code 64829 = 1.

The C22 source uses `original=matching[0]` then derives `frequencyGroup` from `original.code`. `matching` is populated by unsorted filesystem glob iteration, so ambiguity between bank codes causes non-reproducible frequency groups when fallback matching cannot decide a unique canonical bank question.

## C23 implementation and safety
`select_frequency_bank_match` chooses maximum number of shared normalized option texts; ties are resolved lexically by code then bank ID. This choice is used **exclusively** for `frequencyGroup` and does not replace `original`. Therefore no question text, answer, historical sheet letter, canonical question ID, progress ID, scoring formula, source PDF or R32 staged case file is deliberately modified by this change.

Three affected cases now deterministically share code 63040 (frequency three). Their prior frozen frequencies in `technical_review_r32.json` are **not silently overwritten**. R32's validation is deliberately left enabled and is expected to remain FAIL pending a separate accountable reconciliation of its frequency snapshots in the independent R32 review workflow. This is not an ordinary regression to suppress: the archived assumptions require explicit editorial decision about different options and repetition semantics.

C23 test permutes matching candidate order, checks actual generated question groups and unmodified frozen R32 ledger. Existing engine/scoring/Top 100/UX tests still run normally. CI success is not asserted until verified on GitHub.

## Still blocked
The new `rutacap-dev` Supabase account/project is absent from current connector accounts (only PROSOEL Costes and CuadernoTécnico visible). No real Google OAuth end-to-end test, sign-up verification, RLS migrations, tables or cloud progress writes have been performed. Connect this third Supabase account explicitly before continuing any live auth or database work.
