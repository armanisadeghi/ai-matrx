# TypeScript Error Analyzer

Admin tool at `/administration/typescript-errors` for running the type check and tracking results in the UI.

## How it works (DB-backed, 2026-07)

The check runs against the codebase on the machine hosting this app, writes results to
Supabase, and the UI displays the database as the single source of truth.

- **Table:** `public.ts_check_runs` (RLS: super admins only) — one row per run, with summary
  columns + the full `errors` JSONB payload. Migration: `migrations/ts_check_runs.sql`.
- **API:** `app/api/admin/typescript-errors/regenerate/route.ts`
  - `GET` → returns the server's default codebase path (`process.cwd()`) + whether it's a valid
    TS codebase, for the UI to prefill.
  - `POST { codebasePath }` → validates the path, runs `tsc` against `tsconfig.typecheck.json`
    (falls back to `tsconfig.json`), strips config/library noise, and persists the run.
    Node runtime, `maxDuration = 300`.
- **UI:** `components/admin/ts-error-analyzer/TypeScriptErrorViewer.tsx`
  - Reads the latest run (+ a short history) directly from Supabase.
  - Persisted, editable codebase-path input (localStorage, prefilled from `GET`).
  - "Run type check" → `POST`, then reloads from the DB. "Reload from DB" re-reads.

### Runtime constraint

The check runs **where the code physically lives** (local dev, or a self-hosted server with the
repo checked out). A serverless deployment (Vercel) has no source tree and a read-only FS, so
`POST` there returns a clear error — but the UI still shows the latest run from the DB, so a run
generated locally is visible everywhere.

### Notes

- `public/type_errors.json` and root `capture_ts_errors.ts` are the legacy static-file path and are
  no longer read by the UI (kept for the standalone `pnpm capture-errors` script).

## Future Enhancements
- [ ] Error trend analysis over time (data is already captured per run)
- [ ] Link errors directly to files in the editor
- [ ] Filter by error severity / category
- [ ] Export functionality for error reports
