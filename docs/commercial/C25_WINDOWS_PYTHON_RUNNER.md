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
