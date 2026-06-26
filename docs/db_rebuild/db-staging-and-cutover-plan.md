> 🟡 **GOVERNS THE DESTRUCTIVE WAVES (3–5).** The non-destructive foundation (entity_types, associations + mirror triggers, canonical RLS, history, categories/user_entity_state) was already applied directly on prod — see `official/db-status.md` + `CHANGEOVER_PROGRESS.md`. **PITR is now ON.** So Waves 0–2 are done on prod; this plan's "rehearse-first" discipline + the **move-to-graveyard** safety (§4) apply to the remaining base-retrofit (Wave 3), schema rename (Wave 4), and cleanup/drops (Wave 5).

# Staging & Cutover Plan — the big rebuild

> You have one primary DB and no dev environment. For a rebuild this size that has to change first. This is the right approach.

## 1. Stand up a real staging environment (fixes "no dev DB" permanently)
**Use a Supabase persistent branch** as the lasting dev/staging database. Persistent branches are long-lived and purpose-built for staging/QA — unlike preview branches they aren't auto-paused or deleted. (The Supabase MCP exposes `create_branch`/`list_branches`, so this is one call away.)

Two facts to design around:
- **Branches start data-less by design** (to protect production data). You populate them yourself — via a seed file (GitHub-integration flow) or by loading a dump.
- **Each branch is a separate billed Postgres instance** with its own URL/credentials. Auth/Storage aren't auto-cloned. Treat branches as replaceable, never as production.

**For this rehearsal:** create the persistent branch, then load a `pg_dump` of production into it. Your data is tiny (dev-stage, ~1 real user, ~234 association edges + the war-room/category data), so a full real-data clone is fast and gives a faithful rehearsal. (If you'd rather fully decouple, a second Supabase project restored from a prod backup works the same way — slightly more manual, fully isolated.)

## 2. Author the rebuild as ordered, idempotent migration files — not ad-hoc MCP SQL
This is the single most important discipline. Everything becomes timestamped migration files in `./supabase/migrations`, version-controlled, each independently re-runnable. Why:
- It's how a branch deploys to production on merge (the "flip the switch" *is* applying these files).
- It's reproducible, reviewable, and rollback-reasoned (pair each forward migration with a documented down/recovery).
- It stops the exact failure mode you flagged: agents working around undocumented direct changes.

## 3. Rehearse the full thing on the branch, in waves
Run the waves (review doc §"How the association work folds in") end-to-end on the branch against the prod-data clone:
0. entity_types registry → 1. base scaffolding (triggers/RLS/CI lint) → 2. association unification → 3. base retrofit (audit/version/soft-delete/`org_id` backfill + NOT NULL) → 4. schema reorg + rename (with `public` compat views) → 5. cleanup/drops.

After **each** wave on the branch: run the 10-agent internals audit (`ctx-supabase-internals-audit-brief.md`), point a copy of the app at the branch URL, run the test suite + manual QA, and **measure timing**. Fix, re-run, iterate until a wave applies clean and the app is green. Only then move to the next wave.

## 4. The "massive cleanup / kill old tables" step
Do it on the branch first, gated by evidence — and on prod, **move, don't drop:**
- Inventory dead tables (zero rows AND zero references found by the internals audit AND zero app references found by the codebase audit). Retire only those.
- **Move-to-graveyard pattern (the safety net):** never `DROP TABLE` directly. `ALTER TABLE old SET SCHEMA graveyard` — data fully preserved, instantly reversible, and out of the active/exposed schema. Drop litter columns only after confirming their data is in `platform.associations`. `DROP SCHEMA graveyard CASCADE` only after a soak window with the app green. PITR is the second layer under this.
- Everything retired goes in a general "removed objects" ledger so a thing is only finally dropped once it's `verified` unused.

## 5. Cutover — two options, my recommendation
- **(Recommended) Rehearse-on-branch, apply-scripts-to-prod.** During the announced outage, run the *same finalized migration files* against production (branch merge, or direct apply). Fewest moving parts: same auth, same storage, same connection strings. Roll-**forward** strategy; keep a pre-cutover snapshot purely for emergency restore.
- **(Possible, not preferred) Blue-green project flip.** Build the new DB as a fresh project and repoint the app. More feasible *now* than ever (few users, little data) — but it drags auth.users, storage objects, edge functions, secrets, and every connection string with it. Only choose this if you also want a clean project for unrelated reasons.

## 6. Pre-cutover gate (all must be true)
- [ ] All waves apply clean on the branch from an empty schema **and** against the prod-data clone.
- [ ] App (pointed at branch) passes tests + manual QA.
- [ ] Internals audit (10-agent) and codebase audit return no unresolved references to dropped objects/columns.
- [ ] `org_id` backfilled and `NOT NULL` enforced with zero violations on the clone.
- [ ] Timing measured; fits the outage window with margin.
- [ ] Fresh production snapshot taken immediately before cutover.
- [ ] Rollback decision documented (roll-forward default; restore-from-snapshot only as the break-glass).

## 7. After cutover
- Keep the persistent branch as the **permanent dev/staging DB** — every future change rehearses here first. The "no dev database" problem is solved for good.
- Flip ledger rows to `dropped`; retire compat shims (`public` views, `*_deprecated` tables, INSTEAD OF triggers) once nothing references them.