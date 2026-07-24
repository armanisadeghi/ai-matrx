# Shared Knowledge access matrix + drift guards

**Status:** live (P4, 2026-07-23). **Owner surface:** `pnpm check:access-matrix` · `pnpm check:access-drift` (both loud, non-blocking; `:strict` variants exit 1). Run them after ANY change to the access kernel, an RLS policy, a library trigger, or a deploy that touches Shared Knowledge.

## What these are

- **`check-access-matrix.ts`** — the acceptance matrix for "a grant on a data store confers READ on everything inside it, and nothing more". Parameterized `--store / --entitled / --control`; defaults: AMA-G5 store `0158e878…`, grant-only reader `77c6af70…` (elliesadeghijd), control `929274b1…`. Asserts, at every tree level (store row, members, file metadata + DB-level download gate, docs, pages, page images, chunks, extraction jobs/runs/results, `files.*` baby tables): entitled **viewer=true / editor=false / rows visible**, control **all false / 0 rows**. Refuses a known super-admin as the entitled leg — super-admins report `can_curate=true` and mask exactly the failures this exists to catch.
- **`check-access-drift.ts`** — four guards that make the cascade failure class extinct: **edge coverage** (member → edge → reachability, plus unruled member kinds), **judge/RLS agreement** (kernel vs real rows — the `rag.data_stores` judge-yes/RLS-zero bug class), **dead policy** (policy exists, privilege missing — the schema-move USAGE-gap class), **registry cycles** (type-level + row-level containment loops that would stack-overflow RLS).
- **`lib.ts`** — env loading (same `.env*` scan as `check-migrations.ts`), service-key RPC calls, **real user JWT minting** (GoTrue admin `generate_link` → `verify`), and PostgREST count probes.

## Invariants

- **Probes are real, never simulated.** Judge probes hit the live SECURITY DEFINER predicates; row probes use a real minted user JWT so actual RLS runs. No mocks, ever (house rule: no fake verification).
- **SQL side** lives in `migrations/access_matrix_probe_helpers.sql`: `public.access_matrix_tree(store)` + `public.access_drift_report()` (service-role-only) and `public.rls_count_as(...)` (admin/MCP-only, SECURITY INVOKER — Postgres forbids SET ROLE inside SECURITY DEFINER).
- **Count probes select ONE named column** (`countCol`, default `id`) — `select=*` trips column-level privilege errors, and some tables (`rag.data_store_members`) have no `id`.
- **Chunk-level control probe uses a single chunk id.** A whole-corpus filter as a non-entitled user statement-times-out (per-row SECURITY DEFINER policy evaluation over thousands of rows — recorded in FOUND_DEFECTS), which is indistinguishable from denial.
- **Dead-policy allowlist** is inline in `check-access-drift.ts` with a reason per entry; deliberately-unshareable member kinds (`project`, `task`, `research`, `scraped`) are pinned there and documented in `features/rag/FEATURE.md`.

## Doctrine

Reused: `check-migrations.ts` env-loading pattern, the frozen access kernel + grant predicates (README §2 of `docs/proposals/shared-knowledge-projects/`), PostgREST + GoTrue admin APIs. Created: this directory (searched `scripts/` for an existing access-matrix/RLS-probe harness — none existed; `check-access-guards.ts` is static code analysis, not live-DB probing, and stays separate on purpose).

## Change log

- 2026-07-23 — created (P4): matrix + four drift guards, probe RPCs, package.json wiring.
