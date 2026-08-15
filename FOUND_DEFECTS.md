# FOUND DEFECTS — AI Matrx Admin (frontend)

The ledger of found bugs and gaps on the frontend. Twin of aidream's `FOUND_DEFECTS.md`.

**Rules**

- File only defects you can't fully fix in the moment, and only UNRELATED findings — a bug related to your current task gets **fixed**, not filed. Enough context to act cold: what, where, the fix.
- **Claim the next free ID by grepping `^### D` first.** Duplicate IDs have collided four times (two D138s, two D150s, two D167s, two D183s, two D184s) — an entry other docs cite by number must keep its number, so the LATER filing is the one that gets renumbered.
- **When you fix one: collapse it to a one-line bullet in Resolved (title + date + commit/file pointer) — or delete it outright.** No histories, no verification narratives, no journeys. An entry earns lines only while it is open.
- Keep open entries compressed to load-bearing facts: what's broken, exact paths, the fix, who decides. A partially-fixed entry keeps only the open remainder.
- CLAUDE.md links here. Read both before touching files, media, or persistence.

---

## OPEN

### D200 — creating a personal (user-scoped) agent shortcut is IMPOSSIBLE — every path throws (2026-08-15)

Measured live on production as a signed-in admin. `agentShortcutToInsert`
(`features/agents/redux/agent-shortcuts/converters.ts:321`) hard-throws
`"cannot insert a shortcut without an organization"` when `organizationId` is
null — and **all three create callsites pass `organizationId: null`**:
`ShortcutForm.tsx:338`, `useShortcutQuickCreate.ts:304`, and
`LinkAgentToShortcutModal.handleCreate`. `applyScopeToRowFields`
(`features/agent-shortcuts/hooks/useAgentShortcutCrud.ts`) only fills the org for
`organization`/`project`/`task` scopes, and the `createShortcut` thunk
(`thunks.ts:618`) stamps `userId` but never an org. So **scope `user` can never
insert** — which is why `/agents/[id]/shortcuts` reads "Your shortcuts: 0" for an
account that has been trying.

Two things make it invisible: the failure is client-side (no request is ever
sent, so a network tab shows nothing), and `unwrap()` throws a plain RTK object,
so the modal's `err instanceof Error` check misses and every caller renders its
generic fallback string instead of the real message. **Fix that masking
regardless** — it cost an entire debugging session here.

