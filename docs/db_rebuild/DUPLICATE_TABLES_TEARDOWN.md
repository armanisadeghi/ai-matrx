# Duplicate / Legacy `public` Tables — Teardown Tracker

> **Why this exists:** leftover `public.*` tables that have a canonical home elsewhere are not just clutter — they let parts of the app **read or write the WRONG table**, which is silent client-data loss. This is the ledger of every such table, its real status, and exactly what blocks its removal. **Do not let a "done" cluster (scraper-style) hide the un-done ones.**
>
> Companions: [`DB_TRANSITION_PENDING.md`](./DB_TRANSITION_PENDING.md) (compat-VIEW drops + legacy columns), [`LEGACY_SYSTEM_DECOMMISSION.md`](./LEGACY_SYSTEM_DECOMMISSION.md) (FE code decommission), [`TEARDOWN_READINESS_AUDIT.md`](./TEARDOWN_READINESS_AUDIT.md). This doc is specifically about **physical duplicate TABLES** in `public`.

## The law (non-negotiable)
1. **Retire = `ALTER TABLE … SET SCHEMA graveyard`** (reversible, zero row loss). NEVER hard `DROP` during the transition — that's a later PITR-gated step.
2. **Before moving any table, prove ZERO current-system consumers** across **FE + aidream + DB** (functions/policies/views/FKs). The scraper disaster (below) is what happens when you skip the aidream check.
3. **`graveyard` is NOT in aidream's `matrx_orm.yaml` `additional_schemas`** → moving a table there stops matrx-orm from regenerating its `db/managers/*.py`. This is the mechanism that finally kills the auto-regenerating references.
4. Verify pre/post `count(*)` on every move.

## Status legend
- ✅ **DONE** — already in `graveyard`, no live consumers.
- 🟥 **BLOCKED-LIVE** — the *current* system still reads/writes it; removing it breaks production. Needs a repoint FIRST. **Most dangerous class.**
- 🟧 **HALF-MIGRATED** — a canonical twin exists but both are live / out of sync. Needs a cutover.
- 🟨 **DEAD-SYSTEM (FE-gated)** — the system is dead but FE/aidream code still imports it; gated on code decommission (Waves in LEGACY_SYSTEM_DECOMMISSION.md).
- 🟦 **CANDIDATE** — looks removable; needs the zero-consumer check before moving.

---

## 🟥 Category 1 — LIVE SYSTEM ON OLD TABLE (the dangerous ones)

### scraper — `public.scrape_*` (25 tables, 7,237 rows) — **BLOCKED-LIVE**
The new `scraper.*` crawl system is a **different schema**, not a rename — and the **current** code still uses the old tables:
- **matrx-scraper (the NEW scraper)** uses `public.scrape_parsed_page` (5,541 rows) as its persistent `TwoTierCache`: raw SQL in `packages/matrx-scraper/matrx_scraper/cache.py` (SELECT/INSERT/UPDATE), wired via `orchestrator.py`, `crawler.py`, `server/app.py`, `ext_router.py`.
- **research** reads `scrape_domain` (25) + `scrape_path_pattern` (5) on every scrape: `research/domain_policy.py` (`_load_from_db`), called from `research/scraper.py:125,336`.
- The old per-table `db/managers/scrape_*.py` were auto-generated from these tables (now deleted, but regenerate while the tables live in `public`).

**Attempted 2026-06-27:** graveyarded all 25 → caught the live consumers in verification → **reverted** (DB restored, 0 rows lost). Do NOT retry without the repoint.

**To actually retire (forward migration):**
1. Create `scraper.parsed_page_cache` (mirror of `scrape_parsed_page`) + `scraper.domains` / `scraper.path_patterns`; migrate rows.
2. Repoint `matrx-scraper/cache.py` raw SQL → `scraper.parsed_page_cache`; repoint `research/domain_policy.py` → the new policy tables (+ delete the old managers).
3. Verify crawl + research run, **then** graveyard `public.scrape_*`.
> Design decision required: canonical home for the new scraper's cache + domain-policy store.

---

## 🟧 Category 2 — HALF-MIGRATED DUAL SYSTEMS

### org invitations — `public.organization_invitations` (2 rows) vs `iam.invitations` (1 row) — **HALF-MIGRATED**
`iam.invitations` is canonical for **project** invites (via `inv_*` RPCs / `invitationsService.ts`), but **org invites still use the public table** in 10+ live places: `app/api/organizations/invite/route.ts`, `app/api/organizations/invitations/resend/route.ts`, `app/(core)/invitations/organization/accept/[token]/page.tsx:86`, `features/organizations/service.ts:691,715,850`, `features/messaging/hooks/useUserConnections.ts:153`. Counts differ (2 vs 1) → not a synced copy.
**To retire:** repoint the org-invite consumers onto `inv_*` RPCs over `iam.invitations`, migrate the 2 rows, verify, then graveyard `public.organization_invitations`.

---

## 🟨 Category 3 — DEAD LEGACY SYSTEMS (gated on FE/aidream decommission)

These are the old recipe / prompt-builder / applet-component / entity systems. The system is dead, but code still imports the tables, so they can't be graveyarded until the decommission waves in [`LEGACY_SYSTEM_DECOMMISSION.md`](./LEGACY_SYSTEM_DECOMMISSION.md) land. Indicative ref counts (need per-file confirm at execution):

