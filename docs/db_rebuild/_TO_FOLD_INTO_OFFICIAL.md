# To fold into official/ (owner action)

> Nuggets pulled from the older non-official docs during the 2026-06-26 consolidation that are **binding rules or unique execution detail NOT yet in `official/`**. The consolidator can't edit `official/`, so they're parked here for you to fold in, then delete this file. Each item names its target official doc. Nothing here is new authoring — it's all lifted from docs that were trimmed/merged/deleted.

---

## → `official/db-changelog-for-team.md`

1. **Section 0 — "RLS is now generated — `iam.apply_rls` v2 (2026-06-26)"** is in the *non-official* `02-db-changelog-for-team.md` (deleted) but **missing from the official changelog**. The official changelog jumps to §5 (cx_conversation). Add the v2 section: one canonical RLS generator `iam.apply_rls(schema,table,token,variant)` + one resolver `iam.has_access`; stop hand-writing table policies; the `42501` `INSERT…RETURNING` bug it fixed (owner short-circuit reads `created_by` off the NEW row); applied to `wr_sessions`+`wr_threads`. Full mechanism already lives in `db-canonical-rls.md` (kept).
   - The two changelogs **diverged** (official has §5, non-official has §0) — pick the union: §0 + §5 both belong.

## → `official/db-rulebook.md`

2. **`iam.apply_rls` variants** — the rulebook says "generated from the registries; never hand-write," but doesn't name the three variants. Add: `apply_rls(schema, table, token, variant)` with `variant ∈ {entity, join, ledger}` (entity = Base-1 owner+visibility; join = `has_org_access(org_id)` only; ledger = org-read-only, no user writes). v2.1 also emits the anon `pub_read` policy for `visibility='public'`. (Detail in `db-canonical-rls.md`.)

3. **The owner-short-circuit RULE** (already in `db-canonical-rls.md`, worth promoting to the rulebook's Access model): an RLS policy may read the row's **own columns** directly, but must reach the one resolver (`iam.has_access`) for anything requiring other rows. **Never** put `iam.has_access(self_token, id, …)` as the *only* SELECT branch on a root entity — always lead with `created_by = (select auth.uid())`, or `INSERT…RETURNING` dies with `42501`.

4. **File-URL 3-category standard** (from `warroom-thread-integration-and-standards.md` §5 + `db-handover-notes.md` — matches the CLAUDE.md media-durability rule but states the DB-column form). Three categories that must **never share a column**: (A) our files → a `cld_files` id (FK/association), never a path; (B) external refs (git/website) → a clearly-named `*_url` column checked to never point at our own domains; (C) public CDN assets → their own delivery-URL column. Enforcement: reusable `platform._assert_external_url(text)` CHECK on B/C columns. Convert/exempt inventory was in `warroom-thread-integration-and-standards.md` (merged into `warroom-canonical.md`).

5. **`metadata` usage rule** (from `db-core-standards-and-automation.md`, kept): `metadata jsonb` is universal on Base-1, but **display hints / provenance only — never queryable business data**. Worth a line in the Base entity contract.

6. **`version` = anchor-now, optimistic-lock-later** (from `db-core-standards-and-automation.md` §4.3, kept): `_touch_row` increments `version` as a history anchor always; optimistic-lock *enforcement* (reject stale-version writes) is enabled per-table later once the app sends the version. Don't conflate the two roles.

## → `official/db-status.md`

7. **Rename → regenerate outage rule (the #1 server-outage cause)** — already in `CUTOVER_HANDOFF.md` (kept) and `HANDOFF.md` (deleted). A DB table/column rename is **NOT done after the `ALTER`**: you must immediately regenerate aidream's DB layer (`uv run db/generate.py`), fix broken model/manager **imports**, AND grep for old **class-name strings** (registries resolve models by name via `getattr(db.models, '<Name>')` — a clean import won't catch this; it breaks at runtime). Compat views do NOT save the Python import graph. Worth a standing one-liner in db-status's process notes so it's not buried only in the handoff.

8. **Out-of-scope litter groups** (from `CHANGEOVER_PROGRESS.md` §8, kept): `sch_*`, `wf_*`/workflow, `code_*`, `wc_*` carry `project_id`/`task_id` that are **real FKs, NOT association litter** — leave them. db-status's "Out of scope" only lists the `ai_*` family; add these.

## Notes for the owner

- **Doc-index drift:** the rulebook's doc index lists `app-agent-cutover-instructions.md` as a LIVE official doc, but the file actually lives at `docs/db_rebuild/03-app-agent-cutover-instructions.md` (outside `official/`) and is referenced by 4 code/FEATURE files. Either move `03-…` into `official/` and rename, or fix the rulebook index pointer. (Consolidator left `03-…` in place to avoid breaking the 4 live references.)
- **No contradictions block work**, but two stale-vs-current splits exist and are noted above: the changelog §0/§5 divergence (#1), and the rulebook "PROPOSED, awaiting confirm" schema-per-subsystem move vs the design docs treating the 6 schemas as already live (`iam/knowledge/work/platform/history/internal` are created; the cx/wf/cld/ctx rename is what's still proposed). Worth one reconciling sentence in the rulebook so agents know which schemas exist today.