**Arman decides the semantics, not an agent:** which organization owns a
*personal* shortcut, and what happens when the user has **no active org** (this
very account shows the "Choose your organization — no active organization is
set" prompt). Stamping from the active org would also collide with db-rules §6
("access NEVER depends on the active organization"). Candidate answers: make
`organization_id` nullable for user-scoped rows; or resolve the owner's personal
org server-side from `auth.uid()`; or route creates through the
`createShortcutForAgent` RPC, which already takes `p_organization_id`.

Found while mounting `LinkAgentToShortcutModal` (that mount shipped, v0.4.660/664).
Everything upstream of the insert is verified working live: both entry points,
the modal, inline category create (`crm`-style POST returns 201), and the
auto-select. Only the final insert is blocked.

### D199 — ~657 rows across 8 tables are invisible to EVERY non-admin user (2026-08-14)

The component-RLS conversion emits `fk IN (SELECT unnest(accessible_entity_ids(…)))`
arms. **A NULL foreign key can never match an `IN`**, so any row whose parent FKs
are all NULL and whose `created_by` is NULL has no true arm and is unreachable
forever. Measured live, rows-unreachable/total: **`tool.ui` 25/28**,
`tool.ui_version` 20/35, `tool.test_sample` 18/28, `tool.ui_incident` 30/441,
`seo.keyword_market_observation` 545/2686, **`seo.gsc_dig_rule` 8/8**,
**`seo.keyword_class_rule` 11/11**, `agent.usage` 1/69. The two SEO rule tables
are fully dark AND refuse creation (42501, `std_insert` demands a non-null site).

🚨 **Super-admins still see these rows — measuring with an admin account shows
"all readable" and hides the bug.** Cross-checked as non-admin
`d537f0cf-c5b8-4ec8-a859-09404ed0f699`: `tool.ui` 3/28, `test_sample` 10/28,
`ui_version` 7/35, `keyword_market_observation` 0. **Always probe RLS as a
non-admin.**

The affected rows are ownerless BUILT-IN/platform data (the SEO ones are seeded
system templates, `migrations/seo_gsc_dig_class.sql`), so modeling them as
components of a site/tool they never belonged to is the wrong model — a
parent-less row is the NORMAL case. Likely fix: `entity` variant + platform-global
tier for builtins (db-rules §6e) + a backfill — **Arman's call, needs a brief.**
Write paths to fix too: `features/marketing/search-console/data-dig.ts`,
`data-class-rules.ts`. **Verified NOT affected** (invisible rows point at real
unreachable parents — correct): `seo.backlink_observation`, `backlink_snapshot`,
`reputation_case`, `competitor_opportunity`, `web.property`, `web.link_edge`,
`web.analysis_result`. **Chip fired 2026-08-14**, including a standing guard so
this class stops being invisible until a user complains.

### D197 — CMS `PageListView` is a bespoke list, not on the canonical entry-list shell (2026-08-14)

**Surface:** `/cms/[siteId]` (Pages tab). **Action:** try to switch to cards/dense, persist a sort, filter by
Status or Content, or scope to Shared/Public. **Wrong outcome:** none of it exists — the surface hand-rolls
its own `<table>`, its own search/sort/category state, and its own toolbar.

`features/cms/components/PageListView.tsx` predates `lib/entity-list/` (`<EntityListPage config={...}/>`,
[`lib/entity-list/FEATURE.md`](./lib/entity-list/FEATURE.md)) and never moved onto it. Consequences the shell
would give for free: view-style persistence via `useListViewPrefs` (today nothing persists), per-column sort
**and** filter (today Status and Content sort/filter not at all, and Category filters only through bespoke
chips), Mine / My Orgs / Shared / Public scopes with true counts, and the canonical column registry. Its row
actions are already correct and portable — `buildCmsPageMenu` + `ItemMenu` is exactly the one-`ItemMenuConfig`-per-entity
shape the shell expects, so the action layer needs no work.

Not fixed in the 2026-08-14 content-manager reconciliation because a shell migration is a rewrite of the
surface, not a port. **Fix:** write a CMS-page list config (service RPCs per `lib/list-scope/FEATURE.md` +
column registry + the existing `buildCmsPageMenu` row-actions hook) and render `EntityListPage`, keeping the
Content-volume column and the `matrx-user/cms-site` `SurfaceRoleAgentButton` + `onFocusPage` hover handoff —
those are CMS-specific and must survive the move.

### D195 — `TransformableCard` silently ignores `initialPosition` when more than one is mounted — FIXED 2026-08-14

**Surface:** `/demos/draggable-cards` (demos.aimatrx.com). **Action:** mount two `<TransformableCard>` with
distinct `initialPosition` values in one `<TransformableCardContainer>`. **Wrong outcome:** both render on the
same origin, the later one hiding the earlier, and `initialPosition` has no visible effect — verified live
across v0.4.640–v0.4.643. Fixed and verified live on demos.aimatrx.com.

**The root cause was `transition-all`, NOT the wrapper.** The card's className ended in Tailwind's
`transition-all`, which makes the browser transition the `transform` property. Motion writes `transform`
every frame, so the CSS transition fought it — interpolating from `none` and leaving the computed transform
at the identity matrix while motion's `x`/`y` held the correct values. The translate was silently discarded
and every card sat at its wrapper origin. Measured live: inline style read
`transform: perspective(3000px) translateX(24px) translateY(24px)` while `getComputedStyle().transform`
returned `matrix(1, 0, 0, 1, 0, 0)`, with a running `CSSTransition` on `transform` keyframed from `"none"`;
`getAnimations()` and stripping only that one class confirmed it. The near-twin
`enhanced-draggable-card.tsx` never carried `transition-all`, which is the entire reason its half laid out
two cards correctly.

The earlier diagnosis in this entry — that the `relative` zero-height wrapper made each card its own
containing block — was **wrong as a root cause**. Two zero-height wrappers stack at the same flow position,
which is the container origin, so the translate would have separated them correctly. The wrapper was still
changed, to an explicit zero-size anchor (`absolute top-0 left-0`) with the perspective moved onto the motion
element as `transformPerspective` and z-index lifted to the wrapper: that makes "`initialPosition` is a
container coordinate" true regardless of what else shares the container, and lets a dragged card rise above
its siblings. That is a robustness improvement, not the fix.

**Rule this leaves behind:** never put `transition-all` on a motion-driven element — transition named
properties or none. One more instance is logged in `.matrx/PATROL_SIGHTINGS.md`
(`features/agents/resources/ResourceChips.tsx:133`, `whileHover={{ scale }}` + `transition-all`).

Never hit before because **both components had zero runtime consumers** — their only mounter was
`/legacy/demo/component-demo/draggables/transformable-cards-demo`, deleted with the `(legacy)` route group.
`/demos/draggable-cards` is the new mounter and now shows two cards at distinct positions. Open question for
Arman: these are two near-duplicate ~400-line components (plus the untouched 191-line upstream original
`draggable-card.tsx`, still with zero consumers) sharing one drag/snap/container model — should they
converge? Neither may be deleted (unfinished-work alarm).

### D193 — Four user-content entities can't be shared with an organization at all (2026-08-15)

**Found by the platform-wide scope audit Arman asked for** after the CMS finding ("everything in our database should essentially be the same unless it's truly a private personal thing"). Good news first: of **193 active entity tables**, only 5 lack `organization_id` and 4 of those are correct (`iam.organizations` IS the org; `public.app_log` is a system log; `runtime.global_origin` is D100; `ui.ui_surface` is a registry, chipped). The platform is broadly consistent.

The real gap is `visibility`. These four are **registered as shareable**, are user-created work product, already carry `organization_id` — and have **no `visibility` column**, so they sit on the legacy boolean `is_public` + `user_id` model. There is no way to express "share with my org": every row is private-or-world.

| token | table | live rows |
|---|---|---|
| `workbook` | `workbench.udt_workbooks` | 17 |
| `udt_document` | `workbench.udt_documents` | 24 |
| `dataset` | `workbench.udt_datasets` | 140 |
| `structured_list` | `workbench.udt_structured_lists` | 28 |

Their `shareable_resource_registry` rows say `is_public_column='is_public'`, `owner_column='user_id'` — the legacy `make_resource_public` path, not the canonical `setVisibilityColumn` enum path. **Chip fired 2026-08-15.**

**Separate, smaller, same audit — `context_item` sharing is half-wired:** `platform.shareable_resource_registry.context_item` declares `is_public_column='visibility'`, but `context.context_items` **has no `visibility` column** (D117's exact class, which was fixed once for `content_ir_kind_instance`), and its `url_path_template` is an empty string. 203 live rows. So the public toggle writes a column that does not exist and the sharing UI cannot link to one. Fix the registry row (live + TS mirror + snapshot together, parity test) and decide whether context items should carry canonical visibility — they are scope data belonging to an org, so per Arman's ruling they probably should.

The other 51 `visibility`-less entities were reviewed and are legitimately non-shareable (user preferences, memberships, invitations, likes/views, system errors, job runs).

### D194 — two surface providers at the same depth silently pick a winner; no warning (2026-08-15)

`features/surfaces/runtime/SurfaceRuntimeContext.tsx::getSurfaceRuntime()` resolves "deepest wins,
ties broken by higher registration id". Depth is correct and load-bearing for real nesting (an open
window out-depthing the page). The unguarded case is SIBLINGS: two components at the same depth
registering the same `surfaceName` — the registry quietly drops one and the agent gets the wrong
page's data. Nothing logs, nothing throws. This shipped and was caught by a review bot, not by us
(D193).

**Fix:** dev-mode `console.warn` inside `registerSurfaceRuntime` when a registration lands on a
surfaceName that already has a live entry at the SAME depth, naming both call sites — the second
independent layer the loud-recovery doctrine requires. Filed as AI Dream feedback
`ebed27b8-8544-4a6a-92f3-3dabdebe2ad0`.

### D195 — `append_rows_to_user_table`'s only caller is in matrx-extend and still reads the old error text (2026-08-15)

The D167 honest-access-error sweep (`migrations/invoker_fns_honest_access_error.sql`, applied live
2026-08-15) rewrote 17 SECURITY INVOKER functions to raise an honest ambiguous message under
errcode **P0002**. Sixteen had their frontend callers rewired in the same commit. The seventeenth,
`append_rows_to_user_table`, has **zero** callers in this repo — its only consumer is
`matrx-extend/src/lib/supabase/user-tables.ts:257`, which this repo cannot edit.

Nothing is broken today (that caller does not string-match the message), but the extension now
receives an access answer it does not route. **Relay prompt for the matrx-extend agent:**

> `append_rows_to_user_table` (public, SECURITY INVOKER) no longer raises `'table not found or not
> owned by caller'`. Its zero-row gate is ambiguous under RLS, so it now raises an honest message
> under errcode `P0002`. In `src/lib/supabase/user-tables.ts:257`, branch on `error.code ===
> "P0002"` and surface it as an access-unresolved state (never as "not found" / "not yours"). Do
> not match the message text.

### D196 — two SECURITY DEFINER functions embed the access predicate in the lookup, then say "not found" (2026-08-15)

The weak twin of D167, found during that sweep. A definer bypasses RLS, so its zero-row branch is
normally genuine — but when the access test is written **inside** the lookup's `WHERE`, the branch
conflates denial with absence again:

- `public.edu_resolve_suggestion` — filters `(owner_id = v_uid or public.is_super_admin())` in the
  lookup, then raises `'suggestion % not found or not yours'`. Text is honest; it carries **no
  errcode**, so no client can route it.
- `public.mbr_update_role` — `'membership container not found'` fires when `iam._container_authz()`
  returns no row, which includes "the actor has no role in that container". Already P0002.

**Fix:** split each into an explicit access check that raises its own denial (the pattern
`version_snapshot` / `version_restore` already use — `iam.has_access(...)` → `'access denied'`),
leaving the not-found branch to mean only absence. Spot-check scope: 12 of the 155 definers that
raise "not found" were read (agx_/crm_/edu_/mbr_/version_); the other 143 are unaudited.

### D192 — CRM "Save as contact" drops the selected employer affiliation (2026-08-15)

The deploy blocker is gone: production aidream SHA `1adecedd5` contains `da0bcaba3`. Live on
`www.aimatrx.com`, selecting `Morgan Alder / Director of Partnerships / Northstar Verification
Labs / morgan.alder.d192.20260815@example.com` and running **Convert → Save as contact** completed
the governed agent run and opened `/crm/cdc71135-038d-462c-a632-ff0d46c41da5`. The person and
email contact point are correct, proving feedback `3efd1f7c-f9ec-45e3-bb43-bceea595db3c` was not
the cause of this run. **Employment is empty (0), and no Northstar company record exists**; the
company survived only inside `party.headline`. The review dialog also left the selected email
blank, although the agent recovered it from the raw selection.

This cannot meet the documented signature-block acceptance yet: frontend
`parseContactSelection` finds `companyLine` but drops it from `ParsedContactSelection`/agent
`hints`, while aidream `services/crm/FEATURE.md` explicitly says the v1 resolver has no
affiliation/employer handling. Finish the governed path by carrying an employer hint, resolving
or creating the company through the party resolver, and writing `crm.affiliation`; keep the raw
`database` tool blocked. Re-run the same production proof and require the Employer card/door.

### D158 remainder — persisted DataRef and legacy dynamic-table contracts still use bare names (2026-08-13)

Two contracts cannot be re-keyed safely without data/API migration. (1) `features/scopes/registry/entityRegistry.ts#UNIQUE_TABLE_NAME_TO_TOKEN` and `DataRefHoverPreview.tsx` consume `DataRef.table`; aidream's `packages/matrx-ai/matrx_ai/db/content_types/data_ref.py` persists the values `notes/tasks/projects/organizations`. Switching one side would break historical message blocks and generated API types; migrate the wire values to entity tokens or `schema.table` across DB rows, Python, generated types, and frontend together. (2) `workbench.udt_datasets.table_name` is a user-facing dataset label keyed by `(user_id, table_name)`, not a physical relation, but its column/API name makes it indistinguishable from one; rename it to `dataset_key`/`label` only with the workbench RPC, data, and generated-type migration. The contained 33-function legacy `p_table_name` family remains D123 and must be removed as already decided, not re-signatured piecemeal.

### D188 — `platform.assists` fails the canonical entity gate (2026-08-13)

Found while shipping producer-level suppression; unrelated to that lifecycle change.
Live `platform.verify_canonical('platform', 'assists')` reports `organization_id`
nullable with no organization FK, missing `created_by` / `updated_by` user FKs, and
the legacy-owner `user_id` warning. Fix this as one focused base-entity retrofit after
auditing every current producer; do not fold it into suppression or change the personal
addressee contract while doing so.

### Database reorg regressions → CLOSED 2026-08-13, no working list remains

Every regression from the ~160-migration reorganization of 2026-08-11→13 is fixed and
verified live; `docs/db_changes/DB_REGRESSION_SWEEP.md` was deleted rather than left as
an archive. Both durable lessons moved to their permanent homes: "a migration file on
disk changes nothing" is §Database migrations in [CLAUDE.md](CLAUDE.md), and the
conformance checker's contract — **act on `audit.broken_functions.severity`, NEVER on
`level`** — is `common-docs/systems/db-rules/FEATURE.md` §11.

⚠️ **The old "`audit.broken_functions` is ~97% false positives" warning is obsolete —
do not act on it.** That was true of the *broken* checker: 101 rows for 3 genuinely
broken functions, because `plpgsql_check` ran under a `search_path` no function ever
uses. Fixed 2026-08-13; each function is now checked under its own effective search
path, every finding carries a `severity`, and the actionable count is **0**. A `real`
row today is a real runtime failure — treat it as one.

### D193 (was a second D184) — `growth.v_loop_state` is exposed to nobody, and would leak every org if it were (2026-08-13)

Found while building the growth loop's human pipe. Two halves, both must land together:

1. **The schema is not reachable.** `growth` is absent from this project's PostgREST
   exposed-schemas list, so `supabase.schema("growth")` returns `PGRST106` and the client
   cannot read a loop's state at all. Every read is an aidream round-trip, against this
   repo's direct-read rule. Tracked as `G-ORCHESTRATOR-READ` in `loop-map.ts`.
2. **Exposing it as-is would be a data leak.** `growth.v_loop_state` is owned by `postgres`
   with **no `security_invoker`**, so it runs as its owner and bypasses RLS — any
   authenticated user would read every organization's loops. Its `web.v_*` siblings all set
   `security_invoker = true`; this one was missed. And once invoker is on, the stage columns
   go null for the loop's own creator: `growth.loop_stage_run`'s `std_select` resolves only
   through `iam.accessible_entity_ids`, with no parent-follows-`loop_run` arm (the pattern
   `workflow.plan_sample`'s `wf_plan_sample_parent_select` already uses). Overlaps D182 (2),
   which lists `growth.loop_event` / `loop_stage_run` among the 12 component tables with no
   `created_by` at all.

**Do not expose `growth` before both are fixed.** Order: `security_invoker` + the parent
select policy first, verified as a non-owner, then the schema exposure — and note that
writing a bad schema name into `pgrst.db_schemas` takes the WHOLE API down (project memory
`project_postgrest_schema_cache_outage`).

### D184 — 6 registered tables are protected only by a MISSING GRANT, not by RLS (2026-08-14)

Found by the guard rail Arman required before folding GRANTs into `iam.apply_rls` (see D182). These are holes, **not closed doors** — a table with RLS off or zero policies is one migration (or one grant) away from wide open, and two of them are already open.

| Table | Variant | State | `authenticated` grants |
|---|---|---|---|
| **`ui.ui_surface`** | entity | **RLS DISABLED**, 0 policies | **`SIUD`** — ⚠️ **live hole**: any logged-in user can insert/update/delete the surface registry |
| **`agent.card`** | component | **RLS DISABLED**, 0 policies | `S---` — every agent card readable regardless of visibility |
| `batch.cost_event` | entity | RLS on, **0 policies** | `SIUD` |
| `public.system_error` | entity | RLS on, **0 policies** | `SIUD` |
| `public.system_write_failure` | entity | RLS on, **0 policies** | `SIUD` |
| `runtime.global_origin` | entity | RLS on, **0 policies** | `----` |

The four "RLS on, 0 policies" tables are currently closed (no policy = no rows for `authenticated`) but grant-wide, so the first policy anyone adds opens them fully.

**Deliberately NOT auto-swept.** `iam.apply_table_grants` refuses to grant on any of them, so the v3 backfill skipped them safely. Fixing each needs a judgement about *intended* openness — `ui.ui_surface` is a registry that probably should be broadly readable but never client-writable; `agent.card` is a deliberate sharing surface. That is an openness call (db-rules §6 security philosophy), so it is Arman's, not an agent's. **Do not "fix" these by granting; give them real policies.**

### D182 — Component-RLS remainder (2026-08-13; **re-measured live + largely fixed 2026-08-14**)

**The 2026-08-13 numbers in the original entry were wrong in both directions and its prescribed fix was dangerous. Re-measured against the live DB 2026-08-14; adversarially verified by a second agent.** Applied: `migrations/iam_component_d182_parent_select_and_stamp_actor.sql` (ledgered, `pgrst` reloaded, verified live).

**FIXED — (2) self-referential component `std_select`.** Not "12 tables needing a `created_by` retrofit" — the real set was **10** component tables that have **no `created_by`** and whose `std_select` still resolved against their **own** token (`id IN accessible_entity_ids(<own token>)`, or `iam.has_access(<own token>, id)`): `runtime.global_execution`, `runtime.work_item`, `seo.ai_visibility_{citation,claim,signal}`, `seo.page_measurement_health`, `seo.provider_{call,task}`, `seo.raw_payload`, `seo.serp_result`. A STABLE function cannot see the tuple being inserted, so those arms resolved nothing and `INSERT…RETURNING` 42501'd. **Adding `created_by` would have been the wrong fix** — a component's access IS its parent's. `iam.apply_rls` already emitted the correct parent-fk form (2026-08-13); these 10 were simply never re-generated. Fix = re-run the canonical generator, no hand-written policy. Verified live: 0 self-referential remain; as the parent run's owner a `seo.provider_call` read returns the row (was 0) and 1000 rows resolve in **422ms**; an unrelated user still gets **0** (no leak).

**FIXED — (1) partially.** Only **2** component tables genuinely lacked the actor stamp (`seo.gsc_dig_rule`, `seo.keyword_class_rule`); trigger attached. The original "21" over-counted by detecting the trigger by **name** — 5 tables already run `platform._stamp_actor` under a bespoke name (`trg_stamp_actor`, `<table>_stamp_actor`). **Detect by `tgfoid`, never by trigger name**, or you create duplicates.

**OPEN — (1) remainder, and the original prescription is a trap.** 22 component tables have `created_by` but **no `updated_by`** column (15 of them `created_by NOT NULL` with no default, so a client insert fails **23502**, not 42501). ⚠️ **Do NOT "attach the canonical trigger trio" to them** — `platform._stamp_actor()` assigns `NEW.updated_by` *unconditionally*, so attaching it to a table without that column raises **42703 `record "new" has no field "updated_by"` on every insert and update**, breaking the service_role pipelines that are those tables' only writers. Verified empirically. Correct order: base-contract column retrofit (`updated_by`) **first**, then the trigger.

**FIXED — table GRANTs now come from the generator.** Neither `iam.apply_rls` nor `platform.create_entity_table` issued a single `GRANT`, so privileges were ad-hoc across the 162 active component tables: 101 `SIUD`, **40 SELECT-only**, **9 with none**, 4 `SU`, 3 `SI`, 3 `SIU`, 1 `SD`, and **`files.file_versions` DELETE-only — unreadable by the very role its `std_select` targets**. GRANTs are the *first* gate: where missing, RLS is never reached. Now owned by `iam.apply_table_grants(schema, table, variant)`, called by `apply_rls` — `entity`/`component`/`system`/`restricted` → `SIUD`, `ledger` → `SELECT` only; `anon` untouched. Openness is decided by RLS, not grants. Safety rail: it **refuses** to grant on a table with RLS off or zero policies → **D184**.

**FIXED — (3) the created_by conveyance hole. Arman's ruling: THE COMPONENT OWNERSHIP LAW.** `created_by` does two different jobs and they only coincide on an **entity** (creator = owner). On a **component** the actor and the owner come apart — the owner is the parent — so the column cannot be an access key. The component `std_insert` parent-editor arm never constrained `created_by` while `std_select` led with `created_by = auth.uid()`, so a parent-editor could stamp another user as creator and hand that user owner-read; **56** component tables carried both halves (`chat.message`, `chat.request`, `chat.tool_call`, all `research.rs_*`, `workflow.*`, `content_ir.kind_*`). The fix is **not** to force `auth.uid()` (that is the entity fix) — it is that `apply_rls(…,'component')` **never emits a `created_by` clause at all**. Nothing is lost: `history.row_versions` already records the real actor. Verified live: **0** component policies reference `created_by`. Canon: db-rules §6d-1.

**OPEN — follow-ups to the ownership law** (safe, non-urgent — the column now grants nothing):
1. **Neutralize the surviving `created_by` values** on component tables with a parent-derived trigger (a component's `created_by` derived from its *parent's*, re-derived on reparent) so any code still reading the column gets a correct, non-spoofable value. **Not** `auth.uid()`.
2. **Then clean up:** drop `created_by` where it carries no domain meaning; where "who acted" is genuinely meaningful (a message sender) rename it to an explicit `sender_id`/`author_role` that never appears in a policy.
3. **Conformance check** that fails any component policy referencing `created_by`, and any active table whose GRANTs don't match its variant. Not yet written — the law is currently enforced only by the generator.
4. **`platform.create_entity_table` should call `iam.apply_table_grants`** so the create path and the repair path agree. Not yet wired.

**OPEN — (1) remainder, and the original prescription is a trap.** 22 component tables have `created_by` but **no `updated_by`** column (15 of them `created_by NOT NULL` with no default, so a client insert fails **23502**). ⚠️ **Do NOT "attach the canonical trigger trio" to them** — `platform._stamp_actor()` assigns `NEW.updated_by` *unconditionally*, so attaching it to a table without that column raises **42703 `record "new" has no field "updated_by"` on every insert and update**, breaking the service_role pipelines that are those tables' only writers. Verified empirically. Note this is now *lower* priority: under the ownership law those component `created_by` columns are slated for removal (follow-up 2), so most of these tables should lose the column rather than gain a stamp.

**OPEN — `rag.kg_sweep_state` fails the base contract** (entity variant, no `created_by`), so it is the 1 table of 290 the v3 backfill could not regenerate.

### D183 — Paid SEO output can still be lost after generation; stream drops do not resume (2026-08-13)

**RLS performance root is resolved.** Before the fix, every `authenticated` read of that table — and of any `security_invoker` view
over it — died at the 8s statement timeout. Live symptom: 10× Postgres
`57014 canceling statement due to statement timeout` on
`seo.v_site_keyword_performance` (HTTP 500), captured on
`/marketing/content-plan/*` while the Keyword Intelligence window was open.
The only caller is `listSitePerformanceForKeyword`
(`features/marketing/seo/keyword/data.ts:613`), and React Query's global
`retry: 1` doubles every failure.

**Root cause — measured, not inferred.** The table's `std_select` policy is
`id IN (SELECT unnest(iam.accessible_entity_ids('seo_search_performance_daily','viewer')))`.
That function (`iam.accessible_entity_ids`, `STABLE SECURITY DEFINER`, returns
`uuid[]`) builds its answer with
`select coalesce(array_agg(t.id),'{}') from <the table> t where <trusted lanes>`
— i.e. it **materializes an array of every accessible row id**. For this table
and a normal org member the trusted lane matches **13,183,309 rows** (verified),
so each read aggregates ~13.2M UUIDs (~200 MB+) before returning a single row.
Just COUNTING that predicate took **44.6 s** (`pg_stat_statements`), against an
8 s timeout. The view itself is innocent: as `postgres` the same query plans at
cost 5.72 with the `site_id` filter pushed into `idx_seo_sperf_site_date`, and
the 2026-08-09 `NOT MATERIALIZED` fix (`migrations/seo_v_site_keyword_performance_site_pushdown.sql`)
is still correct. `security_invoker=true` on the view is what puts the caller's
RLS on the 13.2M-row table.

**This is a CLASS, not one table.** The array-materializing kernel is fine for
ordinary entity tables (hundreds/thousands of rows) and catastrophic for any
high-volume derived/telemetry table registered in `platform.entity_types`.
Audit every registered token whose table is large before assuming this is one
row. Nobody grants per-row permissions on GSC telemetry — this table's access is
structural (site → org), so the per-row-id enumeration lane is the wrong model
for it, not merely slow.

Fixed live by `iam_component_select_structural_parent_rls.sql`: component
SELECT policies now resolve small composition-parent ID sets and filter on
indexed child FKs. The original page-scoped query returns 82 rows in 3.3 ms
under a real member JWT; `link_edge` returns 750 rows in 3.5 ms. Four proven
class members were repaired and the generator prevents regeneration drift.

Remaining durability defects from that incident:
- **A paid SEO keyword-research result was destroyed.** `SeoKeywordResearch`
  (request `4f293980-4f9a-4329-954b-a1d652e1c277`) timed out on its single
  `INSERT INTO content_ir.kind_instance … RETURNING *` (matrx-orm
  `command_timeout` = 10 s). Verified live: **the row did not commit** (zero
  `kind_instance` rows for that title) and the failure path writes only the
  error to `seo.collection_run`, never the artifact — so the agent output is
  gone and re-running re-pays. `content_ir.kind_instance` holds just 82 rows and
  its policies use per-row `iam.has_access`, so the stall was environmental
  (this INSERT landed inside the 05:27–05:41 window of the timeouts above);
  the durable gap is that **a successful, paid agent result has no
  keep-the-work path when the persistence write fails**.
- **A transport drop reads as a hard failure.** `agent-stream-transport`
  `internal_error` / "The connection to the AI response was lost."
  (`lib/api/stream-parser.ts:122-144`) cannot distinguish "socket dropped, the
  server run is still completing and is resumable" from "the backend blew up",
  and nothing dispatches a resume on it — against the repo's own
  `detach_on_disconnect` doctrine.

### D194 (was a second D183) — The page-template system shipped but is INERT in production (2026-08-13)

aidream `services/content_plan/templates.py` (916 lines) resolves a per-node HTML
scaffold from `plan.profile.template_map.templates`, and `cms_reconciler`
realize writes it into the page body. **Verified live: not one `plan.profile`
row has a `templates` key** (all six carry only `archetypes` / `concepts`), and
nothing in either repo seeds one — `BUILTIN_TEMPLATES` (18 templates) is
referenced only by its own definition and `__all__`. So realize still creates
empty page bodies and `cms_fill`'s scaffold branch never fires. The capability
is paid for and switched off, which is the silent-inert class CLAUDE.md's env-var
rule was written about.

Also undocumented: no `FEATURE.md` section, no Change Log entry, no `/templates`
route in the registration map, and **no test file** for `templates.py`.

Fix: seed the library from `BUILTIN_TEMPLATES` via a migration, verify one
realize writes a scaffold (`data-matrx-scaffold` markers present), then document
it. Owner: whoever owns the CMS realize path.

### D179 — Keyword Research workbench: remaining UI debt (2026-08-13, Arman review)

Arman: "there are other UI issues with this page as well" (`/marketing/keyword-research`), beyond the three fixed in the sharing pilot. Wants one full `ui-sharp`/`ui-dense` pass (launcher strip, metrics line under `KeywordInput`, cluster chip, toolbar, table density): screenshot first, enumerate, fix as one change. **Chip fired 2026-08-12.**

### D171 — `content_role` has two writable authorities and 13 live disagreements (2026-08-11)

System-of-record: `common-docs/systems/entity-content-role/FEATURE.md` — read it before changing either role field or its consumers in any repo.

### D170 — A live run whose payload is JSON or an XML wrapper shows an EMPTY window until it finishes (2026-08-11)

The floating-window posture only kills the spinner for markdown payloads. Watched blank for their whole run: podcast blog writer/show notes (`useEpisodeArticles` — structured JSON envelope) and the marketing image prompt generator (`generate-page-image.ts` step 1 — `<image_prompt>` wrapper). Fix belongs in the canonical pipeline, never the call site: content-IR renders un-kinded live JSON progressively, or these agents get a registered kind. Per `docs/handoffs/live-run-streaming-sweep.md`; note its §6 wrongly records podcast articles as plain markdown — the wire is JSON, markdown is assembled client-side (`articleMarkdown.ts`). Whether they get a kind is **Arman's call**.

### D169 (was D167) — Transcript Studio never loads its own `studio_runs` rows, so refresh forgets every pass (2026-08-11)

No `listAgentRuns` in `features/transcript-studio/service/studioService.ts`, nothing dispatches `runsLoaded` — column status is in-memory only and the live-run door (`<WatchRunButton>` via the run row's `conversationId`) dies with the tab. Fix: add `listAgentRuns(sessionId)`, dispatch `runsLoaded` where segments load, reopen for rows still `running`. **Chip fired 2026-08-12.**

### D185 — A CMS link breaks whenever the CMS site belongs to a DIFFERENT user (2026-08-13; **re-diagnosed live 2026-08-15 — the original prescription was wrong**)

⚠️ **DO NOT clear or repoint `settings.cms.site_id`.** The original entry guessed the CMS site was "deleted or never valid" and prescribed clearing it. Both guesses are false, and that fix would have DESTROYED a correct link.

Measured live against the CMS project (`viyklljfdhtidwecakwx`): all **7** `web.site` rows carrying `settings.cms.site_id` point at CMS sites that **exist**, are `is_active=true`, and are correctly named — `60bb572e-…` is "Titanium Marketing", exactly what it should be. `client_sites` RLS is `is_active = true`, so RLS admits it too.

**The real cause is ownership scoping.** `app/api/cms/sites/route.ts:147` scopes `listSites` to `.eq("owner_user_id", user.id)`, and `resolveCmsLink` only searches the list it was handed. The CMS sites that resolve are owned by the signed-in account; Titanium Marketing and PBW Law Website are owned by `4cf62e4e-…`, a different user. So the refusal message ("not a CMS site you can see") is literally ACCURATE, and every fix on that site correctly falls back to desired-metadata only.

**The gap is that `client_sites` has no org or sharing model at all** — just `owner_user_id`. A marketing site owned by an org can therefore point at a CMS site only one person can reach, and nothing surfaces WHY.

✅ **DECIDED — Arman 2026-08-15: "of course they should be ORG scoped and shareable."** CMS sites get `organization_id` + canonical `visibility` + `created_by` like every other entity. ⚠️ The CMS is the one declared SEPARATE database (`viyklljfdhtidwecakwx`), so how org identity crosses the two projects must follow existing precedent — and if none exists, that is an architecture call for Arman, not an invention. **Chip fired 2026-08-15.** Still worth building afterwards: the validating picker, which must validate *reachability*, not existence — a picker that only checked the id exists would have called this link healthy.

### D186 — ~~The CMS-draft leg is unexercised~~ **FALSE — same root cause as D185 (re-measured 2026-08-15)**

The original entry concluded that no crawled page shares a route with any CMS page, that "the CMS sites are skeletons (`/home`, `/about`, `/services/service-1`)", and that the write-back leg is therefore correct-but-idle. **All three are wrong**, and for the same reason D185 was wrong: `listSites` is scoped to `owner_user_id`, so the investigating session (signed in as one account) literally could not see the CMS sites owned by the other, and generalised from the two skeletons it COULD see.

Measured directly against the CMS project: **"PBW Law Website" has 27 real pages** — `/practice-areas/workers-compensation-defense`, `/practice-areas/lien-resolution`, six `/blog/...` posts, four `/offices/...` — with 3 published. Not a skeleton. And its crawled twin `www.pbw-law.com` (`web.site 8cc4ba7b-…`, 440 live pages) **shares real routes with it**: `/contact`, `/services`, and `/practice-areas/workers-compensation-defense` at minimum.

So the CMS-draft leg is **exercisable today** on pbw-law, and the join is not empty. Nothing needs building here; the blocker is the D185 visibility gap. **When D185 is decided, re-run the write-back on `www.pbw-law.com` as the CMS site's owner — that is the real end-to-end test this entry was asking for.** The page-identity idea in the original entry (a measured page naming its CMS twin by id rather than by route string) is still a genuine improvement, but it is an enhancement, not a repair — `client_pages.web_page_id` already exists for exactly that and is worth wiring.

### D164 (remainder) — nothing stops `kind_create` minting a duplicate shape (2026-08-11)

The duplicate itself is **RESOLVED** (see Resolved). What is still open is the class: the two kinds were minted 32ms apart, byte-identical, and nothing objected — found three weeks later by an unrelated tool. **The rule: `kind_create` must REFUSE a slug whose `emitted_fingerprint` already belongs to an ACTIVE `user_authored` kind.** Scope it exactly that way — fingerprint collisions are endemic and legitimate among the ~665 machine-minted `is_contract_artifact` snapshots, which must keep working. Verified live 2026-08-15: with `keyword_set` deactivated there are **0** collisions between active user-authored kinds, so the guard can be enabled today without touching existing data.

✅ **CLOSED 2026-08-15 — guarded at BOTH ends, and the mint-time half alone would NOT have worked.** Writing the filed rule exposed why: both kinds were created **inactive**, so at mint time no live kind held the fingerprint and a `kind_create` check would have passed both. The collision only became real at ACTIVATION. So: (1) **mint-time** — `_duplicate_shape_refusal` in matrx-ai `kind_authoring.py`, called by `kind_create` **and** `kind_update_schema` (without the update leg the guard is bypassed by minting a distinct shape then editing it into a duplicate); (2) **activation-time, the leg that actually closes it** — a third `uniqueness` leg in `content_ir.evaluate_kind_activation` (`migrations/content_ir_activation_refuses_duplicate_shape.sql`, applied + ledgered), the single authority the browser studio, the `kind_activate` tool, and `activate-kinds.ts` all call, so no surface can disagree. The verdict now carries `unique_ok` + `duplicate_of`. **Scope excludes the data-only families by NAME as well as by `is_contract_artifact`** — the flag alone is not load-bearing enough to protect the aidream contract publisher, whose `action_io_*`/`tool_io_*`/`agent_io_*`/`workflow_io_*` snapshots collide by construction and must keep activating. Verified live across all **1145** kinds: **0** active kinds newly fail, the colliding `action_io_*` pairs still pass, and exactly **1** inactive kind is refused — `keyword_set`, naming `keyword_variant_set` as its duplicate.

### D163 — 12 stored `emitted_block_schema` rows are stale against the live emitter (2026-08-11)

Found by `pnpm shape:reemit-discriminator`. 10 rows: `additionalDetails.additionalProperties` stored `false`, emitter now emits `true` — needs a ruling on which is intended before re-emitting. Plus `study_pack_set` (dangling `flashcard_set_beta` stub in `$defs`) and `video_transcript_research` (python-owned `claim_evidence` child unreconstructable — correctly refused). No runtime reader of the column today; drift-guard only.

### D159/D160 — An agent edit can fail to reach production because SOME WRITE PATH never fires cache invalidation (2026-08-11)

Symptoms: (a) aidream `execution_definition.py` → `definition_manager.load_by_id(id)` reads a **process-global** record cache — grounding disabled in the DB, production kept grounding until restart. (b) matrx-ai `_agx_manager_impl.py:52,71` `to_config()` under `CachePolicy.SHORT_TERM` (10 min, staggered per worker) makes migration-applied agent edits FLAP; "verified live" within 10 min of an agent migration can be a false claim (unchanged `input_tokens` = still reading cache, not proof of no-op).

✅ **ROOT CAUSE FIXED 2026-08-14 — the cache was never touched.** The defect was the *reach* of invalidation, in two layers, and the second is the one no writer inventory could have fixed:

1. **Out-of-band writers.** Migrations (`migrations/agent_bind_*.sql`), psql, the Supabase SQL editor, `agx_*` RPCs, and every direct `supabase.from("definition").update(...)` write straight to Postgres. No application-level hook can fire for any of them.
2. **Every other process.** `bust_agent_caches` evicts only the process that runs it, and aidream deploys one image as several (`MATRX_ROLE` = app_server | worker | sandbox). `POST /ai/agents/{id}/invalidate-cache` lands on one app_server; **the workflow worker, which also executes agents, was never invalidated by any writer, ever.**

**The fix signals from where every writer already converges — the database.** aidream `db/migrations/0351_agent_definition_change_notify.sql` installs an AFTER trigger on `agent.definition` / `agent.definition_version` publishing `pg_notify('agent_definition_changed', …)`; `aidream/workers/agent_cache_listener.py` holds one idle LISTEN connection per process (ungated — it only drops its own in-memory entries) and calls the existing `bust_agent_caches` on receipt. **Hot-path cost is zero**: no per-run read, no watermark column, no extra round trip in agent execution. NOTIFY is transactional (delivered at COMMIT, never on rollback), and the listener runs the shared `probe_listener` self-probe so a deaf connection screams instead of silently reinstating this bug. Verified live against prod Postgres with a control arm: same out-of-band `UPDATE`, listener off → cached read stale; listener on → fresh in <1s, no restart, no bypass.

Client-side, `agentSettings/saveAgentSettings` was found to be a **second agent-save path in a different slice**, writing `settings` (where model, reasoning effort, and **grounding** live) directly and never dispatching an `agentDefinition/*` action — so the cache-bust middleware never fired for exactly the field D159 was about. It is now in `WATCHED_ACTION_TYPES`. **Recommendation (Arman's call, not done): fold `saveAgentSettings`'s DB write into `agentDefinition/saveField` and delete the parallel writer.** Two writers of one row is the underlying defect; the middleware entry only makes the miss harmless.

🚨 **ARMAN'S RULING 2026-08-14 — `use_cache=False` ON THE EXECUTION PATH IS FORBIDDEN.** Agent caching is deliberate, hard-won work; definitions are static 99.999% of the time; refetching per run adds ~0.5–1.5s to every chat and loses us the latency race. **Never disable, bypass, shorten, or TTL the agent cache to fix this.** The defect is a WRITER that mutates an agent without firing the invalidation we already built — most obviously the migration-applied edit path (`migrations/agent_bind_*.sql`), which writes straight to Postgres and cannot fire an app-level hook, and possibly an ad-hoc edit route someone added around the sanctioned path. Required work: inventory every writer of `agent.definition`/`definition_version` across all repos, record which fire invalidation and which don't, wire the misses, and design an out-of-band signal for the migration class that costs ZERO per-run round trips. **Chip fired 2026-08-14.**

### D161 — The portable-schema gate SILENTLY EMPTIES map-typed fields; `research.suggest_setup` left unbound (2026-08-11)

`matrx_ai.schema.lint._make_portable` sets `additionalProperties:false` on every object node — a `dict[str,str]` field becomes an object that can legally hold nothing, silently. Fix order: (1) gate REFUSES map-typed objects loudly; (2) change `SuggestSetupOutput.keyword_goals` to a closed `list[{keyword, goal}]` (aidream `analysis.py:717` folds back to dict, HTTP shape unchanged); (3) version the prompt to teach `intent_key`/`intent_reasoning` (17 seeded keys, `research/intents.py:78` screams on unknown); (4) regenerate the kind and bind. Steps 2–3 are product authoring — **decides: Arman**.

### D155 — Google's grounded stream DROPS a span of the answer (2026-08-11)

Confirmed by Google's own forum (https://discuss.ai.google.dev/t/176967) and our raw-SSE capture: with Search grounding, 8–58% of runs lose a span (whole first grounded segment) regardless of schema; without tools, 0/16. There is no final full-text event to reconcile against (tested), repair would silently drop content, retry re-gambles. The fix shape is the two-call split: call 1 grounds and gathers, call 2 structures with NO search tools (0/16 corrupt). User-visible today as `noJson` (empty result in `KindRequestDialog`).

⛔ **HANDS OFF — Arman 2026-08-14: this is already in the works elsewhere. Do not touch it.**

### D154 — React #418 hydration mismatch reported by Arman on marketing site shell; not reproducible (2026-08-11)

Investigated: SSR body has no digit/date text, hydration replay on prod = zero errors, known mismatch sources mount-gated. Pre-hydration capture shipped (`20e226f37`); once deployed, the Error Inspector records route/stack/count — **reopen with that capture attached**, don't guess further.

### D152 — Agent-app auto-create generators omit code fences (2026-08-11)

Four consecutive live runs of `prompt-app-auto-create` returned bare TSX with no ``` fence; `extractCodeFromResponse` rejected all. Loud recovery shipped in `execute-builtin-with-extraction.thunks.ts` (accepts unfenced import/export-default modules, warns). **The warning firing means the generator prompt is wrong** — fix the `prompt-app-auto-create` / `-lightning` system agents to always fence, then watch the warning go quiet.

### D151 — Paid AI results die in component state across education, flashcards, content-plan (2026-08-11)

Structural cause: `run-headless-agent-json.ts:142` delivers only via the returned promise, no AbortSignal — unmount mid-run spends the money and writes into a dead component. Sites and what's lost:

| Site | What is lost |
|---|---|
| `features/flashcards/components/study/StudyDeck.tsx:417` | per-card coaching tip → 8s toast only, fires on EVERY graded card |
| `features/education/memory/components/MemoryAidButton.tsx:59` | `MemoryHintPayload` wiped on card advance; `fc_detail` has the slot |
| `features/education/study/analytics/components/StudyAnalyticsDashboard.tsx:36` | full narrated report, auto-fired per mount — every visit re-pays ~120s |
| `features/education/trust/useVerifyAgainstSource.ts:85` | `suggestedFix` with no apply affordance; same card re-verified forever |
| `features/flashcards/data/useQuizStudy.ts:171` | `question`/`correct`/`explanation` dropped at coercion; every quiz re-pays |
| `features/flashcards/fast-fire/components/FastFireLiveCard.tsx:97` + `StudyDeck.tsx:278` | `HelpLiveResult` cleared on card change, no attempt/journal row |
| `features/podcasts/generator/components/TopicIdeaHelper.tsx:73` | 4 of 5 ideas + all fields of the chosen one except title/hook |
| `features/flashcards/components/set-detail/EnhanceSetDialog.tsx:91` | unsaved previews on refresh — and quota committed at generation |

### D150 — Marketing item surfaces hide stored identities, evidence, and doors (2026-08-11)

No-Dead-Ends audit worklist; fix by extending the canonical item detail, never another partial drawer:

- P0: `components/analysis/FindingDetail.tsx` omits identity/subject/status/score/lifecycle/timestamps.
- P0: `components/pages/SnapshotDetail.tsx` shows fragments + an inert crawl id; add full data + crawl/page doors.
- P0: `components/operations/BatchDetailWorkspace.tsx` item detail = label/subject/metadata only; build one canonical `BatchItemDetail`.
- P0: `components/media/SiteVideosView.tsx` persists AI title/description/keywords/schema but exposes only title + a badge.
- P1: `components/backlinks/ReferringDomainIntelligenceTable.tsx` hides most fields, disables sort/filter on most columns.
- P1: GSC query rows in `search-console/components/{GscDimensionTable,dig/DigResultsTable,watch/WatchlistTab,classification/KeywordClassificationWorkspace}.tsx` don't use the Keyword Intelligence window.
- P1: `components/ranks/RanksWorkspace.tsx` — inert result URLs; forks a weaker SERP renderer instead of `SerpResult`.
- P1: `content-plan/components/NodeAssociations.tsx` — relationships as truncated labels without entity doors.
- P1: inert provider inventories in `components/integrations/MarketingConnectionsWorkspace.tsx`; Bing accounts as shortened UUIDs in `bing/BingConnectionsWorkspace.tsx`.
- P1: `components/access/SiteAccessWorkspace.tsx` shows grantee UUIDs despite loading names/emails; reuse `UserIdentity`.
- P1: missing doors/inventories in `components/{structure/StructureWorkspace,pages/cards/PageLinksCard,inspection/LinksInspectionTable,pages/PagePickerDialog,pages/DismissedPagesTable,sitemaps/SitemapsWorkspace}.tsx`.
- P1: hidden/inert data in `components/{discovery/DiscoveryInbox,sites/SitePeekWindow,brands/BrandWorkspace,media/SiteVideosView}.tsx`.
- P2: silent slices in `discovery/youtube/YouTubeVideoPreview.tsx`, `components/analysis/CatalogueAnalysisPanel.tsx`, `components/inspection/link-plan/SiteLinkComplianceView.tsx`, `components/inspection/link-graph/ExternalLinksView.tsx`.

### D153 (was second D150) — Marketing has no per-site or per-client cost attribution (2026-08-11)

After D149's retirement nothing answers "what has this site/client cost me". The data exists (`runtime.global_execution` rows linked `web_crawl_session`; `batch.cost_event`), but attributing to site/brand/client and deciding what counts as "marketing cost" is a **product decision (Arman)**. `/marketing/cost` shows org-level provider spend only.

### D147 — the documented full-repo lint gate is baseline-red with 2,475 errors (2026-08-09)

`pnpm lint` on `main`: 2,475 errors + 2,811 warnings, so the full-repo command can't distinguish a regression from debt (changed-file before/after still works). Establish a ratcheted baseline or clear the errors; no blanket disables.

### D146 — 58 RLS policies call `iam.has_org_access(...)` per row (2026-08-09)

SECURITY DEFINER helper can't inline → per-row invocation can exceed the 8s timeout at scale. Proven fix shape: `organization_id IN (SELECT iam.my_orgs())` (took `seo.search_performance_daily` from ~16.5s to 200ms, equivalent visibility). `pnpm check:access-drift` area; needs an equivalence-verified sweep over the 58.

**Resolver half fixed 2026-08-15** — `migrations/iam_access_kernel_plpgsql_plan_cache_d146_followup.sql`. Two causes found, **neither of them the access model**, and no policy was touched: (1) planner statistics **never collected** on most kernel tables (`platform.entity_types`, `entity_relationships`, `iam.permissions`, `system_orgs`, `membership_grant`, `admin.admins`, `files.*`, `web.*` all had `last_analyze` AND `last_autoanalyze` NULL) mis-planned `_edu_can_read_via_assignment` onto the wrong association index — **66% of all buffer traffic in every `iam.has_access` call, platform-wide**; (2) a `LANGUAGE sql` function nested inside a `LANGUAGE sql` body re-acquires its callee's plan on every call — same body as plpgsql, 1,678 ms → 187 ms. Twelve hot kernel functions converted to plpgsql with expressions copied verbatim. Proven equivalent over 31,464 verdict probes (308 entity tokens × 3 levels × 12 identities) and 62,436 admitted rows, element-wise, zero differences in both directions; `check:access-matrix` 42/42.

The same never-analyzed-statistics defect was then found live on **69 more tables** across platform/iam/files/web/admin (452 MB; `web.link_edge` 681,628 rows, `web.crawl_url` 368,993 rows; 34 of them never row-counted at all, so the planner was guessing outright). Caught up, with a repeatable block in the same migration. It did **not** move the `files.pages` numbers — those tables are not on its path — but it is the same class, live across the crawl/web/files surfaces.

**STILL OPEN on `files.pages`:** unfiltered `select count(*)` went 13.2 s → 8.25–8.58 s for an identity admitted few rows, i.e. **still over the 8 s cap** (it passes at 6.7–7.5 s for the grant reader and one super-admin; filtered reads, which every real surface uses, are ~100 ms). What remains is intrinsic — ~15,600 kernel invocations for 6,567 rows, ~2.6 s of it plpgsql's un-cacheable dynamic SQL. **Two closing moves need Arman's call, not an agent's** — both written up cold in **`docs/handoffs/access-kernel-scan-performance.md`**, which also carries the measurements that kill four tempting rewrites and the 31,464-probe equivalence bar. The set-wise twin is **not** an option — already tried, measured and reverted in the parent migration.

**Not a lead:** `idx_assoc_target_live`'s lifetime counters (880 M tuples / 191 rows per scan) look like a second mis-planned index and are not — they are cumulative-since-reset and dominated by the bad plan above. Live 180 s delta after the fix: 29 rows/scan on 36 scans, with `idx_assoc_source_live` carrying the load at 1.60. Take a delta before calling a `pg_stat_user_indexes` ratio a defect.

### D145 — DB kind components written as a bare function don't compile on web (2026-08-09)

`features/agent-apps/utils/compile-slot.ts::compileSlotComponent` only rewrites `export default`; the documented bare `function Card({data})` form silently falls back to the generic viewer. Workflow Studio already recovers the last PascalCase top-level binding — port it. **Chip fired 2026-08-12.**

### D142 — on TOUCH, EntityRef offers only one of its four doors (2026-08-09)

The peek/new-tab cluster is hover-revealed (`components/official/entity-ref/EntityRef.tsx`), so on touch devices every EntityRef degrades to Open-only; the in-flow cluster also permanently reserves ~44px per cell. **Product call (Arman):** (a) `alwaysShowActions` on mobile, (b) long-press, or (c) row `…` menu carries peek on touch (probably right for tables, wrong for prose). Either way `opacity-0` should stop reserving layout.

### D141 (was second D138) — `/marketing/.../audit` dead-ends on a large site: "Audit rollup unavailable" (2026-08-09)

On a 325-page site the audit tab replaces the whole surface with a generic retry error, hiding findings that loaded. Surface the real PostgREST error, page/cap `fetchSiteAuditRows`, keep doors to what loaded. **Chip fired 2026-08-12.**

### D140 — `lib/entity-list` gaps that block adoption (2026-08-09)

(1) No `presentation` prop — `EntityListPage.tsx:120` hardcodes route-header padding, unusable in a `WindowPanel` (CRM already solves this bespoke; small fix once a second consumer needs it, not speculatively). (2) No surfaces-runtime slot — converting CRM would drop its `SurfaceRuntimeProvider` integration. (3) No segmented-control axis (CRM's People/Companies). Also: shell `archived` ≠ CRM `active|trash`. **2 and 3 are Arman's call** (shell grows them vs those surfaces stay bespoke).

### D137 — `/canvas/{id}` has no route: four callsites link there, including email notifications (2026-08-09)

`app/(public)/canvas/` has only `discover/` and `shared/[token]/` — `/canvas` and `/canvas/{id}` 404. Callers: `ShareModalWindow.tsx:57,65`, `CanvasPeek.tsx:51`, `lib/email/notificationService.ts:229` (mailed to users). **Decide the canonical canvas record route** (Arman), then build the page or repoint all four. `canvas_item` deliberately has no `hrefFor` until then.

### D135 — RESOLVED 2026-08-14: soft delete now TOMBSTONES association edges and restore revives them

Per Arman's ruling, `platform._gc_entity_associations` tombstones (`deleted_at` + `deleted_via_*` stamp) instead of purging, restore un-tombstones exactly what that entity's trashing removed, and only a hard DELETE purges; conveyance is cut at `platform.containment_edges` and every reader reads `platform.associations_live`. Contract + live proof: `common-docs/systems/access-architecture/FEATURE.md` §2.4c. Edges destroyed before this migration are unrecoverable.

### D132 (remainder) — session-identity drift under long-lived tabs (2026-08-08 incident)

`AuthSessionWatcher` hard-stop shipped. Open: (a) preserve unsaved in-memory edits across the forced reload (local draft snapshot before blocking)? (b) escalate N consecutive autosave failures to a blocking editor banner; (c) convention: test-account logins use isolated profiles/incognito — document in the OAuth-verification plan.

### D131 — component tables still outside the COMPONENT-ACCESS membrane + two stale entity_types rows (2026-08-08)

`is_component` tables with bespoke policy families (extra lanes the component variant would drop) each need their own `db-canonicalize-table` pass: `files.analysis/entities/overrides/page_annotations/pages`, `docproc.processed_document_pages`, `transcripts.studio_documents/studio_recording_segments/studio_session_settings`, `workbench.udt_dataset_fields/udt_dataset_rows/udt_structured_list_items`, `pdf.redaction_mapping`, `workflow.node_data_slot`, `legal.wc_impairment_definition`, `runtime.global_execution*/work_item`. Also: `platform.entity_types` rows `component_group`/`field_component` point at dead tables; `agent.card` is a VIEW flagged `is_component` (misleading, harmless).

### D130 (remainder, aidream) — server held a stream socket open past terminal + 409 on conversation-start reservation (2026-08-06)

Client side fixed (terminal-settlement guard in `process-stream.ts`, screams via `agent-stream-terminal-guard`). Open: why aidream held the response open post-terminal, and the 409 on the stream reservation.

### D128 — MCP user connections dead since the vault cutover; connect flow unverified E2E (2026-08-06)

All 4 `tool.mcp_user_conn` rows `expired` with null `credential_item_id`; zero `source_kind='mcp_discovered'` tool rows ever — MCP connections have likely never worked in prod (legacy encryption GUC never configured). Fix: one full connect → discover → invoke loop against a real remote MCP server (aidream `/api/mcp-connections/*`), then fix what breaks. Also: OAuth-popup logic hand-copied ×3 (`IntegrationsSettingsPage.tsx`, `AgentToolsManager.tsx` ×2) — consolidate when touched. Twin entry in aidream.

### D127 (remainder) — decide the fate of `(popup)` (2026-08-06)

Docs fixed 2026-08-12 (FEATURE.md rewritten as an index card; CLAUDE.md row corrected). Open: `(popup)`/`popup-window` is an unused BroadcastChannel demo — **decide (Arman):** make it the branded OAuth-return page (`docs/handoffs/google-oauth-product-build.md`) or delete it.

### D126 — RESOLVED 2026-08-14: hand-rolled copies of the headless "launch agent → poll → extract JSON" loop (2026-08-04)

The original 22 (`features/education/**` ×13, `features/flashcards/**` ×5, `useKindRequest.ts`, `content-plan/setup/ai.ts`) all converted to `runHeadlessAgentJson` / `useHeadlessAgentJson`. A 23rd copy outside the original list — `useImageStudio.ts`'s `waitForExtraction`, kept alive because its shortcut-trigger + attached-resource launch shape wasn't supported by the primitive — converted 2026-08-14 via the new `adoptHeadlessAgentJson` entry point (adopt an already-executed `requestId`+`conversationId` into the canonical wait/settle/result-resolution/retention machinery). Any future launch shape the primitive can't express gets adopted the same way, never re-polled by hand.

### D125 (remainder) — stale `platform.entity_types` rows silently denying access (2026-08-04)

13 of 18 fixed; drift guard shipped (`entity-registry-drift` in `pnpm check:schema`). Open, all `is_active=true`: `component_group`, `field_component`, `prompt` → tables in graveyard; `agent_user_kv` → table exists nowhere. De-register or repoint — **decides: Arman**. (`profile` row is inactive/harmless; delete when convenient.)

### D124 (remainder) — the external consumer of `lib/scheduler-client/claim.ts` hasn't picked up the claim_protocol fix (2026-08-04)

`claimTask` now stamps `metadata.claim_protocol=2` (lockstep with `matrx_scheduler/queries.py::CLAIM_PROTOCOL`), but it has no in-repo caller — the host that was failing is external; identify it and confirm its claims land.

### D123 — legacy `p_table_name` RPCs: CONFIRMED anonymous RLS bypass (contained 2026-08-04)

`public.dynamic_search` (SECURITY DEFINER, anon-EXECUTE) returned arbitrary `public` rows with only the publishable key — confirmed live. Contained: `REVOKE EXECUTE FROM anon, PUBLIC` on all 33 `p_table_name` functions + `FROM authenticated` on the 5 ungated definer ones; verified 42501. These functions are also the largest remaining D158 cluster: their bare relation argument feeds `to_regclass`/dynamic SQL, so a duplicate or schema move can select the wrong relation or miss silently. Open: (1) **audit for prior abuse** — nobody has checked; (2) **drop the whole family** (containment is a grant change; brief 8 of `docs/upgrades/type-debt/2026-07-01-fleet-briefs.md` already decided the tear-out; do not create a second canonicalized version); (3) the `relation "ai_model" does not exist` caller (~5,400 failed round-trips/day, every ~16s) is STILL unidentified and holds service_role or a direct connection — not this repo, not aidream; (4) watch for `42501 permission denied for function` regressions from the revokes. **Decides: Arman** (abuse audit + drop schedule).

### D122 (residuals) — partition exhaustion class guards (2026-08-04)

The 4-day platform freeze is fixed, and the runway guard shipped 2026-08-15 (`pnpm check:partition-runway`, advisory in both gate lists — catches exhausted runway, a catch-all partition that has started taking rows, and stalled/failed pg_cron). Open: (1) `public.agent_run`/`agent_run_stage` stale empty duplicates of `chat.*` — graveyard them (**chip fired 2026-08-12**); (2) a write-rate watchdog — four days of zero writes to 121 tables produced no alert (**decides: Arman**, ops scope).

### D121 — website-factory audit: 12 content-plan/CMS defects on a dispatch board (2026-07-30)

Board: [docs/handoffs/website-factory-bug-dispatch.md](docs/handoffs/website-factory-bug-dispatch.md) (WF-1…WF-12); vision gaps in `website-factory-vision.md`. Close when the board is empty. **Arman assigns; WF-1/2/3 are HIGH.**

### D119 — RESOLVED 2026-08-14: the EDIT/FULL boundary is now enforced on columns, not just statements

**The share levels are view / edit / FULL** — canonical statement, in Arman's words:
`common-docs/systems/access-architecture/SHARE_LEVELS.md`. **Read it before touching anything about
what an editor may do.** It also carries the naming warning: the level the enum spells `admin` is a
personal delegation on ONE item and is NOT the org-admin role — that collision is what made agents
re-ask these questions for months.

**The bug.** The tier applies on two axes; only the statement axis was built (`std_delete` at full).
The column axis was never designed, so every access-deciding column sat inside the editor-writable
set. Proven live with a real edit grant: the sharee could **take ownership** (`created_by := self`),
**re-home the row into their own org**, and **trash it** — and those chain, since taking ownership
makes `std_delete`'s owner arm true, so the follow-up hard DELETE succeeded.

**The fix.** A generated BEFORE UPDATE trigger emitted by `iam.apply_rls`
(`iam._guard_governance_columns`), live on 139 whole-item tables, per-item-type set on
`platform.entity_types.governed_columns` (default `{created_by, organization_id, deleted_at}`).
Never hand-write a per-table guard — add the column to that set. Migrations
`iam_governance_column_tier.sql` + `iam_governance_columns_align_to_share_levels.sql`. Guard:
`pnpm check:governance-tier` (18/18 through real requests with real user logins).

**Two corrections to my first pass, both from misreading the levels — do not reintroduce either:**
- **Publishing is EDIT-level.** I wrongly made `visibility` owner-only. Creating something does not
  make you the only person qualified to publish it; in real companies the publisher is the approver
  at the end of the line. Removed from the governed set.
- **Edit has NEVER meant delete.** I wrongly left `deleted_at` open to editors and even recommended
  keeping it that way. The platform already said otherwise — `entity_soft_delete` requires full,
  `entity_undelete` requires edit — and the raw column write was simply a second door with no lock.
  Now governed, asymmetrically: trashing needs full, restoring stays edit-level.

**OPEN — parts vs whole things, with both of its complete forms written down.** A piece of a bigger
thing (a page inside a website; ~162 tables) can still be permanently deleted at edit level, while a
whole thing needs full. Left alone deliberately. Per
`common-docs/policies/decisions-must-be-complete.md`, the question is NOT which direction: if pieces
stay deletable at edit level we owe a **notification to the parent's owner** so wrong deletions get
caught; if not, we owe a **"Request deletion" path** to whoever can decide. Either is correct.
Neither is correct alone.

**ALSO REQUIRED, NOT BUILT — request-deletion.** An editor refused a delete gets a good error
message and nothing else. The complete version routes the ask to whoever can decide, same shape as
the existing access-request lane. Specified in `SHARE_LEVELS.md`.

### D118 — conveying `working_document → conversation` edges let an editor-sharee re-share and amplify access (2026-07-29)

Editor-sharee B attaches owner A's doc to B's conversation and shares it → conveys up to EDITOR to third parties, invisible to A. Options: drop `conveys_max` to `viewer` for this pair, or require doc-OWNER for new conveying edges in `assoc_add`. **Decides: Arman** (access-architecture policy).

### D118b — invisible inbox injections may seed a phantom user bubble in-session (2026-07-29)

Server announces the persisted invisible steering row via `record_reserved cx_message`; `process-stream`'s `reserveMessage` fallback seeds it with no visibility flag → possible phantom bubble until reload. Fix: carry visibility on reservation metadata (server) or skip the reservation for announced invisible positions. Low frequency — no product UI sends these yet.

### D110 — stray Cloudflare Workers build is red on frontend releases (2026-07-27)

`Workers Builds: ai-matrx-admin` fails while Vercel is green; no Cloudflare config exists in the repo. **Decides: Arman** — retire the integration or configure it.


### D105b — file surfaces must separate MY files from ORG files (Arman ruling 2026-07-28)

`internal` default is correct and stays. The real defect: file lists don't separate yours vs the org's (Mine / My Orgs scope pattern). **Needs an architecture discussion with Arman before building.**

### D103 — legal vertical landings predate `ModuleLanding` (2026-07-26)

`LegalLanding.tsx` + `CaWcLanding.tsx` hand-duplicate `ModuleLanding`, unregistered, no nudges; `PdRatingsCalculatorLanding.tsx` has zero importers. Migrate + register via the `module-landing-pages` skill; delete the orphan. **Chip fired 2026-08-12.**

### D101 (remainder) — `agx_get_list` has no org scope (2026-07-25)

Org-teammate agents invisible in `agx_get_list` — belongs with retiring `/agents/all` onto `agx_list_scoped` once `/agents/browse` is ratified. (Soft-delete predicates on the definer readers fixed 2026-08-12; `agx_get_access_level`/`agx_duplicate_agent` deliberately still see deleted rows for restore paths.)

### D100 — three registered catalog entity types are ACL-invisible (2026-07-24)

`public.analysis_recipes`, `runtime.global_origin`, `scraper.sites`: no ownership/visibility columns, no `default_visibility` → `iam.has_access_for_base()` denies everyone. Latent. **Product call:** declare `default_visibility` or add ownership columns.

### D96 — aidream writes Univer document snapshots with no page geometry (2026-07-23)

`origin='agent'` rows carry `documentStyle: {}`; FE recovers loudly. Fix in aidream: stamp A4 geometry (mirror `features/data-tables/document-page-style.ts`) + backfill. **Chip fired 2026-08-12.**

### D92 — 38 dead RLS policies: policy exists, `authenticated` lacks the privilege (2026-07-23)

`pnpm check:access-drift` has the live list (`scraper.*`, `runtime.*`, `history.row_versions`, `seo.*`, `platform.*`, `iam.memberships`/`invitations`). Per cluster: decide audience, then GRANT or delete the dead policy.

### D93 — `rag.kg_chunks` reads statement-timeout for non-entitled users (2026-07-23)

Per-row SECURITY DEFINER policy functions over thousands of rows → denial-by-timeout. Hoist constant predicates to an initplan-friendly shape; optimize only against measured plans.


### D88 — service-role RPCs accept raw p_user_id with no internal actor guard (2026-07-23)

`public.get_mcp_credentials` (returns decrypted tokens) + `public.get_user_form_context` — safe only via grant, one re-grant from a spoof hole. Add an internal guard (`auth.uid()` null/service or equal `p_user_id`); `get_mcp_credentials` dies with vault Phase 4.

### D85 — CROSS-REPO (aidream): concurrent child agents share ONE emitter turn-text accumulator (2026-07-23)

Symptom fixed (podcast image agents isolated); root cause latent — every concurrent fan-out shares `_turn_text_acc`. Durable fix: per-child emitter isolation in `fork_for_child_agent`. **Owner: aidream.**

### D84 — live Supabase security-advisor baseline contains unrelated errors (2026-07-22)

Pre-existing `security_definer_view` errors + RLS-disabled exposed tables (`public.full_spectrum_positions`, `files.structure`, `workflow.worker_heartbeat`). Owner-by-owner audit before the advisor can be a clean gate.

### D81 (remainder) — two inline mic level-meter copies left (2026-07-22)

Canonical: `features/audio/streamLevelMeter.ts`. Remaining: `useSimpleRecorder.ts`, `voice-agent/audio/audioCapture.ts` — analyser lifecycle entangled with recording teardown; port one per change, verify the meter moves.

### D80 — stale agent records report full `_loadedFields` with EMPTY `variableDefinitions` (2026-07-22)

Rehydrated records short-circuit the refetch via `isReady`; model settings/slots/variable panel render stale (execution is correct — runtime variables pass through). Fix candidates: rehydrated ≠ ready; `updatedAt`-stamped `_loadedFields`; or always `fetchAgentExecutionFull` on launch. **Decides: Arman** (persistence strategy).

### D79 — CRITICAL: direct project FKs make feature rows project-dependent; research decoupling in flight (2026-07-21)

FE cutover done; Phase-0 migration live. Remaining: aidream Phase-3 cutover + deploy, Phase-4 column drop, release guard, acceptance matrix. System of record: `common-docs/projects/research-project-decoupling/FEATURE.md`. (Transcripts' own project FK dropped 2026-08-08.)

### D78 — CRITICAL: legacy `platform._mirror_fk_to_assoc` triggers remain live (2026-07-21)

26 remain platform-wide (re-verified 2026-08-06; transcripts' two dropped 2026-08-08 → expected 24). FE alarm layer shipped (`errorTierRules.ts` pins any firing as permanent critical). Remaining: the aidream release guard + live verification of the induced-failure inspector flow.

### D74 — `web.link_edge.http_status` is NEVER populated: no broken-link detection exists (2026-07-20)

All 10,676 rows null; FE is ready. Fix lives in the scraper (post-crawl link-check pass). Relay prompt handed to Arman 2026-07-20.

### D73 — folder picking needs a canonical story (2026-07-20)

`FolderPicker`/`SaveAsDialog` still on the old `PickerShell` dialog. Decide: extend `FilesResourcePicker` with folder-select mode or keep a dedicated surface, then retire `PickerShell`.

### D114 — ROTATE exposed provider keys + prune NEXT_PUBLIC secret env vars. **Arman action** (2026-07-28)

Past bundles shipped `NEXT_PUBLIC_CARTESIA_API_KEY` and `NEXT_PUBLIC_OPENAI_API_KEY` — rotate both at the provider; set Cartesia as server-only `CARTESIA_API_KEY`. Prune the ~20 unreferenced `NEXT_PUBLIC_*` secret vars in `.env.local`/Vercel (rename server-side ones, delete dead ones).

### D82b — CROSS-REPO (aidream): education/flashcard podcast runs publish "Untitled Episode" (2026-07-22)

(1) Derive a title when the agent omits one; never persist `title=''`. (2) Deck overviews publish to the public show with `max_images: 0` — cover them or keep them out (**decides: Arman**). **Owner: aidream.**

### D83 — `pc_episodes.duration_seconds` null on 44 of 48 episodes (2026-07-22)

aidream never writes it; lists/RSS can't show runtimes. Fix at publish time in aidream; backfill needs per-file probing.

### D67 (remainder) — doctrine says "banned", ESLint says `warn` (2026-07-18)

Browser dialogs DONE 2026-08-12; banned lucide brand icons DONE 2026-08-15 (zero violations verified, promoted to `error` — they 500 the page, so `warn` was wrong for a crash). **Remaining: barrel files only** (488 warnings). `warn` is arguably correct there — CLAUDE.md's rule is "no NEW ones, replace opportunistically" — so this closes by either finishing the cleanup and promoting, or stating in the doc that barrels are a deliberate warn-level ratchet.

### D60 — chat draft transfer never lands for VARIABLE-INPUT agents (2026-07-17)

Plain-agent path fixed. With launch variables (repro: agent `a2525cd3`) the stash is consumed but the smart-input stays empty — suspect variable-bearing input binds text differently or the instance is recreated on hydration. Also: `setUserInputText`'s `if (!entry) return;` is a silent drop — should scream.

### D59 — CRITICAL: follow-up turns must CONFIRM identity-context changes with the user (2026-07-15)

Context (org/project/task/scopes/agent identity) must not silently drift between turns; today it's console warn + BE stream warning only. Required: FE compares previous vs current and prompts. **Owner: Arman** (confirm UX). Twin in aidream.

### D58 (remainder) — Stripe Connect shipped; Arman dashboard actions remain (2026-07-15)

**Blocked on Arman:** enable Stripe Connect on the platform account; set `STRIPE_WEBHOOK_SECRET` + register `/api/stripe/webhook`; then one test-mode purchase E2E.

### D57 — COPPA gate: only the LEGAL policy calls remain (2026-07-15)

Code layers done. **Open (Arman/legal):** hard-block vs allow-audited `under_13→adult` self-declared transition; verifiable-consent method per COPPA §312.5. See `COPPA_VERIFIABLE_CONSENT_RUNBOOK.md` §1.

### D53 — `files.matrxserver.com` CORS blocks local browser uploads; fix published, deploy pending (2026-07-14)

`matrx-files==0.1.10` fixes it; remaining: deploy to the EC2 service (AWS SSO was expired).

### D51 — vision-variant path collision fixed in aidream; pending prod release (2026-07-14)

Fixed in aidream `8d9513e8a`, verified on dev; ships with the next aidream release.

### D35 — `platform.association_types` PK forbids what the pair+label index exists to allow (2026-07-09)

**Decides: Arman.** Latent (0 labeled rows). (A) per-label rules wanted → surrogate uuid PK (needs aidream ORM regen); (B) not wanted → drop the 3-col index + label field + amend the reachability doc. Never `label NOT NULL DEFAULT ''`.

---

## Pending Arman review

None outstanding.

---

## Rejected

_One line each: `- D## — <short reason> — <date> — delete when: <condition>`_

---

## RESOLVED

- **D201 — Guided setup first-run persistence fixed (2026-08-15):** owner-keyed live INSERT policy plus honest create/load reporting and regression coverage — `lib/guided-setup/service.ts`.
- **D180 — Root-document hydration mismatch on every Marketing route (2026-08-15):** `ChunkRecoveryBootScript` and `SyncBootScript` rendered raw `<script>` children; both now use tracked `next/script` `beforeInteractive` entries.
- **D198 — Hands-free VAD voice chat revived (2026-08-15):** one live hook and reachable `/voice/playground` surface now use shared mic/VAD, canonical STT/agent/TTS, barge-in, auto-sleep, background pause, and brokered Cartesia credentials — see `hooks/tts/useVoiceChat.ts` and `features/audio/voice/HandsFreeVoiceChat.tsx`.

One line per fix — title, date, pointer. History lives in git. Entries older than ~2 weeks get deleted.

- **D193 (tabs)** — `TabsContent` unmounts inactive panels again; the hardcoded `forceMount` (added incidentally in an unrelated 2025-02-26 bulk commit, live for 18 months) is gone and force-mounting is opt-in per panel. Hidden tabs no longer run effects, fire fetches, open subscriptions, or register providers. Verified in-browser: on `/administration/agents/agent-apps/executions` the inactive panel now holds **0** children (it was a fully-live second table registering a competing `SurfaceRuntimeProvider` — the D194 trigger), on `/administration/database/enums` two of three heavy admin tables no longer mount, and switching tabs still mounts and renders correctly. Audited for state-loss before flipping: the 5 stream/Monaco panels all render from props; **zero** uncontrolled (`defaultValue`) inputs exist inside any panel repo-wide; and every live split-across-tabs form lifts its state above `<Tabs>` (checked the clearest case, `AgentAppSettingsContent`, plus the config/catalog/shape editors). The one component holding per-tab draft state, `tabbed-builder/TaskTab`, is inside `MainPromptBuilder`, which **nothing mounts** — unfinished scaffolding, left alone, and whoever finishes it lifts the state rather than reaching for `forceMount`. 2026-08-15.
- **D189** — Strict Validation is reachable at last: the toggle moved into `TableConfigModal`'s Table Settings tab (the modal the gear actually opens), saving through `setValidationMode()`; the never-mounted `TableSettingsModal` is DELETED. Authenticated Access was deliberately not ported — `udt_datasets` has no `authenticated_read` column and `update_user_table_metadata` ignores `p_authenticated_read`, so that switch could never save anything. Browser-verified on `/data/…`: toggle on → toast → survives a hard reload as ON, and with strict armed the DB refuses both a missing required field and a non-numeric value (`udt_validate_row` P0001) (`aa49f1190`). 2026-08-15.
- **D191** — the orphan-trigger retirement's kept-set assertion now names BOTH deliberate keeps (`platform.dead_relation_write()` + `workflow.plan_touch_row()`); `retire_orphan_updated_at_trigger_helpers.sql` applied live and the shared applier is unblocked. The assertion did its job — it refused to retire 19 functions while an un-triaged 20th orphan existed, and `workflow.plan_touch_row()` turned out to be matrx-graph's standalone-deployment fallback that must NOT be retired. 2026-08-14.
- **D164 (the duplicate)** — `keyword_set` deactivated via the canonical `content_ir.set_kind_activation` gate (reversible, not deleted) after the investigation proved both kinds identical from birth; `keyword_variant_set` survives — it holds the only real component and the only bound agent, `keyword_set` had zero consumers. Verified live: **0** fingerprint collisions remain between active `user_authored` kinds. Arman's call, 2026-08-15. Mint-time guard → D164 remainder.
- **D187** — platform-wide public-ancestor → internal-descendant cross-tenant read closed in all four IAM kernels (`iam_public_visibility_boundary`); stranger growth loop/stage/view = `0/0/0`, creators and explicit descendant shares preserved. 2026-08-13.
- **D144** — 14 Radix Root wrappers ungated (false SSR-id premise disproven against node_modules; `05d6d53d5`); type-check green. 2026-08-12.
- **D143** — upload-ban lint message points at the real `uploadGuardOpeners` path; internals stay banned (`460ff2dcc`). 2026-08-12.
- **D67 (dialogs)** — last browser dialogs replaced; ban rules promoted to error with proven-zero scan (`460ff2dcc`). 2026-08-12.
- **D134** — `agx_list_scoped` org-grant branch deterministic via ordered subquery (`0441da662`, verified live). 2026-08-12.
- **D117** — `content_ir_kind_instance.is_public_column` → NULL, live + mirror + snapshot, parity green (`0441da662`). 2026-08-12.
- **D101 (soft-delete)** — `deleted_at is null` added to the definer readers (`0441da662`, verified live). 2026-08-12.
- **D127 (docs)** — `features/api-integrations/FEATURE.md` rewritten as an honest index card; CLAUDE.md `(popup)` row corrected. 2026-08-12.
- **D172** — `acceptPageUrlInput` scheme check made case-insensitive to match the scraper's `_normalise_url` (`5bdf85834`). 2026-08-12.
- **D166** — kind-activation guard + `set_kind_activation` genuinely exempt the service role; `activate-kinds.ts --apply` goes through the canonical RPC (`content_ir_activation_service_role_fix.sql`, `4f2804efa`). 2026-08-12.
- **D120** — `chart.tsx` typed against recharts 3.9, `@ts-nocheck` deleted (`409a98d2b`). 2026-08-12.
- **D-harness** — the shared preview server could NEVER start: an 8 GB RSS watchdog on a 256 GB host killed it compiling its first route, every time, so browser verification was impossible fleet-wide. Measured to 58.6 GB, cap → 96 GB, `MATRX_PROFILE=core` pinned (bare default is `full`, the profile production itself cannot build), and `browser-testing.md`'s false "this machine has 16GB" corrected (`81c03829e`). 2026-08-15.
- **D190** — PostgREST's silent 1000-row truncation fixed at the root: `lib/supabase/readAllRows.ts` (verified paging) + 17 call sites; 3 tables already broken (up to 4185 rows), one feeding a DELETE and one inventing 138 false gate findings; advisory `pnpm check:unbounded-reads` (`96e9a3c63`). 2026-08-15.
- **D138** — 24 of 73 sharing-registry route templates 404'd real users: 6 repointed, 19 honestly emptied, sharing surfaces moved onto `entityRegistry` as the single route authority, plus a test that walks `app/**` so a fabricated route can't ship (`d806393c8`). Canvas stays route-less per D137. 2026-08-15.
- **D139** — CRM scope counts 7 requests → 1 via `crm_list_scope_counts`, counts proven identical end-to-end (`crm_list_scope_counts.sql`). 2026-08-15.
- **D136** — escape-hatch ratchet green again: 1,476 unfrozen hatches audited (~80% legitimate idiom), 6 real fixes incl. a stale-closure bug and an unvalidated stream envelope, 2 escalated, baseline re-frozen, gate wired into `run-release-gates.sh` as advisory-but-loud. 2026-08-15.
- **D67 (lucide)** — banned brand icons promoted warn → error at zero violations (`95a1a7822`). 2026-08-15.
- **D167 (class sweep)** — 17 more SECURITY INVOKER functions stopped calling an access denial "not found"; 4 raise sites correctly left alone; a caller matching by message text fixed to match the code (`8cffe1c54`). 2026-08-15.
- **D164** — verdict: identical from birth, proven by `history.row_versions` (both v1 INSERTs already byte-identical, 32ms apart, neither ever renamed); no user-facing surface renders the wrong component. Which slug survives is Arman's (`140b1998a`). 2026-08-15.
- **D108** — the 7 "permanently dead" feedback screenshots were never dead (only the share LINK died; all 7 files live + public, CDN 200): healed in place, and the real defect closed — a revocable `/share/<token>/download` URL no longer classifies as durable in either the DB or `lib/media` twin (`feedback_screenshots_heal_and_share_url_not_durable.sql`, `d630b6f73`). 2026-08-15.
- **D94** — forbidden project FK dropped from `docproc.page_extraction_jobs` (32 rows, zero non-null, no reader) + all FE refs + aidream model regen (`docproc_page_extraction_jobs_drop_project_fk.sql`, `c08ab7047` / aidream `58a3c13f6`). 2026-08-15.
- **D167 (research saves)** — access half fixed by the RLS reorg (proven live: an entitled org member's `rs_topic_append_output` succeeds). The remaining lie is gone too: the RPC no longer asserts "not found" for an access denial — it raises an honest ambiguous message under errcode `P0002` (RLS stays the sole authority; no definer probe added) and `appendTopicOutput` routes it to `<AccessGate token="research_topic"/>`. Also hardened: a zero-row write now raises instead of reporting success on a paid run. `migrations/rs_topic_append_output_honest_access_error.sql`, applied + ledgered. Class sweep of the other 18 invoker functions → chip. 2026-08-14.
- **D181** — component-table `INSERT…RETURNING` 42501 platform-wide: component `std_select` leads with `created_by = (select auth.uid())`; 126 policies repaired (`iam_apply_rls_component_select_owner_arm.sql`). Remainder → D182. 2026-08-13.
- **D173** — shortcut/template project/task scoping moved to `platform.associations` edges; 4 forbidden FK columns dropped; 7 RPCs + view rewritten (`agent_shortcut_scoping_to_associations.sql`). 2026-08-12.
- **D168** — untracked `preview_start` replaced by tracked `pnpm preview:start` + harness hooks (`scripts/agent-harness/`). 2026-08-12.
- **D158** — public-media-URL guard was schema-blind (silently protected nothing on 3 anon-facing columns) — keyed on `(schema_name, table_name)` (`mtx_public_url_guard_schema_aware.sql`); notes healed via `flip_file_to_public` + 20 URL rewrites. Permanent residual: one file_id with no `files.files` row is unhealable; third-party signed URLs in note bodies are data — the column scan will always report hits. Rule kept: flip-then-rewrite (flipping moves the S3 object, killing prior URLs). 2026-08-11.
- **D165** — execution system carries `contextAnchor`/`organizationId` (`run-headless-agent-json.ts:82`). 2026-08-11.
- **D157** — Gemini ignores `const`: rewritten to `enum` at the Google translator boundary (aidream `890b21303`, `rewrite_const_as_enum`), NOT in the canonical emitter (rejected — would bake a Google quirk into every provider's schema). 2026-08-11.
- **D156** — python-owned kinds fieldless to the FE: `emitted_json_schema` carried verbatim on the catalog entry; bindable kinds 32 → 146. Leftovers → D163, D164. 2026-08-11.
- **D162** — both research agents bound to their kinds; `settings.response_format` downgrade dropped (`agent_bind_*_output_kind.sql`). 2026-08-11.
- **D152.2** — auto-create double-fire fixed: module-scoped auto-fire claim + `isAgentPayloadReady` precondition (`095658df9`). 2026-08-11.
- **D149** — retired the dead `web.batch_*` marketing routes/views (never a working feature — zero rows ever linked); `/marketing/cost` survives as provider spend. Follow-on → D153. 2026-08-11.
- **D148** — brokers feature deleted (RPCs deliberately dropped by aidream 0240; graveyard-only tables, zero consumers); type gate green. Detail: `features/agent-context/FEATURE.md` § Removal record. 2026-08-11.
- **D154-capture** — pre-hydration error capture shipped (`20e226f37`); D154 reopens when prod data arrives. 2026-08-11.
- **D133** — "site reads as deleted to non-members": AccessGate resolves the true state; aimatrx.com site moved to the shared org; outsider test account stays memberless by design. 2026-08-11. **Remainder CLOSED 2026-08-15**: the org move is a product action, not a hand-written transaction — `MoveSiteOrganizationCard` is mounted in `SiteSettingsWorkspace.tsx`. The open entry survived four days after its own fix shipped because nothing links a Done bullet back to it; found while auditing docs against code.
- **D115** — in-session tool-viz repaint via `lib/invalidation/invalidation-registry.ts` (zero import edge between stream effects and heavy clusters; guarded by `tool-viz-repaint-invalidation.test.ts`). Known sibling not covered: `features/workflow-emit/emitRendererCache.ts`. 2026-08-09.
- **D116** — both bespoke stream renderers deleted; `adoptForeignStream` closes the pipeline-run gap; `matrx/no-bespoke-stream-renderer` lint shipped. ⚠️ Verification debt: written where `pnpm install` failed — needs type-check + live exercise of `/marketing/keyword-research` (tracked in `docs/handoffs/canonical-stream-and-surface-writeback.md`). 2026-07-29.
- **D124** — `claimTask` stamps `claim_protocol=2`. External-caller remainder → D124 open entry. 2026-08-04.
- **D125** — 13 stale entity_types rows repointed + `entity-registry-drift` guard. Graveyard-4 remainder → D125 open entry. 2026-08-04.
- **D130** — headless image-gen promise always settles on terminal (terminal-settlement guard in `process-stream.ts`). Server remainder → D130 open entry. 2026-08-08.
- **D64** — `ContainerResourceSheet` keyed derived-state refactor. 2026-08-09.
- **D106 / D106b** — BudgetMeter verdict headline; honest "Only you" copy (ShapeOwnerEditor, VaultItemDetail, education FAQ). 2026-08-09. ✅ **The "Only you" COPY is now fixed everywhere it was tracked** — `CanvasShareSheet` and `StructuredListManagerV2` were repaired and their (by-then stale) allowlist entries deleted 2026-08-15. ⚠️ **What remains is the per-domain visibility DIALECTS, not copy** — `features/structured-lists/StructuredListManagerV2.tsx` (`private|authenticated|public`) and `features/user-lists/types.ts` (same values as an `as const`, needs a DB enum migration to retire). Both pinned in `scripts/visibility-vocab/allowlist.json`, which `pnpm check:visibility-vocab` enforces. That allowlist is the LIVE list — delete an entry in the same change that fixes its surface, and the checker now reports any entry that suppresses nothing as `[STALE]`. Unblocked (D105b ruled `internal` stays).
- **D137-seo** — public /seo analyzers work signed-out via `/seo/public/page-audit`. 2026-08-09.
- **D76 / D61** — `errorCaptureStore.emit()` deferred to a microtask (render-safety test pinned). 2026-08-09.
- **D129 (tasks)** — `operatingTaskIds` set; `nowMinute` tick; month-end recurrence anchor (`utils/recurrence.ts`). 2026-08-09.
- **D129 (apple)** — Apple OAuth secret rotated; live `app_config` credential metadata + audited editor. 2026-08-07.
- **D113** — no Cartesia key in the browser: one token primitive + one ws connector; raw-key modules deleted. Rotation = D114. 2026-07-28.
- **D107** — OOM was bad edge lazy imports, not the memory ceiling; `turbopackMemoryLimit` restored. 2026-07-28.
- **D104** — shared `PublicFooter` mounted in `(public)` + root. 2026-07-28.
- **D106.1-3** — research context builder save/load drift fixed. 2026-07-28.
- **D101.2** — agent delete is a soft delete. 2026-07-28.
- **D81 (3/5)** — level-meter core extracted; 3 modules ported. 2026-07-28.
- **D74b** — Cartesia voices list unwraps the paginated envelope. 2026-07-28.
- **D70** — every React Flow surface behind ONE dynamic gate. 2026-07-28.
- **D66** — `app/(dev)/**` back in the type gate; repo green. 2026-07-28.
- **D64/D65** — RATIFIED: "scream loud, never stop the build" — `ignoreBuildErrors` stays; `pnpm type-check` in the advisory gates. 2026-07-28.
- **D112** — canonical list title cells are real links (`MatrxColumnDef.href`). 2026-07-28.
- **D102** — `callApi` surfaces server messages instead of bare "HTTP 422". 2026-07-28.
- **D97** — Univer autosave filtered to mutations; scrolling no longer writes snapshots. 2026-07-28.
- **D99 / D98 / D75 / D73c / D72 / D68 / D69 / D109 / D82 / D71** — assorted one-file fixes, 2026-07-28 (git history has the detail).