| Table | rows | FE refs | aidream refs | Notes |
|---|---|---|---|---|
| `recipe` | 318 | ~8 | ~23 | Old recipe/automation system (Decommission Wave A). |
| `compiled_recipe` | 9,365 | ~5 | ~12 | Compiled recipes; heaviest data. |
| `component_groups` | 309 | ~2 | ~4 | Applet/field builder. |
| `field_components` | 361 | ~2 | ~4 | Applet/field builder. |
| `message_template` | 906 | 0 | ~2 | Old messaging/recipe templates — near-clear; verify the 2 aidream refs. |

Already graveyarded peers (for reference): `data_broker`, `message_broker`, `broker_values`, `data_input_component`, `registered_function`, `registered_node`.

---

## 🟦 Category 4 — STALE OLD/NEW PAIRS & BESPOKE TABLES (likely quick wins — verify then graveyard)

| Table | rows | Canonical / replacement | FE refs | aidream refs | Action |
|---|---|---|---|---|---|
| `system_prompts_new` | 24 | abandoned half of pair; canonical = `agent.definition` | 0 | 0 real (gen-only) | ✅ **GRAVEYARDED 2026-06-27** — verified zero real consumers. |
| `schema_migrations` (public) | 5 | `public._schema_migrations` + `supabase_migrations.schema_migrations` | 0 | 0 real (gen-only) | ✅ **GRAVEYARDED 2026-06-27** — legacy ledger, zero real consumers. |
| `system_prompts` | 24 | `agent.definition` (prompt→agent sweep) | ~7 | ~3 | 🟨 Still live in FE. Per LEGACY_SYSTEM_DECOMMISSION "easy UUID-swap": same UUIDs exist as agents. Repoint then graveyard. |
| `note_shares` | 0 | `public.permissions` | 0 | **live RAG SQL** | 🟥 **BLOCKED** — `matrx-rag/search.py:1162` + `rag_search_lab.py:299` read `public.note_shares` in the share-ACL subquery (even at 0 rows the table must exist). Repoint that SQL to `permissions` first, then graveyard. |

---

## ✅ Category 5 — ALREADY DONE (in `graveyard`, for the record)
- `organization_members` → **dropped** (membership now `iam.memberships`; FE cutover + `mbr_add` creator-bootstrap + `memberships.organization_id` ON DELETE CASCADE + `org_select_policy` definer-fix all shipped 2026-06-27).
- `cld_*` (file/cloud old names): `cld_events`, `cld_file_permissions`, `cld_user_group_members`, `cld_user_groups` → graveyard.
- `wr_*` (war-room old names): `wr_assignments`, `wr_tile_attachments`, `wr_tile_audio_sessions`, `wr_tile_notes` → graveyard.
- broker/component: `data_broker`, `message_broker`, `broker_values`, `data_input_component`, `registered_function`, `registered_node` → graveyard.

---

## NOT duplicates — keep (canonical `public` tables, do not touch)
The bulk of `public` is canonical and stays: `organizations`, `organization_preferences`, `profiles`, `notes`, `permissions`, `agent_run*`, `studio_*`, `udt_*`, `rs_*`, `pc_*`, `canvas_*`, `kg_*`, `sms_*`, `sch_*`, `wbx_*`, `wc_*`, `dm_*`, `flashcard_*`, `ui_surface*` (live — `agent.agent_surface` FKs it), `processed_documents*` (canonicalizing in place via bridge, NOT a separate-table dup), etc. **Only the tables listed in Categories 1–4 above are teardown targets.**

---

## Execution protocol (per table/cluster)
1. **Data**: confirm canonical twin exists + holds the data (or the old data is intentionally abandoned — graveyard preserves it either way).
2. **Consumers = 0** across: FE `.from('<t>')`/embeds/registry config/`Database["public"]["Tables"]["<t>"]`; aidream `.from`/raw SQL/managers/`matrx_orm.yaml`; DB functions/policies/views/inbound-FKs.
3. **Move**: `ALTER TABLE public.<t> SET SCHEMA graveyard;` — verify pre/post counts.
4. **Record**: `migrations/*.sql` + `_schema_migrations` ledger; update this tracker.
5. Hard `DROP` only later, PITR-gated, after the graveyard soak.

## Change log
- **2026-06-27 (DB-first sweep)** — Directive: move DB to target state NOW; code/type errors are the intended to-do signal; graveyard preserves data. Moved to graveyard (rows preserved, reversible): all 25 `scrape_*` (by user); dead recipe/component/template cluster `recipe`(318), `compiled_recipe`(9365), `component_groups`(309), `field_components`(361), `message_template`(906); `organization_invitations`(2, + dropped the dependent "Invitees can view organization details" RLS on `organizations` to avoid a cascade break); `system_prompts`(24) + `system_prompt_executions`; `note_shares` (by user). **Now-open repoint work (the errors will guide it):** matrx-scraper `cache.py` + research `domain_policy.py` (scrape_* → scraper schema); org-invite consumers → `iam.invitations` (+ port 2 rows); prompt consumers → `agent.definition`; RAG `search.py`/`rag_search_lab.py` `note_shares` → `permissions`.
- **2026-06-27 (later)** — Graveyarded `system_prompts_new` (24) + legacy `schema_migrations` (5) after verifying zero real consumers. Reclassified `note_shares` → BLOCKED (live RAG-search ACL SQL).
- **2026-06-27** — Created. scraper investigated → BLOCKED-LIVE (graveyard attempted + reverted, 0 data loss). cld_/wr_/broker set confirmed already graveyarded. Membership cutover completed (organization_members gone; create/delete unblocked; org_select_policy RLS fixed). Categories 2–4 enumerated with indicative consumer counts pending per-file confirmation.
