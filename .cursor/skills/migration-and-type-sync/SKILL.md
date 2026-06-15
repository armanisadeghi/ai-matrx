---
name: migration-and-type-sync
description: Verify pending/drifted SQL migrations are applied to Supabase, apply + record any that aren't, then regenerate types with sync-types and fix the resulting TypeScript errors. Use when asked to confirm migrations are applied, resolve migration drift, run pnpm sync-types / pnpm db-types, fix types after a schema change, or any time a migrations/*.sql file is added or edited. Pairs with the type-fixing-agent and supabase-type-safety skills.
---

# migration-and-type-sync

The full loop after a schema change: **verify → apply → record → sync-types → fix-types → (commit when asked).** The DB (`txzxabzwovsujtloxrus`, Matrx Main) is the source of truth — a `migrations/*.sql` file changes **nothing** until applied AND verified live AND types regenerated. Read the "Database migrations" section of `CLAUDE.md` for the doctrine; this skill is the procedure.

## Apply path (the one fact agents get wrong)

The app has **no DDL path** (Supabase JS / PostgREST only). Agents apply DDL through the **Supabase MCP** — `apply_migration` and `execute_sql` — always available, always pass `project_id: "txzxabzwovsujtloxrus"`. There is no local `psql`. aidream's `python db/apply_migrations.py` is a batch applier for *that* repo; from here, MCP one-off + ledger write is the path.

## Workflow

```
- [ ] 1. Verify: pnpm check:migrations
- [ ] 2. Cross-check each flagged file against the LIVE DB (execute_sql)
- [ ] 3. Apply anything truly missing (apply_migration) — must be idempotent
- [ ] 4. Record/refresh the ledger row so check:migrations is clean
- [ ] 5. pnpm sync-types (db types + Python API types + type-check)
- [ ] 6. Fix type errors (type-fixing-agent rules); re-run sync-types until green
- [ ] 7. Commit & push — ONLY if the user asked
```

### 1. Verify

```bash
pnpm check:migrations
```

It diffs `migrations/*.sql` against the shared ledger `public._schema_migrations` (rows where `source='matrx-frontend'`) and reports:
- **`[UNAPPLIED]`** — on disk, never recorded. The real emergency.
- **`[DRIFTED]`** — recorded, but the file's SHA-256 changed since (usually a later refactor of an already-applied file).
- Silence = clean. Stray-dir warnings are housekeeping, ignore unless asked.

### 2. Cross-check against the live DB — never trust the ledger alone

The ledger says what was *recorded*, not what *exists*. For each flagged file, read it, then confirm the actual object via `execute_sql`:

```sql
-- column added?
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='<t>' AND column_name='<c>';
-- function / trigger present?
SELECT proname FROM pg_proc WHERE proname='<fn>';
SELECT tgname FROM pg_trigger WHERE tgname='<trigger>';
-- function body already contains the change? (for CREATE OR REPLACE drift)
SELECT prosrc LIKE '%<sentinel>%' AS ok FROM pg_proc WHERE proname='<fn>';
```

Three outcomes:
- **Object exists, drift only** → skip apply, just refresh the ledger checksum (step 4). This is the common drifted-file case.
- **Object missing** → apply it (step 3).
- **Ambiguous / not idempotent / destructive** → STOP and ask the user.

### 3. Apply (only what's missing)

