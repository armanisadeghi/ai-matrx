# Shared Knowledge access matrix + drift guards

**Status:** live (P4, 2026-07-23; governance-tier probe added 2026-08-14; guided-setup owner-write probe added 2026-08-15). **Owner surface:** `pnpm check:access-matrix` · `pnpm check:access-drift` · `pnpm check:governance-tier` · `pnpm check:guided-setup-rls` (all loud, non-blocking; `:strict` variants exit 1). Run the relevant probe after ANY change to the access kernel, an RLS policy, a library trigger, or a deploy that touches the guarded feature.

## What these are

- **`check-access-matrix.ts`** — the acceptance matrix for "a grant on a data store confers READ on everything inside it, and nothing more". Parameterized `--store / --entitled / --control`; defaults: AMA-G5 store `0158e878…`, grant-only reader `77c6af70…` (elliesadeghijd), control `929274b1…`. Asserts, at every tree level (store row, members, file metadata + DB-level download gate, docs, pages, page images, chunks, extraction jobs/runs/results, `files.*` baby tables): entitled **viewer=true / editor=false / rows visible**, control **all false / 0 rows**. Refuses a known super-admin as the entitled leg — super-admins report `can_curate=true` and mask exactly the failures this exists to catch.
- **`check-access-drift.ts`** — four guards that make the cascade failure class extinct: **edge coverage** (member → edge → reachability, plus unruled member kinds), **judge/RLS agreement** (kernel vs real rows — the `rag.data_stores` judge-yes/RLS-zero bug class), **dead policy** (policy exists, privilege missing — the schema-move USAGE-gap class), **registry cycles** (type-level + row-level containment loops that would stack-overflow RLS).
- **`check-governance-tier.ts`** — the acceptance probe for the EDIT/FULL boundary of THE THREE SHARE LEVELS (`common-docs/systems/platform/access/SHARE_LEVELS.md`; migrations `iam_governance_column_tier.sql` + `iam_governance_columns_align_to_share_levels.sql`; FOUND_DEFECTS D119). Creates a real `working_document` owned by `admin@admin.com`, grants **edit** to `test@test.com`, and PATCHes it **through PostgREST with a real minted JWT** — the exact path a sharee uses to walk around a UI-only check. Asserts both halves: an editor cannot trash it, take ownership, or move it to another company (42501 → HTTP 403), **and** can still rename, change content and metadata, **publish and un-publish** (publishing is edit-level work, deliberately), and restore something from the trash; owner and full-level grantee govern; `created_by` is refused at every level. Fixtures deleted in a `finally`. An "allowed" failure is as serious as a "refused" one — a blocked legitimate collaborator is a defect.
- **`check-guided-checklist-run.ts`** — the focused regression for `platform.guided_checklist_run`. A real user JWT INSERTs under a target org the owner does not belong to, re-reads the row as that owner, proves an unrelated user sees zero rows, and deletes the fixture through owner RLS. This locks the owner-keyed—not active-org-keyed—contract that broke first-run persistence on 2026-08-15.
- **`lib.ts`** — env loading (same `.env*` scan as `check-migrations.ts`), service-key RPC calls, **real user JWT minting** (GoTrue admin `generate_link` → `verify`), PostgREST count probes, and reusable true-RLS INSERT/PATCH/DELETE probes that distinguish a real DB refusal from a silent zero-row no-op (they mean very different things).

## The one-shot spine probe (run after ANY access change — expect `t,f,t,f`)

```sql
select iam.has_access_as('77c6af70-a35e-4724-a304-64a0dd789674','file','e9868104-e276-4cdb-97a4-b948a13eb135','viewer'),
       iam.has_access_as('77c6af70-a35e-4724-a304-64a0dd789674','file','e9868104-e276-4cdb-97a4-b948a13eb135','editor'),
       public.can_read_processed_document('f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2','77c6af70-a35e-4724-a304-64a0dd789674'),
       public.can_curate_library_document('f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2','77c6af70-a35e-4724-a304-64a0dd789674');
```

Viewer yes, editor no, read yes, curate no. Anything else means you broke something. Live ids: AMA file `e9868104…` · root processed doc `f3cf55a1…` · AMA-G5 store `0158e878…` · industry `ca-workers-comp` `dfdff5a8…` · Matrx Library org `5e44ec19…`. **Prove any access change with a rolled-back synthetic transaction** — `BEGIN; insert membership; insert association; select iam.has_access_for(...); ROLLBACK;` — never by reasoning.

**Two traps that make a correct kernel look broken:**

- **`file` does not go straight to the base kernel.** `iam.has_access_for` routes `file` through `files.has_access_for`, where a **crawl artifact marked `system_immutable` is viewer-ceiling for everyone** — an editor-level probe against one returns false *by design*. Probe conveyance with a non-crawl file (`not files.is_crawl_artifact(id)`).
- **Registering an `association_types` rule conveys nothing until real edges exist.** Container conveyance (`file/data_store/working_document/processed_document → project|task|war_room`, editor) is live and the product writes those edges through the `associationsService` chokepoint — project workspace "Associated resources" (`AssociationCardGrid`), the task attachments panel, and the war-room resources lists. Zero edges in the wild is "nobody has attached anything yet", not a broken cascade.

## Invariants

- **Probes are real, never simulated.** Judge probes hit the live SECURITY DEFINER predicates; row probes use a real minted user JWT so actual RLS runs. No mocks, ever (house rule: no fake verification).
- **SQL side** lives in `migrations/access_matrix_probe_helpers.sql`: `public.access_matrix_tree(store)` + `public.access_drift_report()` (service-role-only) and `public.rls_count_as(...)` (admin/MCP-only, SECURITY INVOKER — Postgres forbids SET ROLE inside SECURITY DEFINER).
- **Count probes select ONE named column** (`countCol`, default `id`) — `select=*` trips column-level privilege errors, and some tables (`rag.data_store_members`) have no `id`.
- **Chunk-level control probe uses a single chunk id.** A whole-corpus filter as a non-entitled user statement-times-out (per-row SECURITY DEFINER policy evaluation over thousands of rows — recorded in FOUND_DEFECTS), which is indistinguishable from denial.
- **Dead-policy allowlist** is inline in `check-access-drift.ts` with a reason per entry; deliberately-unshareable member kinds (`project`, `task`, `research`, `scraped`) are pinned there and documented in `features/rag/FEATURE.md`.

## Doctrine

Reused: `check-migrations.ts` env-loading pattern, the frozen access kernel + grant predicates (`features/rag/FEATURE.md` § Shared Knowledge Resources), PostgREST + GoTrue admin APIs. Created: this directory (searched `scripts/` for an existing access-matrix/RLS-probe harness — none existed; `check-access-guards.ts` is static code analysis, not live-DB probing, and stays separate on purpose).

## Change log

- 2026-08-15 — added the real-session guided-checklist owner INSERT/re-read/cross-user-denial regression.
- 2026-07-23 — created (P4): matrix + four drift guards, probe RPCs, package.json wiring.
