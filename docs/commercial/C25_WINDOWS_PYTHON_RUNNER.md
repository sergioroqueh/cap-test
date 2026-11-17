# C25 — Windows PowerShell development / portable Python data launcher (17/11/2026)

Issue: `npm install` succeeds, but `npm run dev` fails immediately in Windows PowerShell at the first `python3 scripts/build_data.py`: the Microsoft Store alias reports that Python is not installed.

**Scope:** C25 replaces `prepare:data` with `node scripts/prepare_data_cross_platform.mjs`, which executes the **same 17 Python generators in the same order**. It tries `py -3` first on Windows, then `python` and `python3`; on Linux it tries `python3` and `python`. It checks that the interpreter is Python 3 and fails immediately on script errors. It is called by the existing `npm run dev`, `npm run build` and `npm run build:preview`; no scoring, corpus, cloud data sync, schema, production or third-party dependencies are changed.

Install on Windows: `winget install -e --id Python.Python.3.13`, reopen PowerShell and verify `py -3 --version`. From a freshly downloaded C25 branch ZIP: `npm install`, copy `.env.rutacap-dev.example` to `.env.local`, set only the **public** Supabase publishable key locally, then `npm run dev -- --host localhost --port 5173 --strictPort`.

**For previously downloaded C24 ZIP:** this one-time local shim in `node_modules/.bin` avoids changing tracked code:
```powershell
"@echo off`r`npy -3 %*" | Set-Content -Encoding ASCII .\node_modules\.bin\python3.cmd
npm run dev -- --host localhost --port 5173 --strictPort
```
C25 makes the shim unnecessary in future downloads.

The six npm audit warnings (5 high and 1 critical) are a separate security review; do not execute `npm audit fix --force` without checking breaking changes. C25 adds zero dependencies and changes no dependency versions.

**Project safeguards:** work only in `feat/cap-commercial`, PR #21 DRAFT, main untouched. No deployment, spending, migrations, RLS changes, scoring changes or private CLM imports.

## C26 — Windows Python default encoding correction

The user successfully ran the existing C24 ZIP with Python 3.14.2 and the Windows shim. The first 10 preparation steps completed and generated 8,655 bank questions; however `scripts/build_technical_review_r27.py` failed reading a generated UTF-8 JSON file with the default `cp1252` encoding (`UnicodeDecodeError`, byte `0x9d`). The permanent C26 runner now uses `env: {...process.env, PYTHONUTF8:'1'}` for all 17 generated-data subprocesses. This alters neither generator content nor historical answers; the CI test checks every subprocess receives the flag.

**Existing previously downloaded ZIP — no re-download needed:**
```powershell
$env:PYTHONUTF8 = "1"
npm run dev -- --host localhost --port 5173 --strictPort
```
If a new terminal is opened, set the variable again before running the old ZIP. Use the newly committed C26 branch for future downloads; it automatically sets UTF-8.

The legacy frozen R32 frequency test continues to be a separate issue and must not be modified to mask the mismatch.