Migrations MUST be idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`, `CREATE TRIGGER` after a `DROP TRIGGER IF EXISTS`). Re-applying a verified-live file is then a safe no-op.

Use the MCP `apply_migration` (DDL) with the **exact file contents** and a snake_case `name` matching the filename without `.sql`:

```
server: user-supabase
tool:   apply_migration
args:   { project_id: "txzxabzwovsujtloxrus", name: "<filename_without_ext>", query: "<full file SQL>" }
```

- Not idempotent? Don't "fix" it silently — STOP and ask.
- `-- migrate: skip: <reason>` in the first 25 lines means never apply; leave it.
- Sensitive tables (`admins`, RLS/`SECURITY DEFINER`, protected resources) → invoke the `protected-resources` skill first.

### 4. Record the ledger row — the step that makes `check:migrations` go green

`apply_migration` does **not** write `_schema_migrations`. Until the row matches, the file stays flagged. Compute the checksum from the **exact file bytes** and upsert:

```bash
node -e "const fs=require('fs'),c=require('crypto');console.log(c.createHash('sha256').update(fs.readFileSync('migrations/<file>.sql','utf8'),'utf8').digest('hex'))"
```

```sql
-- drifted (row exists): refresh checksum
UPDATE public._schema_migrations
SET checksum = '<sha256>', applied_at = now()
WHERE source = 'matrx-frontend' AND filename = '<file>.sql';

-- unapplied (no row yet): insert
INSERT INTO public._schema_migrations (source, filename, checksum, applied_at)
VALUES ('matrx-frontend', '<file>.sql', '<sha256>', now())
ON CONFLICT (source, filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now();
```

The checksum MUST be the SHA-256 of the current file content — that is exactly what `check:migrations` recomputes and compares. Re-run `pnpm check:migrations`; it must come back clean before moving on.

### 5. Sync types

```bash
pnpm sync-types
```

Three steps, in order: (1) `pnpm db-types` regenerates `types/database.types.ts` from Supabase; (2) fetches Python API types into `types/python-generated/`; (3) type-checks via `tsc -p tsconfig.typecheck.json`. Exit 0 = aligned. Exit 1 = type errors to fix.

> `pnpm sync-types` is the canonical command. Use `pnpm db-types` alone only when you don't need the Python API surface.

### 6. Fix type errors

The regenerated DB types are **canonical**. When local code disagrees, the local code is wrong. **Follow the `type-fixing-agent` skill** (root-cause fixes, DB types win, NO `as any` / `as unknown` / `@ts-ignore` / `@ts-expect-error`); for Supabase casting use the `supabase-type-safety` skill. Re-run `pnpm sync-types` after each round until it prints "Type-check passed". Common cases:

- **Dropped column** → remove it from local row/record interfaces and any mapping that reads it (map a sensible default if a downstream record type still carries the field).
- **New column** → add it to local interfaces that mirror the table; thread it through mappers.
- **Drifted local interface duplicating a table** → replace with `Database["public"]["Tables"]["<t>"]["Row"]` (intersect with `& { ... }` only for genuine non-column join fields).
- Genuinely ambiguous, or the fix needs logic/architectural changes → STOP and ask, per the instructions below.

### 7. Commit & push — only when the user asks

Do **not** commit or push unless explicitly requested (global rule). When asked: stage the specific migration + type + code files, write a conventional commit (`feat(...)` / `fix(...)`) via a HEREDOC, and push to `main`. Never `git add -A` blindly — review `git status` / `git diff` first.

## Stop-and-ask triggers

Halt and ask the user before proceeding when:
- A migration is **not idempotent**, or applying it would drop/rename/alter data destructively.
- The live-DB cross-check **contradicts** the file (object exists but differs from what the file would create).
- A type error's correct fix is **ambiguous** or requires changing code logic / architecture, not just types.
- The migration touches **protected/sensitive resources** (`admins`, RLS, `SECURITY DEFINER`) — invoke `protected-resources` first.
- A type fix would tempt a forbidden escape hatch (`as any`, `@ts-ignore`, etc.) — leave it and report instead.

## Reference

| Thing | Where |
|---|---|
| Doctrine + ledger overview | `CLAUDE.md` → "Database migrations" |
| Verify script (UNAPPLIED/DRIFTED logic) | `scripts/check-migrations.ts` |
| sync-types steps | `scripts/sync-types.mjs` |
| Canonical DB types | `types/database.types.ts` |
| Type-fix rules | `type-fixing-agent` skill |
| Supabase casting patterns | `supabase-type-safety` skill |
| Supabase MCP tools | `apply_migration`, `execute_sql` (always `project_id: "txzxabzwovsujtloxrus"`) |
