---
status: active
updated: 2026-09-11
repos: [matrx-frontend, aidream]
---

# Pipeline streams + the surface 360 loop

## Vision — Arman's words

- Find the gap that let a hand-rolled keyword-research stream renderer get
  built despite the ban, and close it (done — `adoptForeignStream`).
- Extend surfaces so agents can not only READ a page but MODIFY it — "fully
  360". Unify user-facing and internal into ONE system; policy
  user-controllable from the binding.

## Resources

- Seam + policy machinery: `features/surfaces/runtime/surface-writeback.ts`
  (`applySurfaceWrite`, `listAgentWritableTargets`, `SURFACE_WRITE_TOOL_NAME`).
- Injection: `features/agents/redux/execution-system/utils/build-tool-injection.ts`
  (`buildSurfaceWriteInlineSpec`). Routing:
  `thunks/surface-delegated-tool-call.thunk.ts` → `thunks/dispatch-surface-write.thunk.ts`.
- Doctrine: `features/surfaces/FEATURE.md` §"The 360 loop" + §"Surface client tools".
- aidream server half: `aidream/services/conversation_context/surface_context.py`
  (`_write_targets_block`), `aidream/services/tooling/surface_resolver.py`,
  ORM model `db/managers/ui/ui_surface_write_target.py` (generated, deployed).
- Proving ground: any marketing page workspace
  (`/marketing/brands/<id>/sites/<id>/pages/<id>`), targets declared in
  `features/surfaces/manifests/marketing-page.manifest.ts`, handlers in
  `features/marketing/components/pages/MarketingPageWriteTargets.tsx`.
  Login: `/login` admin@admin.com / <see AI_ADMIN_PASSWORD in .env>; run an agent from the
  header "Agents for this page" popover.

## Avalanche campaign (Arman's directive, 2026-08-08)

Roll agent-writable targets across every surface where agent writes make
sense (judgment bar in the `surface-write-targets` skill — the campaign
recipe). Each agent: one surface (multiple data sets), live-agent verify,
then fire 3-5 self-replicating chips. Chips fired this session:
content-plan-node policy upgrade, notes editor, schedules form, CRM
create-party, marketing-page full coverage (the richest surface — nearly
every input should be agent-drivable; also spawns chips for the other
marketing surfaces). Later: specialized cheap agents per surface replace
Badass Agent for these writes.

## Closure plan — 2026-09-11 (owner: the session that wrote this; subagents per WP, lane named)

Arman's directive: close the write-back system for good — harden it to the
declared-kinds standard, fix every weakness found in the 2026-09 review, keep
docs + skills (Claude AND platform `skill.definition`) current, finish without
him. State at start: 371 targets / 109 manifests / 173 structured
(object|array) targets with NO declared value contract; approval is the inline
`requestApproval` card (2026-08-24), not `confirm()`.

| WP | Lane | Scope | Status |
|---|---|---|---|
| WP1 value contracts | standard/opus | `SurfaceWriteTarget.valueKind` (registered Kind slug — THE contract; no inline schemas, One-Type Law) → drift ratchet (advisory count of structured targets lacking a kind; unknown slug = error) → per-target kind schema in the `apply_surface_write` inline spec where aidream forwards it → `applySurfaceWrite` validates via `validateAgainstKind` BEFORE approval and handler → mirror column `ui.ui_surface_write_target.kind_key` (migration via `pnpm db:apply`, `pnpm db-types`, manifest-sync + SQL emitter) → aidream resolver + `<surface_write_targets>` print `kind=` → adopt on targets an existing Kind already fits → census of the rest | **done 2026-09-11** — seam/spec/mirror/ratchet were already live; this pass adopted `media_chapters` on `matrx-user/podcast-run:episode_chapters` (ratchet 187 → 186) and censused all 186 remaining structured targets below ("WP1 value contracts — adoption pass + census"). Adoption stops at one for three structural reasons recorded there; the follow-up is REGISTERING kinds, which is not this work package. **Mirror WRITE PATH closed 2026-09-12:** the `kind_key` column existed but nothing populated it — `manifest-sync.service.ts` now writes `kind_key` from `valueKind` on insert AND conflict-update, `emit-surface-sync-sql.ts` emits the identical column (twin parity), and the drift comparator compares it (an unsynced contract used to read as "in sync"). Live: `matrx-user/podcast-run:episode_chapters` carries `kind_key=media_chapters` in `ui.ui_surface_write_target`. |
| WP2 trap guard | standard/opus | code guard for the "structured-output mandate + write targets pauses forever" trap: no `apply_surface_write` / surface client-tool injection for a run whose agent carries an output contract; loud info line with remedy; forcing-function test; RUNTIME.md note | **done 2026-09-11** — `features/agents/redux/execution-system/utils/output-contract-guard.ts` (`resolveRunOutputContract`), consumed by `buildToolInjection`; keyed on `agent.definition.output_schema` (Redux when loaded, else the module-cached by-id read — no execution RPC returns that column, so a slice-only guard would have guarded nothing) and on the mandate's declared `output_kind` when the catalogue is warm; one `console.info` per conversation naming the agent, the evidence and the remedy; forcing test `utils/__tests__/structured-output-write-tool-guard.test.tsx` (4 cases, proven red before the guard). Server kill switch `auto_tools_disabled` untouched. NOT done: no run-UI signal — see the note below. |
| WP3 handler guard | standard/opus | `pnpm check:surface-write-handlers`: every declared target has a registered handler (AST over `getWriteHandlers` / `useSurfaceWriteHandlers`), self-test failing-then-passing, advisory in release gates; wire every fixable gap | **done 2026-09-11** — guard wired (`check:surface-write-handlers`, `:list`, `:self-test`) and added to BOTH lanes of `scripts/run-release-gates.sh`, advisory. **436/436 declared targets handled, exit 0.** The guard had never been run: first real run reported 55 unhandled targets on 13 surfaces + 10 unresolved registrations. Root causes, all in the RESOLVER, not the code: a third registration seam (`{ surfaceName, getScope, getWriteHandlers }` descriptor handed to `EntityListPage`) it could not read; handler maps ASSEMBLED BY ASSIGNMENT (`handlers.x = …`, `for (const name of Object.values(TARGETS))`); and key annotations that REPLACED resolution instead of adding to it. Each fix carries a self-test proof demonstrated failing-then-passing (9 proofs total; `pnpm check:surface-write-handlers:self-test`). Ten sites where the surface name arrives as a prop now carry `// surface-write-handlers-surface:` annotations naming their verified mounts, and `EntityListPage` is `pass-through`. **Residue: zero** — no declared target was left unwired, none was deleted, and nothing needed a `cannot be wired` listing. Live forcing check on the real tree: renaming `handlers.scrape_command` and the `panel_task_labels` key made the guard name exactly those two surfaces. |
| WP4 platform skills | standard/opus (aidream) | `scripts/ingest_skills.py` across all repos (platform `skill.definition` reference skills frozen at 2026-07-16); delete merged `surface-registration` stub (dir + row); make ingest part of the existing doctrine sync path, never a new schedule | **done 2026-09-12** — the ingest had never run; the catalog's newest mirror was 2026-08-25. **Ingest hardened first** (`aidream/packages/matrx-ai/matrx_ai/skills/ingest.py`, rules in its `MODULE_README.md`): (a) THE OWNERSHIP GUARD — a row is written only if it carries `config.ingested_from`, so the 143 DB-native `render_block` rows and hand-authored rows are untouchable; `credential-login` is a live `visibility=public` row with an identically named folder in `aidream/.claude/skills/` and the old `skill_id`-only lookup would have overwritten its body and forced it `internal` (it now reports `skipped_foreign`, `updated_at` still 2026-08-21). (b) declared `skill_type` is validated against the enum — `type: Skill` (the document marker on all 45 common-docs skills) cost 29 rows their write until this landed — and a file declaring nothing keeps the row's existing type, so `create-agent` and `build-matrx-workflow` are still `workflow`. (c) `config` is merged, not replaced. (d) prune DEACTIVATES (`is_active=false` + `config.pruned_at`), never deletes, and only inside the scanned repos — unscoped it would have hit ~60 rows the 2026-07-16 `$HOME` sweep dragged in from `~/.claude/plugins`, `~/Downloads` and retired repos. (e) `source_repo`/`ingested_at` provenance; dry-run now reads the live catalog so the plan names every row; counters increment after the write, not before. **Live deltas** over matrx-frontend + aidream + matrx-extend + common-docs (144 parsed): 51 created, 92 updated, 1 `skipped_foreign`, 9 deactivated, 0 errors; two consecutive re-runs wrote nothing (idempotent). `surface-write-targets`, `data-to-kinds` and 49 others now exist and are active; `surface-registration` is `is_active=false` with reason (its directory was already gone); `index` and `FEATURE` — the 2026-07-16 junk rows — are deactivated too. Totals 303 → 354 rows, `render_block` 143/142-active UNCHANGED and zero touched, zero deletions. **Sync path:** `common-docs/meta/scripts/sync_skills.py` — the established distributor — now owns the catalog leg via `--ingest-catalog` / `--ingest-dry-run` (commit `351f5ff7`), and a plain run prints the command it did not run. No schedule created. aidream commit `0a5278495`. **2026-09-11 follow-up — the ~60 `$HOME`-sweep junk mirrors deactivated:** evidence-first pass over `skill.definition` (`reference` type, `is_active=true`, no fresh `ingested_at`) found 55 candidates. 42 deactivated (`is_active=false` + `config.pruned_at`/`pruned_reason`, matching the ingest's own soft-prune convention, never deleted): 32 from `~/.claude/plugins/**` (both the `cache/temp_git_*` tarball and the `marketplaces/understand-anything` plugin — 7 `understand-*` rows plus `understand` itself), 3 from the retired `matrx-claude-plugin`/`matrx-platform` repos, 1 from `~/Downloads`, 1 from a VS Code extension's bundled resources (`java-lsp-tools`), plus `triage-tool-traces` was already deactivated by the fresh ingest itself (its old flat-file path in `aidream/.claude/skills/` is gone now that it lives at `~/.claude/skills/triage-tool-traces/`) — left alone, not re-touched. 13 left ACTIVE as not confidently junk: `credential-login` (untouched per instruction), 5 rows with `config` entirely `null` — no `ingested_from` at all, so never part of this sweep (`cms-authoring`, `content-plan-actions`, `flashcard-generation`, `matrx-db-canonical-data-model`, `pronunciation-authoring`), and 7 live, real, currently-working skills sourced outside the four canonical-ingest repos: `find-skills`/`supabase`/`supabase-postgres-best-practices` (`~/.claude/skills`, user-global, same open question as `triage-tool-traces`), `branch-stash-sync` (`~/.cursor/skills`, user-global), and `docker-best-practices`/`handoff`/`transcription-voice-system` (real files still inside the live `matrx-sandbox`/`matrx-local` repos — just not one of the four the ingest currently scans). Verified after: `render_block` 140 active/1 inactive and `workflow` 4 active UNCHANGED; `reference` went 196 active/11 inactive → 154 active/53 inactive (exactly the 42 deactivated); 3 deactivated rows and 3 fresh live mirrors spot-checked directly in the DB. Open product question, unchanged from WP4: should the ingest's scanned-repo set widen to cover `matrx-sandbox`/`matrx-local`/user-global `~/.claude/skills`, `~/.cursor/skills`? Not decided here. |
| WP5 mirror hygiene | standard/opus | stale-row age in drift report; recency guard on global `deleteStale`; `synced_by`/`synced_from` provenance on the 4 mirror tables; unify `errorResponse` across `app/api/admin/surfaces/*` | **done 2026-09-12** — (a)-(c) as before (see prior entry). (d) recency guard on the GLOBAL sweep: `applyManifestSync({deleteStale:true})` now runs every one of its four delete blocks (values, roles, write targets, client tools) through a new `partitionStaleByRecency` split — a `db_only` row whose `updated_at` is inside `RECENT_ROW_WINDOW_HOURS` is left alone by default and reported on the result's new `skippedRecentRows` (table + surface + name + age), same reasoning as the per-row `deleteMirrorRow` guard (a fresh row is common evidence of a sibling branch's in-flight, unmerged work). New `includeRecent: true` option bypasses the split; threaded into the `sync-manifests` route body — API-only, since no UI control exists yet for it (the existing "Delete stale rows" checkbox is a different knob and stays untouched, per the no-new-UI instruction). Proven failing-then-passing in `features/surfaces/services/__tests__/manifest-sync-recency-sweep.test.ts` against a fixture surface (`zz_fixture/probe`, never a real manifest): a row updated 1 minute ago survives a default sweep while a 48-hour-old row is deleted, and `includeRecent: true` deletes both. (e) the remaining three routes carrying a copied `errorResponse` (`drift-report`, `remediate-mapping`, `delete-mirror-row`) now import the shared one from `app/api/admin/surfaces/error-response.ts` — `delete-mirror-row`'s local copy had been answering `NO_SUCH_MIRROR_ROW_PREFIX` / `STILL_DECLARED_REFUSAL_PREFIX` / `RECENT_ROW_REFUSAL_PREFIX` with a bare 500, so this also fixes those three refusals to read 404/409 as the shared mapping intends. All four `app/api/admin/surfaces/*` routes are now on the one helper. |
| WP6 small fixes | quick/sonnet | drop empty `writeTargets: []` (3 manifests); actorLabel fallback via the shared agent-name cache; FEATURE.md adopter paragraph → counts + exemplars; skill Step 3 matches the ApprovalCard flow | done (2026-09-11, `ad207e01aa`) — items 2-4 shipped as scoped; item 1's premise did not hold: agent-settings/mandates/pdf-extractor manifests all already declare real, non-empty `writeTargets`, and no `writeTargets: []` exists anywhere under `features/surfaces/manifests/` |
| WP7 independent verify | standard/opus ×3 | after WP1–6: live agent run on `/tasks` + a marketing page + admin drift page; adversarial re-verify of each WP's claim | **open — dispatch at 2026-09-12 ~02:21 PDT** (session-limit reset). WP1–6 all closed; this is the ONLY remaining package. Plan, three lanes, live work serialized on the ONE dev server (`pnpm preview:start`, port 3001): **(a) live write loop** — real agent run on `/tasks` (open a task, header Agents popover → Run) and on a marketing page workspace, driving several targets in one message; confirm the inline `ApprovalCard` per target (Apply / Keep as is / Respond), draft targets stage + Save bar, entity targets persist, an undeclared target refuses loudly, an invalid value returns the handler throw verbatim, and a clean reload shows zero new `surface-writeback` captures in the Error Inspector. **(b) admin drift page** — `/administration/ui/surfaces`: drift report renders per-stale-row AGE, a `db_only` row offers Delete this row, the recency refusal + Delete anyway relabel works, and a global sweep now SKIPS in-window rows and reports `skippedRecentRows`. Touch only `zz_fixture_*` rows you create. **(c) adversarial re-verify** — re-run every WP's own claim against live code/DB rather than trusting its report: WP1 (seam validates via `validateAgainstKind` BEFORE approval; spec advertises `kind=`; `kind_key` mirrored — 1 row today), WP2 (`resolveRunOutputContract` really withholds the tool for a structured-output agent; forcing test red-without-guard), WP3 (`check:surface-write-handlers` + `:self-test` green, in both release-gate lanes), WP4 (`skill.definition`: `surface-write-targets` active, `surface-registration` inactive, render_block/workflow untouched, ingest idempotent on re-run), WP5 (provenance stamped on all 4 mirrors, sweep skip proven failing-then-passing), WP6 (approval card names the real agent). — **(a) done 2026-09-12, see "WP7(a) live write loop" below: `/tasks` loop PASS, kind-contract rejection PASS, Error Inspector PASS; two FAILs — the undeclared target produces no visible refusal, and 23 `/marketing/brands/…` manifests (incl. `marketing-page`) no longer match the live slug routes so their write targets are unreachable. (c) done. **(b) done 2026-09-12, see "WP7(b) admin drift page" below: ages + amber in-flight flag PASS, per-row delete PASS, recency refusal + Delete anyway PASS, Error Inspector PASS; the global sweep's skip was NOT run live on purpose — the sweep has no surface scope and would have deleted 255 value rows + 25 write-target rows belonging to other lanes, so it was proven failing-then-passing on the real tree instead — and its reporting half FAILS: `skippedRecentRows` is returned by the service and route but no UI renders it, so a sweep that skips rows tells the admin nothing. WP7 is now CLOSED.** |

Rules for every WP: shared checkout — `git add <own files>` + `git commit -m … -- <own files>`, push `main`, never stash/reset; `pnpm type-check` before done; docs (FEATURE.md change log, this table) in the same commit; live verification only on the ONE dev server (`pnpm preview:start`, port 3001), one lane at a time.

## WP7(a) live write loop — 2026-09-12 (standard/opus lane; browser only, dev server :3001, `admin@admin.com`)

Independent verifier; built none of this. Every line below is what was seen on
screen or read back out of the live DB (`brsgrqvjdzwihsvnfqkf`). Disposable task
`c89cf949-ce69-44cc-b61c-79f2e7728c5c` created and trashed through the UI at the
end (it and both subtasks carry `deleted_at 2026-09-12 19:58:19.985+00`). No
customer record was modified: `web.page 74b765b4…` is still `version=87`,
`updated_at 2026-09-11 21:04:01Z`, both desired meta fields byte-identical to
before this pass. Agent used throughout: **Badass Agent**
(`6cb7be35-719a-43a0-8faf-075cf300d4a7`), PUBLIC row in the page's Agents popover.

| # | Check | Verdict | What was actually seen |
|---|---|---|---|
| 1 | `/tasks` write loop | **PASS** (one caveat, one FAIL sub-item) | See the four sub-rows below. |
| 1a | one ApprovalCard per target | **PASS** | One message ("set the description …, priority to high, due date 2026-09-20, add two subtasks") produced **four** cards in the stream, after `Running 4 tools… / Apply Surface Write / Delegating apply_surface_write to client` ×4: `UPDATE · Task due date`, `UPDATE · Task priority`, `UPDATE · Task description`, `UPDATE · Add subtasks` — each with `PROPOSED VALUE` and `Apply / Keep as is / Respond`. Round 2 produced three the same way. |
| 1b | card names the AGENT, not "An agent" | **PASS, with a caveat** | The name is real — expanding `Details` prints *"Badass Agent proposed this change. Stages a due date into the draft as a date-only string (YYYY-MM-DD)… Approval only stages it in the editor; you still review and save."* — so WP6's actorLabel fix holds. **Caveat:** the card HEADER is only `UPDATE · <target label>`; the agent's name is behind the collapsed `Details` disclosure, so a user approving at a glance never sees who is asking. |
| 1c | Apply → drafts stage + Save bar; entity target persists immediately | **PASS** | Applying the three draft targets toasted `Task due date staged — review and save.` / `Task priority staged — review and save.` / `Task description staged — review and save.` and a blue **Save** button appeared in the task-editor header. Applying `Add subtasks` was different and correct: toast `Add subtasks — done.`, tool result `Ok true / Surface name matrx-user/tasks / Target add_subtasks / Mode entity / Message "Add subtasks" applied and saved.` DB after a full page reload: two rows in `workspace.tasks` with `parent_task_id = c89cf949…` ("Verify approval card", "Verify decline path"). The staged three were correctly **not** persisted until saved (`priority`, `due_date`, `description` all still null/none after the reload). Round 2 then drove the save: the agent offered a further `UPDATE · Save task` card, Apply toasted `Save task — done.`, and `workspace.tasks` read back `priority=high`, `due_date=2026-09-20`, `updated_at 2026-09-12 19:45:05Z`. |
| 1d | decline ONE target via `Keep as is` | **PASS** | Declining `Task description` returned, verbatim in the tool result, `Ok false / Declined true / Message: The user declined the change to "Task description".` — a declined result, not an error. The agent then acknowledged gracefully in prose: *"Description → "WP7a round two check.": you declined it, so the description is unchanged. I did not retry. If the decline was accidental, say the word and I'll re-apply just the description."* `description` is still NULL in the DB. |
| 1e | undeclared target (assignee) refuses clearly, no hang | **FAIL** | Asking "change the assignee on this task to admin@admin.com" produced **no refusal the user can see**. No approval card, no error; the stream showed `Queried the database · Running query` then `Write completed` mid-run, and the finished assistant message rendered **completely empty** — three collapsed `Thought process` blocks and nothing else. It did not hang, and nothing was written (`assignee_id` still NULL), but the user is left with silence where a refusal belongs. Two separate defects are tangled here: (i) `apply_surface_write` never surfaced a named "assignee is not a declared write target" refusal, and the agent fell back to a generic DB tool instead; (ii) the answer-vs-reasoning rendering defect in row 5 swallowed whatever it did say. |
| 2 | marketing page workspace → `page_meta_tags` | **FAIL — the surface does not resolve on the live route** | On `/marketing/brands/52a7eea1…/sites/38eff4c9…/pages/74b765b4…` the app redirects to the real slug route `/marketing/data-destruction/websites/datadestruction-com/pages/74b765b4…`, and the Agents popover there reads **`Marketing Hub` / `matrx-user/marketing`** — not `matrx-user/marketing-page`. The agent said so itself: *"you're on the Marketing hub (/marketing) — the portfolio-level view. No single page is in focus here… The only write target this surface declares is site_editor_draft… The page_meta_tags target belongs to the individual page surface, not the hub."* So none of `marketing-page`'s write targets are reachable by an agent at all. **Root cause:** the manifest declares `urlPattern: "/marketing/brands/[brandId]/sites/[siteId]/pages/[pageId]"` (`features/surfaces/manifests/marketing-page.manifest.ts:984`, mirrored identically in `ui.ui_surface`), but that route shape no longer exists — `app/(core)/marketing/brands/[brandId]/[[...rest]]/page.tsx` is a catch-all redirector and the live workspace is `app/(core)/marketing/[brandId]/websites/[siteId]/pages/[pageId]`. **Class, not instance:** `grep -c 'urlPattern: "/marketing/brands/'` over `features/surfaces/manifests/*.ts` = **23** manifests on the dead shape. Confirmed on a second one live: `/marketing/data-destruction/websites/datadestruction-com` (the site workspace, `matrx-user/marketing-site`) ALSO resolves to `matrx-user/marketing`. Not fixed here — reporting only. |
| 2-fix | marketing page workspace → `page_meta_tags` (RE-RUN after the class fix) | **PASS — 2026-09-12, standard/opus lane** | The row above is closed. Root cause was not the manifest but the RESOLVER: `resolveMarketingSurface` in `features/surfaces/utils/route-to-surface.ts` still branched on `/marketing/brands/[brandId]/sites/[siteId]/…`, the retired tree, so all 23 marketing surfaces were unreachable and every `/marketing/**` path fell through to the hub. Resolver rewritten to the live brand-key tree (`/marketing/[brandId]/{websites,seo}/[siteId]/…` + the sections that moved: `inbox`, `identity/media`, `intelligence/reputation/[siteId]`, and the renames `ranks→rankings`, `value→keywords/value`, `integrations→settings/integrations`); all 23 manifest `urlPattern`s repointed to the same shapes and synced into `ui.ui_surface` (read back live: `matrx-user/marketing-page` = `/marketing/[brandId]/websites/[siteId]/pages/[pageId]`). **Live re-run** on the disposable test brand Factory Playground, `/marketing/370f9281…/websites/98853cae…/pages/01ae0482…` (`/c/factory-playground-matrxtest-invalid/contact`): the Agents popover now reads **`Marketing Page Workspace` / `matrx-user/marketing-page`** with the breadcrumb `Marketing Brand Cockpit › Marketing Site Workspace › Marketing Page Workspace`, and the run window opened with the surface's variables bound (`brand_id`, `site_id`, `brand_name`, … 21 context items). Badass Agent, one message asking for a desired meta title + description → one `BADASS AGENT · UPDATE · Desired meta tags` approval card with the exact `PROPOSED VALUE` JSON and `Apply / Keep as is / Respond` → **Apply** returned `Ok true / Surface name matrx-user/marketing-page / Target page_meta_tags / Mode entity / Message "Desired meta tags" applied and saved.` The page's Search-appearance section then showed `DESIRED META TITLE — Differs from live — 53c · 501px — "Contact Factory Playground - Surface Route Guard Test"` and the matching description, and both survived a full page reload. No customer record touched — the write landed on the disposable Factory Playground test page only. **The guard that should have caught the class now does:** `pnpm check:surface-routes` gained a third direction (manifest `urlPattern` → live app route, FAILING); it listed 25 dead patterns before the fix and 0 after, with `pnpm check:surface-routes:self-test` pinning the detector. |
| 3 | value contract on `matrx-user/podcast-run:episode_chapters` | **PASS** | Reachable after all: `/podcast/studio/run/9e7062c1-5712-424d-9498-aca9c98bd618` (a completed run owned by `admin@admin.com`), popover reads `Podcast Run` / `matrx-user/podcast-run`. Asked the agent to send `{"chapters": ["Intro", "States of matter", "Wrap up"]}` uncorrected. **Zero approval cards rendered** (`PROPOSED VALUE` absent from the DOM), and the agent received the validator verbatim: `(root) must have required property '__kind'` / `/chapters/0 must be object, /chapters/1 must be object, /chapters/2 must be object`. Its own summary: *"Sent exactly as you specified — it was refused before reaching you for approval… Nothing was written; the episode's existing chapter list is untouched."* WP1's before-approval claim holds on the live surface. |
| 4 | Error Inspector, clean reload | **PASS** | Immediately after the valid applies + the one decline, a clean reload of `/tasks` showed `No errors captured yet · 0 distinct · 0 total occurrences`. At the very end of the session the inspector held 25 captures, **all Yellow/SILENT** and all the documented `@ai-matrx/associations` `__not_a_uuid__` door probes (`22P02 rpc · cmt_add` and siblings). Filtering the inspector on `surface` → **"No errors match the filter."** Zero `surface-writeback` captures, at either point. |

**Cross-cutting defect found in three places — answer text rendered as "Thought process".**
On the podcast run the ENTIRE user-facing answer ("Sent exactly as you specified — it was
refused before reaching you for approval. Validator output: …") rendered inside a collapsed
`Thought process` disclosure with no visible prose at all; same on the marketing refusal
(the full "here is why I can't, here is what unblocks it" explanation was hidden); same on the
`/tasks` assignee turn (empty message). On `/tasks` round 2 the stream ALSO printed a literal
`</reasoning>` as content above the tool calls. It is intermittent — the `/tasks` decline
acknowledgement rendered as normal visible prose. The two symptoms look like one
reasoning-boundary parsing bug in the stream pipeline (`pnpm check:thinking-leak` guards the
fence-leak half). A user watching these surfaces sees an agent that answers nothing.

**Environment notes, not findings.** (i) A Turbopack full reload fired mid-run-1 (shared
checkout, another session's edit) and closed the task editor, discarding the staged drafts —
re-driven cleanly in round 2. (ii) `/tasks?task=<id>` is stripped to `/tasks` on load, so the
open-record deep link is not durable; noted in passing, not chased. (iii) Mid-session the
browser profile's `matrx.apiConfig.v1` was on `{"activeServer":"custom","customUrl":"http://localhost:8010"}`,
which turned every agent call into `Failed to fetch` / `ERR_CONNECTION_REFUSED` until reset to
`production`; `apiConfigSlice.ts:475-478` claims to coerce a loopback custom URL back to
production, and it had not — possibly worth a look, but not reproduced here.

## WP7(b) admin drift page — 2026-09-12 (standard/opus lane; browser only, dev server :3001, `admin@admin.com`)

Independent verifier; built none of this. Identity proved, not assumed: the
session JWT decoded in the page reads `admin@admin.com`. Every fixture was a
`zz_fixture_*` row on `ui.ui_surface_write_target / matrx-admin/lookups` that
this pass created and removed; backdating needed `session_replication_role =
replica` inside one transaction because `platform._touch_row` forces
`updated_at = now()` on INSERT as well as UPDATE. **Zero fixtures remain**
(`zz_fixture_%` = 0 across `ui_surface_value`, `ui_surface_agent_role`,
`ui_surface_write_target`, `ui_surface_client_tool`; `ui_surface_write_target`
back at its 461-row baseline).

| # | Check | Verdict | What was actually seen |
|---|---|---|---|
| 1 | stale-row AGE + in-flight flag | **PASS** | The report rendered **281 age spans for 281 `db_only` rows** (255 stale values + 26 stale write targets at that moment) — every one, none missing. Relative in the line, absolute in the tooltip: `13h ago · in-flight window` carries `title="9/11/2026, 11:31:48 PM"`, `1w ago` carries `title="8/30/2026, 7:32:13 AM"`. The in-flight rows are genuinely toned differently — computed color `lab(60.35 40.56 87.12)` (amber-600) vs `rgb(85,85,94)` (muted) on the older ones — and `RECENT_ROW_WINDOW_HOURS` is imported, so the "last 24h" sentence in the section blurb cannot drift from the guard. |
| 2 | per-row delete of a stale row | **PASS** | Backdated fixture (`updated_at` 3d) appeared as `matrx-admin/lookups · zz_fixture_wp7b_probe · 3d ago · Delete this row` under "DB write targets without a code manifest" (26). Click 1 opened the inline confirm naming the row: *"Delete `matrx-admin/lookups · zz_fixture_wp7b_probe` from `ui.ui_surface_write_target`? This deletes **this one row and nothing else** — no other surface, no other row, and no global sweep. It cannot be undone from here; the row comes back only if a manifest declaring it is synced."* Click 2 (`Delete row`) removed it, the report re-ran itself (325 → 324 issues, stale write targets 26 → 25), the row was absent from the re-run, and the DB went 462 → 461 rows. Toast captured verbatim on a repeat of the same flow (5d-old fixture): **`Deleted 1 row — matrx-admin/lookups · zz_fixture_wp7b_toast2.`** |
| 3 | recency refusal + "Delete anyway" | **PASS** | Fresh fixture (`updated_at = now()`) listed as `5s ago · in-flight window`. First `Delete row` press did NOT delete — the confirm block grew a destructive-toned line quoting the row's REAL age: **"matrx-admin/lookups · zz_fixture_wp7b_fresh was written 1 min ago, which usually means that a branch that has not merged yet is still using it. Confirm again to delete it."** — and the button relabelled to **`Delete anyway`**. Second press deleted it (row gone from the report, `zz_fixture_wp7b_fresh` absent from the DB). The age in the refusal is the server's, not a number the client guessed. |
| 4 | global sweep skips in-window rows | **NOT RUN live — deliberately** + **FAIL on the reporting half** | **Not run:** the only lever is the GLOBAL sweep (`applyManifestSync` takes no surface scope), and at the time of the run it would have deleted **255 `ui_surface_value` rows + 25 `ui_surface_write_target` rows** belonging to other lanes — including the `matrx-default/default` and `matrx-default/basic-editor` base rows (`content`, `context`, `selection`, `text_before`, `text_after`, 3mo old) that server-side agents read. Destroying platform state to prove a skip is not a trade an independent verifier should make, and it contradicts "touch only rows you create". (Stale roles and stale client tools were both 0, so no `ui_surface_agent_pref` CASCADE was in play — the blast radius was values + targets only.) **Instead, proven failing-then-passing on the real tree:** `npx jest features/surfaces/services/__tests__/manifest-sync-recency-sweep.test.ts` → 2/2 green; flipping the `includeRecent = false` default (`manifest-sync.service.ts:1509`) to `true` turned it red at the exact assertion (`expect(result.deleted).toEqual([OLD_ROW])` — the 1-minute-old row got deleted) and the file was restored (`git diff` empty). So the mechanism holds. **The FAIL is the reporting half:** `skippedRecentRows` is produced by the service (:1799/:1845/:1903/:1950, returned at :1979) and handed back by the route, but **no UI reads it** — `grep skippedRecentRows features/surfaces/components/` is empty. `ManifestSyncDialog`'s result grid lists ten counters (values/roles/targets/tools upserted+deleted, prefs swept, surfaces skipped, URL patterns, remaining drift) and its toast reports upserted/deleted only. An admin who ticks "Delete stale rows" and gets rows silently left behind is told nothing about which, or why — the service's own comment says it reports them "instead of silently", and the screen does not. Law 4 (nothing fails silently). **FIXED 2026-09-12 (quick/sonnet lane):** `ManifestSyncDialog` now renders a "Recent rows skipped" count in the result grid plus a detail list (table · surface · name · age) matching the existing `skippedMissingSurface` warning card, and fires a `toast.warning` when the array is non-empty. See `features/surfaces/FEATURE.md` Change Log 2026-09-12 entry. |
| 5 | sync-result honesty + Error Inspector | **Inspector PASS; toast PARTIAL** | Inspector: after a full drift-report run, a per-row delete and the automatic re-run, all in ONE unreloaded page session, the Error Inspector read **`No errors captured` · `0 distinct · 0 total occurrences`**. Zero `surface-writeback` captures, zero admin-route captures. Toast honesty: the counts it does print are real sums of the four families, and "Remaining drift" now goes through the shared `countDriftIssues`. Two gaps: it never mentions `skippedRecentRows` (row 4), and `urlPatternsUpdated` counts toward `changeCount` but is absent from the toast sentence, so a sync that ONLY rewrote URL patterns toasts `Sync applied: 0 upserted, 0 deleted` while the result grid shows a non-zero "URL patterns set". **FIXED 2026-09-12 (quick/sonnet lane):** both gaps closed — the toast now appends "N URL pattern(s) updated" when `urlPatternsUpdated.length > 0`, and a separate `toast.warning` fires for non-empty `skippedRecentRows`. See row 4's fix note and `features/surfaces/FEATURE.md`. |

**Findings for the owner.** (i) ~~The global sweep's skip is invisible in the
UI — the one thing WP5 added to the sweep is the one thing an operator cannot
see.~~ **FIXED 2026-09-12** — see row 4's fix note. (ii) There is no scoped
sweep, so the recency skip cannot be exercised live without a platform-wide
deletion; a `surfaceNames` filter on `applyManifestSync` would make this
verifiable and would also give admins a lever matching the dialog's own "READ
THIS LIST BEFORE ACTING" warning. **Still open — not fixed here** (out of
scope for the UI-only fix: adding a scope filter changes the sweep's own
semantics, not just its display). (iii) ~~The sync toast omits URL-pattern
changes.~~ **FIXED 2026-09-12** — see row 5's fix note.

**Environment notes, not findings.** The shared preview server died twice
mid-run and was restarted (`pnpm preview:start`); once another lane's untracked
`components/agent-copy/AlchemySurfaceBridge.tsx` imported
`@ai-matrx/design-system/content-transfer`, a subpath the installed 0.17.4 does
not export, and the Turbopack overlay replaced the whole app until that lane
fixed it. Neither touched the drift tooling.

## WP7(c) adversarial re-verify — 2026-09-12 (standard/opus lane; code + live DB only, no browser)

Every WP's own report was re-run against live code and the live DB
(`brsgrqvjdzwihsvnfqkf`) rather than believed. Three forcing probes temporarily
broke the real tree and were reverted (`git diff` empty for each probed file
after restore). Lane (a) live write loop and (b) admin drift page are NOT
covered here — a browser lane owns them.

| WP | Verdict | Evidence run in this pass |
|---|---|---|
| WP1 | **CONFIRMED** | `SurfaceWriteTarget.valueKind` exists (`features/surfaces/types.ts:282`). In `applySurfaceWrite` the contract binds FIRST: `valueContractHolds()` is awaited at `surface-writeback.ts:472`, before `agentWriteAllowed()` (the approval card, :479) and before `await handler(value)` (:489). Skip-is-never-a-pass is real code, not a comment: `!verdict.checked` returns a `fail(...)` naming the degraded reason. `build-tool-injection.ts:211` appends ` [kind=<slug> {…précis}]` to the target's line and the tool description explains the marker. Ratchet: `pnpm check:surface-drift` → **186** uncontracted structured targets / 198 surfaces / 436 write targets / 4864 values / 6 client tools — and the per-target census tables in this doc contain exactly **186** rows (counted). Hard-error proved live: `valueKind` on `podcast-run:episode_chapters` temporarily set to `zz_bogus_kind_probe` → drift check exited 1 naming the surface, the target, the bogus slug and the remedy; reverted. DB: `ui.ui_surface_write_target` has exactly one `kind_key` row — `matrx-user/podcast-run / episode_chapters / media_chapters`, `synced_from=manifest-sync:api:local`, `updated_at 2026-09-12 06:31:49Z`. Twin parity holds: `manifest-sync.service.ts:255` writes it, `emit-surface-sync-sql.ts:219/223` emits it on INSERT and ON CONFLICT, the comparator reads it back at :381. |
| WP2 | **CONFIRMED** | `buildToolInjection` resolves `resolveRunOutputContract` (:372) and then gates BOTH surface tool paths on it: the surface client-tool loop iterates `outputContract ? [] : liveSurfaceTools` (:387) and `apply_surface_write` is withheld at :415. Forcing proof: `resolveRunOutputContract` temporarily neutered to `return null` → `structured-output-write-tool-guard.test.tsx` went **2 failed / 2 passed** (the two failures are exactly the two withholding cases, "declares an output schema in the slice" and "contract lives only in the database"; the two passers are the intended controls — the no-contract agent still gets the tools, and the no-op surface pays no by-id read). Guard restored → 4/4 green. |
| WP3 | **CONFIRMED** | `pnpm check:surface-write-handlers` → exit 0, "Every declared write target has a resolvable registered handler (**436/436**)", 122 manifests, 159 registrations over 181 files. `:self-test` → 10/10 OK including both planted-failure proofs. Present in BOTH lanes of `scripts/run-release-gates.sh` (lines 206 and 568), advisory. Forcing proof on the real tree: renaming `add_threads` → `add_threads_PROBE` in `features/war-room/components/room/useWarRoomWriteHandlers.ts` made the guard exit 1 and name `matrx-user/war-room → add_threads` (435/436); reverted. |
| WP4 | **CONFIRMED — with one number in this doc corrected** | `skill.definition` live: `surface-write-targets` active, `visibility=internal`, `config.ingested_from=filesystem`, updated 2026-09-12 06:31:05Z; `surface-registration` `is_active=false` with `pruned_at 2026-09-12T06:31:10Z` + `pruned_reason "source file no longer present in the repo"`; `data-to-kinds` active; `credential-login` untouched — `updated_at` still **2026-08-21 09:01:31Z**, no `ingested_from`. `workflow` = 4 active ✓. **`render_block` is 142 active / 1 inactive (143 total), not the "140 active/1 inactive" the WP4 follow-up records** — and zero `render_block` rows were created or updated at any point on or after 2026-09-11, so nothing was touched: the substantive claim (untouched) holds and the recorded count was simply a miscount. Idempotence re-run: `uv run python scripts/ingest_skills.py <4 repos> --dry-run` → 146 parsed, **128 unchanged**, 2 created, 15 updated, 1 `skipped_foreign` (`credential-login`), 0 errors. The 17 planned writes are NOT drift: a `find -newermt` over the four repos' skill files returns 18 SKILL.md files modified after the ingest ran (01:54–08:54 PDT today, other sessions authoring skills), and the planned-write set is a subset of it. No file unchanged since the ingest plans a write. |
| WP5 | **CONFIRMED** | Provenance re-queried live: `ui_surface_value` 4864 of 5109 rows carry both `synced_by` and `synced_from`; `ui_surface_agent_role` 264/264; `ui_surface_write_target` 436/461; `ui_surface_client_tool` 6/6 — the stamped counts equal the manifest counts the drift check reports exactly (4864 / 264 / 436 / 6), i.e. every manifest-synced row is stamped and only `db_only` residue is not. Recency skip is real: `partitionStaleByRecency` (`manifest-sync.service.ts:1471`) is called in all four delete blocks (:1794 values, :1844 roles, :1898 write targets, :1949 client tools), defaults `includeRecent = false` (:1509), and pushes into the result's `skippedRecentRows` (:1979). `features/surfaces/services/__tests__/manifest-sync-recency-sweep.test.ts` — both cases green (a 1-minute-old row survives the default sweep while a 48-hour-old row is deleted; `includeRecent: true` deletes both). All four `app/api/admin/surfaces/*` routes import the shared `errorResponse` from `app/api/admin/surfaces/error-response.ts` (drift-report, delete-mirror-row, sync-manifests, remediate-mapping) — no local copy remains. |
| WP6 | **CONFIRMED** | `dispatch-surface-write.thunk.ts` imports `resolveAgentName` from `features/surfaces/hooks/useAgentNames` (:40) and resolves `actorLabel` as `await resolveAgentName(agentId) ?? selectAgentById(state, agentId)?.name` (:131-133) — the shared module-level `nameCache` first, the slice only as fallback, and `"The agent"` only when both are empty. |

`pnpm type-check`: **4 errors, none in write-back code** — all in `features/secrets/__tests__/` (`csv-import.test.ts` ×3, `organization-context-transport.test.ts` ×1), from another lane's uncommitted vault-CSV work in this shared checkout. Nothing WP1–WP6 touched type-errors.

## WP1 value contracts — adoption pass + census (2026-09-11)

The seam, the inline tool spec, the DB mirror and the drift ratchet all shipped
earlier. This pass did the last two clauses of the WP1 scope: **adopt on targets
an existing Kind already fits**, and **census the rest**.

**Ratchet: 187 → 186** structured (`object`/`array`) targets with no
`valueKind`, across 95 surfaces (`pnpm check:surface-drift`; 198 surfaces, 436
write targets total). Adoption was expected to be the minority and it is — it is
almost nothing, and the census below says exactly why.

### Adopted (1)

| Surface | Target | Kind | Why it genuinely fits |
|---|---|---|---|
| `matrx-user/podcast-run` | `episode_chapters` | `media_chapters` | The saved list already IS a `media_chapters` payload on this page: `EpisodeChaptersPanel` renders it through that kind's registered component, and the `podcast.chapter_marker` mandate emits the kind. The kind's schema (`{__kind, chapters:[{__kind, title, start_hint, summary?}]}`, `additionalProperties:false`) is a strict superset-free match for what `parseChaptersWrite` reads; the handler's extra rules (≤24 chapters, title/summary length caps, `MM:SS` regex) layer on top and are unaffected. The description now states that both `__kind` markers are required by the contract. |

### Why adoption stops at one — the three structural blockers

1. **Every registered kind's root is an OBJECT.** 28 targets take a *bare*
   `string[]` (tag sets, label sets, subtask titles, keyword lists). The nearest
   registered kind, `string_list`, is `{ items?: string[], __kind? }` — an
   object wrapper. Declaring it would make the seam reject exactly the value
   every handler wants, which is worse than no contract. These need either a
   root-array kind class in the registry or a (breaking) reshape of the
   handlers — a ruling, not a sweep.
2. **Kind schemas are `additionalProperties:false` and their `required` lists
   are complete instances; almost every target here is a PARTIAL PATCH.**
   ~103 targets (`field_patch` + `form_draft`) accept "any subset of these
   keys, omitted keys keep their current value". A complete-instance kind
   cannot express that. The registered kinds these resemble are also
   producer-shaped rather than page-shaped: `seo_meta_tags` requires
   `notes`, `target_keyword` and both char counts, so `marketing-page`'s
   `{ meta_title?, meta_description? }` patch cannot use it; `postal_address`
   requires `display`, which `crm-record`'s `add_address` never sends;
   `plan_family_names` is `{ names:[{label,reason}] }`, not
   `content-plan-setup`'s family-key→names map.
3. **Same-word ≠ same-shape.** A text search of every structured target's
   description against all 512 registered slugs returned only incidental word
   hits (`transcript`, `markdown`, `timeline`, `citation`) — none of them the
   target's actual value shape. `plan_entity_roster` and
   `masterwork_checkup_finding` appear in the handler files of
   `content-plan-entities` / `masterwork-rulebook`, but as the RENDER of a
   result, never as the shape of the write.

### The census — 186 structured targets with no contract

Grouped by the kind that would fit **if it were registered**; the group name is
the proposed kind (or kind family). Within a group, "per-surface" means the
follow-up registers one kind per row, not one kind for the group. Shapes are
quoted from the target description, which was checked against the page handler
(`getWriteHandlers` / `useSurfaceWriteHandlers`) for the families above.

| Proposed kind / family | Targets | Rough shape | Follow-up |
|---|---|---|---|
| `plain_string_list` | 28 | root array of plain strings | ONE kind — blocked on blocker 1 (root-array kinds) |
| `text_replace_patch` | 9 | `{ text\|html\|css\|markdown: string, mode?: "replace"\|"append" }` | ONE kind **if** the payload key is converged to `text` first; today four different key names |
| `list_sort_state` | 4 | `{ key, direction: "asc"\|"desc" }` | ONE kind — `matrx-user/files` must first drop its `sort_by`/`sort_direction` spelling |
| `list_filter_patch` | 6 | per-surface key set, each key replacing that filter outright | per-surface kinds; partial-patch semantics (blocker 2) |
| `ui_focus_ref` | 4 | `{ <entity>_id }` (+ a verb on two of them) | per-surface kinds; cheap and safe |
| `typed_row_list` | 10 | root array of uniform objects (nav links, list items, columns, sections, rank targets) | per-surface kinds — blocked on blocker 1 |
| `record_field_patch` | 15 | `{ <entity>_id: string, …optional fields }` | per-surface kinds; partial-patch semantics |
| `create_record` | 7 | complete new-row payload | per-surface kinds — the BEST candidates, since a create payload IS a complete instance |
| `field_patch` | 43 | partial patch over one entity's fields | per-surface kinds; blocker 2 |
| `form_draft` | 60 | partial patch staged into an on-screen form | per-surface kinds; blocker 2, and the lowest value (nothing persists) |

Recommended order for the follow-up: `create_record` (7) and `ui_focus_ref` (4)
first — complete instances, no partial-patch problem — then the ruling on
root-array kinds, which unblocks 38 more in two sweeps.

#### Per-target census

#### plain_string_list — 28 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-admin/agent-apps` | `app_tags` | array | entity | Value: an array of non-empty strings that REPLACES the full tag set — to add one, include the existing tags from selected_app_summary.tags. An empty array clears every ta |
| `matrx-admin/system-agents` | `agent_tags` | array | entity | Value: an array of short non-empty free-text strings (no fixed vocabulary, no leading '#'); pass an empty array to clear all tags. Saved immediately through the admin's o |
| `matrx-admin/tool-registry` | `tool_tags` | array | entity | Value: an array of at most 20 short strings, each 1-40 characters after trimming, with no duplicates and no commas inside a tag (the admin's tag editor is one comma-separ |
| `matrx-user/agent-apps` | `app_tags` | array | entity | Value: an array of non-empty plain strings. This REPLACES the FULL tag set rather than appending — read app_tags first and include every existing tag you want kept, or th |
| `matrx-user/agent-builder` | `agent_tags` | array | draft | Value: an array of short free-text tag strings (no fixed vocabulary, no leading '#'); pass an empty array to clear all tags. Staged into the editor as unsaved changes; th |
| `matrx-user/cms-page` | `page_tags` | array | draft | Value: an array of non-empty strings; it REPLACES rather than appends, so include the existing tags you want kept from the `tags` value ([] clears them). Tags have no dra |
| `matrx-user/connections-skills` | `skill_trigger_patterns` | array | draft | Value is an ARRAY OF STRINGS and REPLACES THE FULL SET, so include any existing patterns from skill_draft_trigger_patterns that should survive; send [] to clear them all. |
| `matrx-user/content-plan-node` | `node_brief` | array | draft | Stages a full replacement brief into the draft as an array of bullet-point strings. |
| `matrx-user/crm-record` | `party_role_ids` | array | entity | Value is an array of role category UUIDs from roles; category edges from other dimensions are preserved. |
| `matrx-user/education-assessment` | `generation_question_types` | array | draft | Stages the question-type mix into the create form. Array of strings drawn from: multiple_choice \| true_false \| fill_blank \| short_answer \| written_response. REPLACES  |
| `matrx-user/image-studio` | `selected_presets` | array | draft | Value: an array of preset id strings, e.g. ["og-image", "favicon-32"]. REPLACES THE FULL SET — include every preset you want kept, not just the new ones. Read selected_pr |
| `matrx-user/images` | `image_selection` | array | ui | Value is an array of image UUIDs, e.g. ["7f3a…", "b21c…"]; pass [] to clear the selection. It REPLACES rather than appends, so include every id you want selected, includi |
| `matrx-user/knowledge-search` | `retrieval_source_kinds` | array | draft | Value: an array that REPLACES the full filter (this is not an append; read the current value from `source_kinds` and send the complete new set). The array may hold AT MOS |
| `matrx-user/marketing-crawls` | `crawl_exclude_patterns` | array | draft | Stages the crawl's exclude list — the blacklist that drops discovered URLs before they are fetched, and wins over the include list. Array of strings, each a JavaScript re |
| `matrx-user/marketing-crawls` | `crawl_include_patterns` | array | draft | Stages the crawl's include list — the whitelist that narrows which discovered URLs get fetched. Array of strings, each a JavaScript regular expression matched against the |
| `matrx-user/notes` | `note_tags` | array | draft | Value: an array of short plain-text tag strings (free vocabulary, no leading '#'); pass an empty array to clear all tags. Staged into the live editor and autosaved. |
| `matrx-user/organization-performance-reviews` | `accomplishments` | array | entity | Value is an array of 0-5 non-empty strings; the ideal number is three. Include existing items you want kept. The accepted list is saved immediately through the page's bro |
| `matrx-user/organization-performance-reviews` | `opportunities` | array | entity | Value is an array of 0-5 non-empty strings; the ideal number is three. Include existing items you want kept. The accepted list is saved immediately through the page's bro |
| `matrx-user/organization-performance-reviews` | `responsibilities` | array | entity | Value is an array of 0-5 non-empty strings; the ideal number is three. Include existing items you want kept. The accepted list is saved immediately through the page's bro |
| `matrx-user/organization-performance-reviews` | `strengths` | array | entity | Value is an array of 0-5 non-empty strings; the ideal number is three. Include existing items you want kept. The accepted list is saved immediately through the page's bro |
| `matrx-user/page-research` | `keywords` | array | draft | Replaces the live keyword draft with one or two unique, non-empty strings. The user still reviews them and must click Start research before any paid work or attachment be |
| `matrx-user/quick-tasks` | `panel_add_subtasks` | array | entity | Value: a non-empty array of subtask title strings, in the order they should appear. This one SAVES on apply — the subtasks exist as soon as the user approves. It adds to  |
| `matrx-user/quick-tasks` | `panel_task_labels` | array | draft | Value: an array of label strings drawn from bug \| feature \| improvement \| docs \| design \| research \| question \| blocked. Send [] to clear every label. It REPLACES  |
| `matrx-user/research` | `add_keywords` | array | entity | Value: an array of keyword strings, in priority order. Additive — it never removes or reorders existing keywords, so send only the NEW ones (read keyword_list / keyword_c |
| `matrx-user/schedules` | `schedule_draft_tags` | array | draft | Stages the schedule's tag set into the draft — replaces the FULL set (include existing tags you want kept, from schedule_draft.tags). Array of up to 50 plain strings, eac |
| `matrx-user/tasks` | `add_subtasks` | array | entity | Value: array of subtask title strings, in order. |
| `matrx-user/tasks` | `task_labels` | array | draft | Stages the FULL label set into the draft (replaces, not appends — include existing labels you want kept, from active_task_labels). Array of: bug \| feature \| improvement |
| `matrx-user/war-room` | `add_threads` | array | entity | Value: a non-empty array of thread title strings, in the order they should appear. Appends only — it never renames or removes an existing thread. |

#### text_patch — 9 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/cms-component` | `component_css_content` | object | draft | Value: { css: string, mode?: 'replace' \| 'append' } — 'replace' (the default) swaps the whole stylesheet, 'append' adds to the end of the current buffer (append is the s |
| `matrx-user/cms-component` | `component_html_content` | object | draft | Value: { html: string, mode?: 'replace' \| 'append' } — 'replace' (the default) swaps the whole body, 'append' adds to the end of the current buffer. This is a SHARED com |
| `matrx-user/cms-page` | `page_html_content` | object | draft | Value: { html: string, mode?: 'replace' \| 'append' } — 'replace' (the default) swaps the whole body, 'append' adds to the end of the current buffer. This is a BODY FRAGM |
| `matrx-user/cms-site` | `site_global_css` | object | draft | Value: { css: string, mode?: 'replace' \| 'append' } — 'replace' (the default) swaps the whole stylesheet, 'append' adds to the end of what is already there ('append' is  |
| `matrx-user/marketing-page` | `page_draft_content` | object | draft | Value: { markdown: string, mode?: 'replace' \| 'append' } — 'replace' (default) swaps the whole staged draft, 'append' adds after the current draft. STAGED into the Draft |
| `matrx-user/organizations` | `org_description` | object | entity | Value: { text: string, mode?: 'replace' \| 'append' }. 'replace' (the default) swaps the FULL description — read the `org_description` value first if you mean to extend i |
| `matrx-user/transcripts` | `transcript_body` | object | draft | Value: { text: string, mode?: 'replace' \| 'append' } — 'replace' (default) swaps the whole body, 'append' adds after the current text. Paragraphs are separated by BLANK  |
| `matrx-user/transcripts-cleanup` | `cleaned_transcript_text` | object | draft | Value: { text: string, mode?: 'replace' \| 'append' }. 'replace' (the default) swaps the FULL text — read the `cleaned_transcript_text` value first if you mean to extend  |
| `matrx-user/transcripts-cleanup` | `custom_output_text` | object | draft | Value: { text: string, mode?: 'replace' \| 'append' }. 'replace' (the default) swaps the FULL text — read the `custom_output_text` value first if you mean to extend rathe |

#### sort_state — 4 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/crm` | `list_sort` | object | ui | Value is an OBJECT (not a JSON string) with either or both of: key — one of display_name \| party_kind \| job_title \| primary_domain \| created_at \| updated_at \| exper |
| `matrx-user/crm-manager` | `list_sort` | object | ui | Value is an OBJECT (not a JSON string) with either or both of: key — one of display_name \| party_kind \| job_title \| primary_domain \| created_at \| updated_at \| exper |
| `matrx-user/files` | `list_sort` | object | ui | Value: an OBJECT `{ "sort_by": …, "sort_direction": … }` — both keys required, because a column click always sets both. sort_by is one of: name \| type \| extension \| mi |
| `matrx-user/knowledge` | `extraction_sort` | object | ui | Sorts the extraction grid. Pass `{ "key": "<column key>", "direction": "asc" \| "desc" }` where key is one of the `key` fields in extraction_columns, or pass null to clea |

#### filter_state — 6 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/agents` | `catalog_filters` | object | ui | Value is an OBJECT containing ONLY the keys you want to change; every key is optional and each one you send REPLACES that filter outright. Keys: `search_query` (string; m |
| `matrx-user/crm` | `column_filters` | object | ui | Value is an OBJECT (send it as an object, not as a JSON string) with any of these keys: display_name \| job_title \| primary_domain \| party_kind \| do_not_contact \| exp |
| `matrx-user/crm-manager` | `column_filters` | object | ui | Value is an OBJECT (send it as an object, not as a JSON string) with any of these keys: display_name \| job_title \| primary_domain \| party_kind \| do_not_contact \| exp |
| `matrx-user/knowledge` | `suggestions_filter` | object | ui | Narrows the suggestion review queue. Pass an object with any subset of: `search` (string or null — ilike across proposed value / scope name / field label), `statuses` (ar |
| `matrx-user/knowledge-library` | `catalog_filters` | object | ui | Value is an OBJECT containing ONLY the keys you want to change; each key you send REPLACES that filter outright. Keys: `search_query` (string, matched client-side against |
| `matrx-user/knowledge-library` | `library_filters` | object | ui | Value is an OBJECT containing ONLY the keys you want to change; each key you send REPLACES that filter outright. Keys: `search_query` (string, matched server-side against |

#### ui_focus — 4 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/analysis-studio` | `studio_focus_annotation` | object | ui | Value: `{ annotation_id: string }`, required, and it must be an active annotation on this document. View state only: nothing is written to the document and there is nothi |
| `matrx-user/keyword-intelligence` | `keyword_selection` | object | ui | Value is { phrase: string, selected: boolean }. Ephemeral: it moves the window's selection only — the user still presses Add as supporting to persist. Rejected when the w |
| `matrx-user/keyword-intelligence` | `open_keyword` | object | ui | Value is { phrase: string }. Ephemeral navigation only; nothing is persisted. Useful for pivoting the user to a phrase you found in keyword_relationships or the SERP evid |
| `matrx-user/masterwork-rulebook` | `checkup_decision` | object | ui | Value: { finding_id: string, verb: 'approve' \| 'improve' \| 'reject' \| 'edit', alternative_index?: number }. Nothing is written to the Rulebook here — decisions accumul |

#### typed_row_list — 10 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/cms-site` | `site_navigation` | array | draft | Value: the FULL menu as an array of `{ label, href }` objects, rendered in the order given — it REPLACES the current list, so include every link you are keeping (read `si |
| `matrx-user/content-plan-entities` | `add_entities` | array | entity | Value: a non-empty array of objects `{ label, entity_type, description?, reason? }`, where `label` is a non-empty string and `entity_type` is exactly one of: person \| so |
| `matrx-user/education-learn-authoring` | `add_sections` | array | draft | Value: a JSON ARRAY of section objects in the same `EduSection[]` vocabulary as `doc_sections`, with the same exact field names (an FAQ section is { kind: 'faq', heading? |
| `matrx-user/education-learn-authoring` | `doc_sections` | array | draft | Value: a JSON ARRAY of section objects (the `EduSection[]` vocabulary) — pass the array itself, not a string containing JSON, and no code fence. Field names are checked,  |
| `matrx-user/list-manager` | `add_list_items` | array | entity | Value: a non-empty array of objects { label, description?, help_text?, group? }. `label` is required and is the short name shown in the list; `description` is the longer  |
| `matrx-user/lists` | `add_list_items` | array | entity | Value: a non-empty array of objects { label, description?, help_text?, group? }. `label` is required and is the short name shown in the list; `description` is the longer  |
| `matrx-user/marketing-discovery` | `item_classifications` | array | draft | Value is a NON-EMPTY ARRAY of objects: [{ item_id: string, kind: string, label?: string }]. `item_id` must be the id of a row currently loaded on the PENDING tab — read t |
| `matrx-user/marketing-page` | `page_image_plan` | object | entity | Value: { images: [{ description: string, alt?: string, placement?: string, style?: string }], mode?: 'replace' \| 'append' } — 'append' (default) adds after the current p |
| `matrx-user/marketing-ranks` | `track_keywords` | array | entity | Value is an array of { keyword: string, mode: string, location_name?: string, cadence_days?: number } — mode is a tracking_modes id: google_national \| google_location \| |
| `matrx-user/pdf-extractor` | `extraction_output_columns` | array | draft | Value: an ARRAY of column objects, which REPLACES the whole column list (read `extraction_output_columns` first and include the columns you want to keep). Pass an empty a |

#### record_field_patch — 15 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-admin/agent-review` | `review_triage_classification` | object | entity | Re-classifies how ONE row is ROUTED, saved immediately through the page's canonical update. Object value: { row_id: string, lane?, priority?, workstreams?, required_tools |
| `matrx-user/context-items` | `add_context_items` | object | entity | Value: { scope_type_id: string, items: [{ display_name: string, description?: string, category?: string, value_type?: string }] } — scope_type_id comes from scope_types_s |
| `matrx-user/context-items` | `context_item_category` | object | entity | Value: { item_id: string, category: string \| null } — null or "" clears it. Free text, but stay inside the app's own vocabulary unless the user already uses something el |
| `matrx-user/context-items` | `context_item_copy` | object | entity | Value: { item_id: string, display_name?: string, description?: string } — at least one of the two; each provided key REPLACES that whole text (read context_item_authoring |
| `matrx-user/context-items` | `context_item_status_note` | object | entity | Value: { item_id: string, status_note: string \| null } — null or "" clears it; a string REPLACES the note. This is the NOTE only: the item's status itself is not agent-w |
| `matrx-user/context-items` | `context_item_tags` | object | entity | Value: { item_id: string, tags: string[] } — REPLACES every tag on the item (read context_item_authoring and include the existing tags you want kept); an empty array clea |
| `matrx-user/crm-record` | `add_employment` | object | entity | Value: { employer_party_id: company UUID, title?: string, department?: string, start_date?: YYYY-MM-DD, is_current?: boolean, is_primary?: boolean }; the employer must be |
| `matrx-user/data-tables` | `cell_value` | object | entity | Value is an object with all three keys: { row_id: string, field_name: string, value: string \| number \| boolean \| null }. `row_id` is the row's UUID — take it from the  |
| `matrx-user/education-flashcard-editor` | `card_content` | object | entity | Value: { card_id: string, front?: string, back?: string } — `card_id` is REQUIRED and must be the id of a card in this set (read `cards` to get it), and you must provide  |
| `matrx-user/education-planner` | `goal_status` | object | entity | Value is an OBJECT: { goal_id: string (required — the `id` of the entry in study_goals), status: "active" \| "achieved" \| "archived" }. "achieved" is for a goal the lear |
| `matrx-user/education-planner` | `update_goal` | object | entity | Value is an OBJECT: { goal_id: string (required — the `id` of the entry in study_goals; it decides WHICH goal changes), title?: string (plain text), target_date?: string  |
| `matrx-user/knowledge` | `extraction_field_correction` | object | entity | Value: an object `{ row_id, column_key, value }`; the column source must be `agent` or `validation`. One cell per call. |
| `matrx-user/knowledge` | `extraction_review_field` | object | entity | Value: an object `{ row_id, column_key, value }`; the column source must be `manual`. One cell per call. |
| `matrx-user/marketing-reputation` | `reputation_case_triage` | object | entity | Value is an object: { case_id: string, status: accepted \| in_progress \| monitoring \| completed \| dismissed, note?: string }. `case_id` is REQUIRED and must be the `id |
| `matrx-user/marketing-site-keywords` | `attach_page_keywords` | object | entity | Value: { page_id: string, keywords: string[] } — page_id is a web.page id, typically a row's top_page_id (the page already ranking for the query). Each phrase is upserted |

#### create_record — 7 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/cms-site` | `add_page` | object | entity | Value is an OBJECT (send the object itself, not a JSON string): `{ title: string (required, plain text), slug?: string (lowercase letters, digits and single hyphens only  |
| `matrx-user/crm-record` | `add_address` | object | entity | Value: { purpose: office \| billing \| shipping \| home \| mailing \| other, line1?: string, line2?: string, locality?: string, region?: string, postal_code?: string, cou |
| `matrx-user/crm-record` | `add_contact_point` | object | entity | Value: { channel: email \| phone \| social \| url, value: string, label?: string, purpose?: work \| personal \| mobile \| direct \| switchboard \| main \| billing \| supp |
| `matrx-user/crm-record` | `log_interaction` | object | entity | Value: { channel: call \| email \| meeting \| sms \| social \| note \| task \| other, direction: outbound \| inbound, subject?: string, body?: multiline string, duration_ |
| `matrx-user/education-flashcard-editor` | `add_cards` | object | entity | Value: { cards: [{ front: string, back?: string, card_kind?: 'basic' \| 'cloze' }] } — `front` is required on every entry; `back` defaults to empty. `card_kind` defaults  |
| `matrx-user/education-planner` | `create_goal` | object | entity | Value is an OBJECT: { title: string (required, plain text — what the learner is working toward, e.g. "Ace the AP Bio unit 3 exam"), target_date?: string \| null (the exam |
| `matrx-user/quick-tasks` | `quick_create_task` | object | entity | Value: an object with title (required, non-empty string) and any of description (string, markdown-friendly), priority (low \| medium \| high), due_date ("YYYY-MM-DD"). Pa |

#### field_patch — 43 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-admin/agent-apps` | `app_metadata` | object | entity | Value: a partial object with any of { name?: string, tagline?: string, description?: string } — the three fields the admin's 'Edit name / tagline' modal edits. Omitted fi |
| `matrx-user/analysis-studio` | `annotation_extracted_text` | object | entity | Value: `{ text: string, annotation_id?: string }`. The text REPLACES the region's current `extracted_text` in full (there is no append) — this is for transcribing or clea |
| `matrx-user/analysis-studio` | `annotation_label` | object | entity | Value: `{ label: string, annotation_id?: string, label_category?: string }`. `label` is a label-catalog id (the raw `label` in the annotations value, e.g. "invoice_number |
| `matrx-user/analysis-studio` | `annotation_redact` | object | entity | Value: `{ redact: boolean, annotation_id?: string }`; true marks it, false clears the mark. This is the region context menu's own "Mark for redaction" toggle. It does NOT |
| `matrx-user/crm-record` | `identity_fields` | object | entity | Value is an object containing one or more of: display_name, first_name, last_name, job_title, headline, legal_name, primary_domain, timezone, bio; omitted fields are pres |
| `matrx-user/education-flashcard-editor` | `set_details` | object | entity | Value: { name?: string, topic?: string, description?: string } — provide at least one; omitted fields keep their current value, and an empty string clears `topic`/`descri |
| `matrx-user/keyword-research` | `cluster_scope` | object | ui | Value is an object: { mode: replace \| append, primary_keyword: string, phrases: string[] }. mode "replace" REPLACES the full set — include every phrase you want kept, re |
| `matrx-user/list-manager` | `update_list_item` | object | entity | Value: an object { id, label?, description?, help_text?, group? }. `id` is REQUIRED and must be the `id` of an item you read from all_items — it is how the item is found, |
| `matrx-user/lists` | `update_list_item` | object | entity | Value: an object { id, label?, description?, help_text?, group? }. `id` is REQUIRED and must be the `id` of an item you read from all_items — it is how the item is found, |
| `matrx-user/maps` | `replace_map` | object | entity | Replaces and immediately saves the COMPLETE DiagramData object for the open map after user confirmation. Read map_json first and include every box, section, arrow, id, po |
| `matrx-user/marketing-backlinks` | `backlink_refresh_schedule` | object | entity | Set how often we automatically check this site for new backlinks, through the same Save the schedule editor uses. Send an object with any of { enabled: boolean, cadence:  |
| `matrx-user/marketing-brand` | `brand_identity` | object | entity | Value: { industry?: string, description?: string }; omitted fields keep their current value, an empty string clears the field. The brand NAME is human-owned and NOT writa |
| `matrx-user/marketing-brand` | `brand_profile` | object | entity | Value: a partial object with any of { audience?: string, voice_tone?: string, positioning?: string, service_area?: string, content_guidelines?: string, notes?: string, va |
| `matrx-user/marketing-competitors` | `competitor_classification` | object | entity | Confirms one currently loaded proposed competitor classification exactly as shown in the approval chip. The user remains the decision-maker; the action writes the human c |
| `matrx-user/marketing-competitors` | `competitor_tracking` | object | entity | Sets one competitor's tracking status — the same change as the Track / Stop tracking row action, saved immediately through the canonical RPC. Send an object { "competitor |
| `matrx-user/marketing-competitors` | `opportunity_status` | object | entity | Moves one prioritized opportunity through its workflow — the same change as the Accept / Start / Complete / Dismiss row actions, saved immediately through the canonical R |
| `matrx-user/marketing-findings` | `finding_suppression` | object | entity | Value is an object: { suppressed: boolean, reason?: string }. To suppress, send suppressed: true WITH a reason (a string, 500 characters or fewer) saying why this conditi |
| `matrx-user/marketing-page` | `page_headings_plan` | object | entity | Value: { outline: [{ level: 1-6, text: string }, …], notes?: string } — outline REPLACES the full planned outline (include every heading you want kept; read desired_value |
| `matrx-user/marketing-page` | `page_image_alts` | object | entity | Value: { alts: { [src: string]: string } } — keys are exact image src values from the observed images inventory (images.items[].src), values are the proposed alt text. Pr |
| `matrx-user/marketing-page` | `page_indexability_plan` | object | entity | Value: { canonical_url?: string, meta_robots?: string } (e.g. meta_robots 'index, follow' or 'noindex') — at least one; omitted fields keep their current desired value. P |
| `matrx-user/marketing-page` | `page_link_plan` | object | entity | Value: { accepted_anchor_texts?: string[], inbound_links?: [{ url: string, anchor_text?: string }], outbound_links?: [{ url: string, anchor_text?: string }] } — at least  |
| `matrx-user/marketing-page` | `page_meta_tags` | object | entity | Value: { meta_title?: string, meta_description?: string }; omitted fields keep their current value. Persists immediately through updatePageIntent with the version guard;  |
| `matrx-user/marketing-page` | `page_plan_notes` | object | entity | Value: an object with at least one of { identity_notes?, structured_data_notes?, strategy_notes?, performance_goals?, backlink_plan?, additional_content_notes? } — each a |
| `matrx-user/marketing-page` | `page_remove_keywords` | object | entity | Value: { keywords: string[] } — phrases matched case-insensitively against the attached keyword_batch (supporting role only; the primary target keyword is changed via pag |
| `matrx-user/marketing-page` | `page_social_card` | object | entity | Value: { og_title?: string, og_description?: string } — at least one; omitted fields keep their current desired value. Persists immediately through updatePageDesiredValue |
| `matrx-user/marketing-page` | `page_supporting_keywords` | object | entity | Value: { keywords: string[] }. Each phrase is upserted into the keyword library and associated through the canonical chokepoint (addPageSupportingKeywords); duplicates ar |
| `matrx-user/marketing-page` | `page_target_keyword` | object | entity | Value: { keyword: string }. Persists immediately through updatePageIntent (meta intent fields are preserved). |
| `matrx-user/marketing-ranks` | `set_tracking_active` | object | entity | Value is { target_ids: string[], is_active: boolean } where every id must be a target_id from rank_portfolio. |
| `matrx-user/marketing-site` | `site_description` | object | entity | Value: { description: string } (non-empty; REPLACES the current description in full — the current one is in site_description). Persists immediately through updateSiteIden |
| `matrx-user/marketing-site` | `site_name` | object | entity | Value: { name: string } (non-empty plain text; replaces the current name in full — the current one is in site_name). Persists immediately through updateSiteIdentity with  |
| `matrx-user/marketing-site-keywords` | `keyword_traffic_class` | object | entity | Value: { keywords: string[], traffic_class: 'money' \| 'educational' \| 'brand' \| 'mismatch' \| 'clear', notes?: string }. keywords are plain phrases (queries from visib |
| `matrx-user/marketing-site-keywords` | `library_keywords` | object | entity | Value: { keywords: string[] } — plain phrases, typically queries from visible_keyword_rows that show no workflow status or market data yet. Each phrase is upserted throug |
| `matrx-user/podcast-run` | `episode_description` | object | entity | Value: { description: string } — plain prose, non-empty, 2000 characters or fewer, no markdown headings. REPLACES the whole description; to extend the existing one, inclu |
| `matrx-user/podcast-run` | `episode_title` | object | entity | Value: { title: string } — one line, non-empty, 200 characters or fewer, no surrounding quotes. The episode SLUG and public URL are intentionally untouched, so the public |
| `matrx-user/settings` | `display_layout` | object | entity | Change how the app shell is arranged. Expects an OBJECT with any subset of these keys — send only the ones you want to change, the rest are left alone: dashboard_layout ( |
| `matrx-user/settings` | `language_defaults` | object | entity | Set the per-feature default languages. Expects an OBJECT with any subset of these keys: voice \| text_generation \| flashcards. Each value must be one of: en \| es \| fr  |
| `matrx-user/settings` | `text_generation_style` | object | entity | Set the default writing style for text-generation surfaces. Expects an OBJECT with any subset of: tone (neutral \| professional \| casual \| friendly \| formal \| creativ |
| `matrx-user/settings` | `voice_persona` | object | entity | Set how spoken replies are delivered. Expects an OBJECT with any subset of: emotion (free-text delivery hint like "cheerful" or "calm", max 80 characters), wake_word (the |
| `matrx-user/transcript-studio` | `cleaned_segment_text` | object | entity | Value: { id: string, text: string }. `id` is REQUIRED and must match an `id` in the `cleaned_segments` value exactly; `text` REPLACES that segment's text outright and mus |
| `matrx-user/transcript-studio` | `concept_item` | object | entity | Value: { id: string, kind?: string, label?: string, description?: string \| null }. `id` is REQUIRED and must match an `id` in the `concept_items` value exactly. Supply o |
| `matrx-user/transcripts` | `transcript_description` | object | entity | Value: { description: string } — plain text, may be empty to clear it. Replaces the stored description outright (this is NOT an append). Persists IMMEDIATELY through the  |
| `matrx-user/transcripts` | `transcript_speaker_label` | object | entity | Value: { from: string, to: string } — `from` must match an existing label in `speaker_list` exactly (case-sensitive); `to` is the new non-empty label. Only the speaker la |
| `matrx-user/transcripts` | `transcript_title` | object | entity | Value: { title: string } — a non-empty title, plain text, no timecodes. Replaces the stored title outright. Persists IMMEDIATELY through the same updateTranscript service |

#### form_draft — 60 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-admin/applications` | `app_notice` | object | draft | Value is an object that REPLACES the whole notice: {level, title, body, url?}. `level` must be exactly one of info \| warning \| critical; `title` and `body` are both REQ |
| `matrx-admin/bundles` | `new_bundle_draft` | object | draft | Value: an object with AT LEAST ONE of { name, description }. Each key REPLACES that whole input; omit a key to leave it exactly as the admin left it (nothing here appends |
| `matrx-admin/email` | `email_draft` | object | draft | Value: an object with AT LEAST ONE of { subject, message_body }. Each key REPLACES that whole field; omit a key to leave it exactly as the admin left it (nothing here app |
| `matrx-admin/feedback` | `announcement_draft` | object | draft | Value: an object with AT LEAST ONE of { title, message, announcement_type }. Each key REPLACES that whole field; omit a key to leave it exactly as the admin left it (noth |
| `matrx-admin/feedback` | `category_draft` | object | draft | Value: an object with AT LEAST ONE of { name, description }. Each key REPLACES that whole field; omit a key to leave it as the admin left it (nothing appends — read `cate |
| `matrx-admin/lookups` | `lookup_draft` | object | draft | Value: an object with AT LEAST ONE of { name, description }. Each key REPLACES that whole input; omit a key to leave it exactly as the admin left it (nothing here appends |
| `matrx-admin/mandates` | `mandate_exemplar_draft` | object | draft | Value: an object with AT LEAST ONE of `{ label, variables, user_input }`. Each key REPLACES that one field; omit a key to leave what the admin typed alone (read `mandate_ |
| `matrx-admin/mcp-servers` | `new_server_draft` | object | draft | Value: an object with AT LEAST ONE of `{ name, vendor, category, description }`. Each key REPLACES that one field; omit a key to leave what the admin typed exactly as the |
| `matrx-user/agent-advanced-editor` | `editor_catalog_profile` | object | draft | Value: an OBJECT (structured JSON, never a JSON-encoded string) with at least one of {"description": "a few sentences of plain prose, no markdown headings, up to 4000 cha |
| `matrx-user/agent-advanced-editor` | `editor_output_schema` | object | draft | Value: a JSON OBJECT (not a string of JSON) shaped {"name": "snake_or_dash_name", "description": "optional", "strict": true, "schema": {"type": "object", "additionalPrope |
| `matrx-user/agent-run` | `user_input_draft` | object | draft | Value: { "text": string (1-20000 characters), "mode"?: "replace" \| "append" } — `text` is required, `mode` is optional and defaults to "replace", which swaps the ENTIRE  |
| `matrx-user/agent-run` | `variable_values` | object | draft | Value: an object of { "<variable name>": <value> } — a PARTIAL patch, so ONLY the keys you pass change and every variable you omit keeps whatever it currently has (pass a |
| `matrx-user/agent-settings` | `settings_catalog_profile` | object | draft | Value: an OBJECT (structured JSON, never a JSON-encoded string) with at least one of {"description": "a few sentences of plain prose, no markdown headings, up to 4000 cha |
| `matrx-user/chat` | `input_draft` | object | draft | Value: { "text": string (1-20000 characters), "mode"?: "replace" \| "append" } — "replace" (the default) swaps whatever is in the composer, "append" adds after it on a ne |
| `matrx-user/cms` | `new_site_draft` | object | draft | Value: an object with AT LEAST ONE of `{ name, slug, domain }`, all strings. Each key REPLACES that one field; omit a key to leave the user's value exactly as they left i |
| `matrx-user/cms-page` | `page_meta_tags` | object | draft | Value: { meta_title?: string, meta_description?: string, meta_keywords?: string } — omitted fields keep their current value, and meta_keywords is ONE comma-separated stri |
| `matrx-user/cms-site` | `site_footer_config` | object | draft | Value: an object with any of `columns` (`[{ heading, links: [{label, href}] }]`), `copyright` (string), `legal_links` (`[{label, href}]`), `show_contact` / `show_social`  |
| `matrx-user/cms-site` | `site_theme_config` | object | draft | Value: the FULL token map as `{ group: { key: value } }` (bare top-level scalars allowed), e.g. `{ colors: { primary: '#0f766e' }, fonts: { body: 'Inter, sans-serif' } }` |
| `matrx-user/content-plan-entities` | `entity_draft` | object | draft | Stages values into the OPEN source editor dialog — the same staging buffer the user's own typing fills. NOTHING is saved: the user reviews the dialog and presses Save/Cre |
| `matrx-user/content-plan-node` | `node_attributes` | object | draft | Stages a full replacement vertical-attributes object into the draft. |
| `matrx-user/content-plan-setup` | `set_family_counts` | object | draft | Stages count overrides for the selected shape: an object mapping family keys to numbers. The route preview updates live; the user commits. |
| `matrx-user/content-plan-setup` | `set_family_names` | object | draft | Stages real page names for count-bearing families: an object mapping family keys to string arrays. A name list SETS that family's count and rewrites the previewed slugs.  |
| `matrx-user/crm-create-party` | `party_draft` | object | draft | Stages a drafted person or company into the open create form — the same fields the user would type, staged the same way. Object with any of: party_kind (person \| organiz |
| `matrx-user/education-fastfire` | `drill_config` | object | draft | Stages the drill's pace and behavior into the FastFire setup form, before the learner starts. Accepts a PARTIAL object — include only the fields you mean to change; omitt |
| `matrx-user/education-learn-authoring` | `doc_metadata` | object | draft | Value: { title?: string, summary?: string, subject?: string, letter?: string, keywords?: string[] } — provide at least one; omitted fields keep what the editor already ho |
| `matrx-user/education-learn-authoring` | `doc_related` | object | draft | Value: { tools?: string[], subjects?: string[], exams?: string[] } — pass the object itself, not a string containing JSON, and no code fence. Each array holds slugs (e.g. |
| `matrx-user/education-memory` | `generation_source` | object | draft | Value is an OBJECT; include only the fields you mean to set: { source_kind?: "deck" \| "topic", topic?: string (the material to build aids for, 3-500 characters, e.g. "Th |
| `matrx-user/education-mind-maps` | `generation_source` | object | draft | Value is an OBJECT; include only the fields you mean to set: { source_kind?: "deck" \| "topic", topic?: string (the subject to map, 3-500 characters, e.g. "The causes of  |
| `matrx-user/education-planner` | `plan_setup` | object | draft | Value is an OBJECT; include only the fields you mean to set: { title?: string (plain text — what they are studying for, e.g. "Spanish midterm"), exam_date?: string (the t |
| `matrx-user/education-practice-oral` | `practice_setup` | object | draft | Value is a partial patch OBJECT; include only the fields you mean to set, and omitted keys keep their current value: { focus?: string (the required steer — the subject, t |
| `matrx-user/education-tutor` | `tutor_message_draft` | object | draft | Value: { "text": string (1-8000 characters), "mode"?: "replace" \| "append" } — "replace" (default) swaps whatever is in the composer, "append" adds after it on a new lin |
| `matrx-user/feedback` | `feedback_draft` | object | draft | Value: an object with AT LEAST ONE of `{ description, feedback_type }`. Send it as structured arguments, never as a JSON-encoded string. Each key REPLACES that one field  |
| `matrx-user/html-page` | `page_seo_metadata` | object | draft | Value is ONE object with any of these OPTIONAL keys: { "meta_title": string, "meta_description": string, "meta_keywords": string }. Only the keys you send are changed — o |
| `matrx-user/image-generate` | `generation_request` | object | draft | Value: an object with AT LEAST ONE of `{ prompt, style, image_size, image_count }`. Each key REPLACES that one field; omit a key to leave it exactly as the user left it ( |
| `matrx-user/image-studio` | `conversion_settings` | object | draft | Value: an object with AT LEAST ONE of { output_format, output_quality, background_color, resize_fit, resize_position }. Each key REPLACES that one setting; omit a key to  |
| `matrx-user/image-studio` | `filename_base` | object | draft | Value: an object keyed by WHICH image to rename, with the new base as the value, e.g. { "1": "autumn-market-stall", "IMG_4821.png": "rooftop-solar-array" }. Read source_f |
| `matrx-user/image-studio` | `image_description` | object | draft | Value: an object with `file` PLUS at least one content key: { file, alt_text?, caption?, title?, description?, keywords?, filename_base? }. file — WHICH image, given as t |
| `matrx-user/knowledge-data-stores` | `new_store_draft` | object | draft | Stages a NEW data store into the create form in the left column — the same three inputs the user would type. Object with any of: name (string, 1-200 chars), kind (one of  |
| `matrx-user/knowledge-search` | `retrieval_tuning` | object | draft | Value is a partial patch object: { rerank?: boolean, use_hyde?: boolean, multi_query?: integer 1-5, expand_entity_clusters?: boolean } — omitted keys keep their current v |
| `matrx-user/marketing` | `site_editor_draft` | object | draft | Value: an object { site, name?, description? }. `site` is REQUIRED and says WHICH loaded row to edit: its domain ("example.com", with or without scheme/www), its site_id, |
| `matrx-user/marketing-brand-assets` | `media_order` | object | draft | Value: a partial object with any of { type?: hero \| share-card \| infographic \| diagram \| blog-header \| photo \| product \| illustration, brief?: string, style?: stri |
| `matrx-user/marketing-competitors` | `autopsy_run_plan` | object | draft | Fills in the "Run a fresh autopsy" card WITHOUT running it — the user still presses "Run competitor autopsy", which is what spends provider credits and crawls competitor  |
| `matrx-user/marketing-crawls` | `crawl_options` | object | draft | Stages crawl-command settings into the New Crawl workspace's launch form — the same controls the user would set by hand. Object with any of: max_pages (integer 1-50000),  |
| `matrx-user/marketing-site-media` | `media_standards_notes` | object | draft | Value: { notes: string }, which REPLACES the current notes (pass "" to clear them). These notes ride along with every AI image order, so write them as instructions to an  |
| `matrx-user/marketing-site-media` | `media_standards_slots` | object | draft | Value: { slots: [{ name: string, width?: number\|null, height?: number\|null, format?: string\|null, max_kb?: number\|null, notes?: string }] }. The list REPLACES the ful |
| `matrx-user/marketing-site-settings` | `crawl_behavior` | object | draft | Value: { render_mode?: 'http_only' \| 'http_first' \| 'browser_always' \| 'browser_with_screenshot', respect_robots?: boolean, seed_from_sitemap?: boolean, follow_subdoma |
| `matrx-user/marketing-site-settings` | `crawl_budget` | object | draft | Value: { max_pages?: number (1-50000), max_depth?: number\|null (null or 0 = unlimited link depth), concurrency?: number (1-32), host_rps?: number (1-50 requests per seco |
| `matrx-user/marketing-site-settings` | `crawl_scope_patterns` | object | draft | Value: { include_patterns?: string[], exclude_patterns?: string[] } — each entry is a REGULAR EXPRESSION matched against the URL PATH only (e.g. ^/blog/, /tag/, \.pdf$),  |
| `matrx-user/marketing-site-settings` | `site_lifecycle` | object | draft | Value: { status: 'active' \| 'paused' \| 'error' }. Pausing stops automatic crawling and collection without deleting anything. Stages into the settings form — the user st |
| `matrx-user/masterwork-rulebook` | `rule_draft` | object | draft | Stages a complete or partial proposed rule in the page's Add/Edit Rule dialog. For edit mode, rule_id must identify a rule already present; the user sees the populated fo |
| `matrx-user/pdf-extractor` | `extraction_template_draft` | object | draft | Value: an object with AT LEAST ONE of `{ template_name, page_range, chunk_size, chunk_overlap }`. Each key REPLACES that one field; omit a key to leave it exactly as the  |
| `matrx-user/podcast-studio` | `episode_shape` | object | draft | Value: { language?, format?, theme?, host_count? } — omitted keys keep their current value, and at least one key is required. language is a BCP-47 code the surface offers |
| `matrx-user/quick-note-save` | `note_draft` | object | draft | Stages the note this window is about to save — the same fields the user would type into the open form, staged the same way. Object with any of: note_name, folder, content |
| `matrx-user/scanner` | `scan_page_labels` | object | draft | Value is a PARTIAL object map keyed by the page's `item_id`, e.g. `{"9f3c…": "Signature page", "1a20…": "Exhibit B"}`. Take the ids from `scan_items[].item_id`; do NOT pa |
| `matrx-user/schedules` | `schedule_draft_trigger` | object | draft | Stages the WHEN of the schedule into the editor draft — trigger type and config as ONE object, replacing the current trigger. Accepted shapes, exactly: { "type": "cron",  |
| `matrx-user/schedules` | `schedule_draft_variables` | object | draft | Stages the variable payload merged into every run, as one flat key/value object — replaces the FULL set; include existing entries you want kept, from schedule_draft.varia |
| `matrx-user/scraper` | `scrape_command` | object | draft | Value is a partial patch object: { mode?: quick \| full \| search, url?: string, keyword?: string } — omitted keys keep their current value, and at least one key must be  |
| `matrx-user/shapes` | `test_draft_instance` | object | draft | Seeds the Test tab's input form with a sample payload for this shape. Pass a JSON OBJECT of the shape's own fields — the `__kind` discriminator is added for you, so do no |
| `matrx-user/task-create` | `task_draft` | object | draft | Stages a drafted task into the open Quick Create form — the same fields the user would type, staged the same way, so they see it before anything is created. Object with a |
| `matrx-user/workbooks` | `workbook_sheet_names` | object | draft | Value is an object keyed by SHEET ID with the new name as the value, e.g. { "sheet-01": "Q3 Revenue", "sheet-02": "Assumptions" } — read workbook_sheets first to get the  |


## Remaining work

-1. **Fixture hygiene (2026-09-12, owner session).** Two throwaway rows a dying WP5 lane left in the live mirror were deleted: `ui.ui_surface_write_target matrx-admin/lookups zz_fixture_recent_probe` and `ui.ui_surface_agent_role matrx-admin/lookups zz_fixture_role_probe`. Any `zz_fixture_*` row in a mirror table is throwaway by convention — delete it, and never leave one behind: it reads as real stale drift to the next admin.


0. **WP2 left no run-UI signal, deliberately (2026-09-11).** The brief asked
   whether a cheap honest signal exists in the existing lifecycle UI. It does
   not: `SurfaceContextWindow` answers "what could an agent write here" per
   SURFACE and knows no conversation, and `WritePolicyEditor` /
   `AgentAccessColumn` describe the surface's own policy per TARGET and never
   read `output_schema`. The suppression itself breaks no on-screen promise —
   the agent is never offered the tool, and user-origin writes plus every
   non-structured agent are untouched. Making the binding UI say "this agent
   returns a structured result, so it cannot write this page" needs an
   `output_schema` read in the bind panel; that is a real (small) build, filed
   here rather than smuggled into the guard. The honest signal today is the
   `console.info` from `announceWithheldSurfaceWriteTools`.

1. **aidream `block_stream.py` stays PARKED** — pipeline runs still stream
   bare chunks, not `render_block` envelopes. Four documented blockers at the
   top of `aidream/aidream/services/ai_execution/block_stream.py` (missing
   emitter-protocol methods called unguarded by providers; no turn-text
   accumulator; `blk_N` ids restart per instance; None-gated not
   capability-gated wrap). Fix all four with a forcing-function test asserting
   the protocol surface, then engage in `run_one_agent`. The FE does not need
   it (`StreamBlockAccumulator` builds envelopes client-side) — it is a server
   optimization.
2. **Page-agent pipeline surfaces not adopted** — 4 pipeline call sites emit
   render-block streams (`seo/keyword_research.py` ×2, `seo/page_agents.py`
   ×2) but the page-agent surfaces never call `adoptForeignStream`, so those
   events are ignored (degrades to saved artifact). Cheap, high value.
3. **Surface client tools: no adopter, no DB mirror, no
   `check:surface-drift` coverage** — the seam is fully wired
   (declare → register → inject → dispatch) but no manifest declares one.
4. **Agent-facing kind skills** — the three LSI kinds' teaching blocks don't
   mention the apply affordances, so agents don't describe them to users.
5. **`actorLabel` polish** — the ask dialog says "An agent wants…" when the
   agent definition isn't hydrated in the agent-definition slice
   (`dispatch-surface-write.thunk.ts` falls back). Consider a name lookup
   that doesn't depend on slice hydration.
6. **Cross-agent policy residual** — two agents launched on the SAME surface
   in one tab share the surface's policy resolution (documented in
   `surface-writeback.ts`); needs per-request policy scoping only if it bites.
7. Opportunistic: `listLiveWriteTargets()` runs in the Surface Context
   window's render body on a 400ms poll, re-invoking every provider's
   `getWriteHandlers()`.
8. Observed (pre-existing, delegated-resume class): server stream warning
   `request_context_changed` (`source_feature: 'ai-results' →
   'conversation_resume'`) fires once per delegated-tool resume.

## Done

- `adoptForeignStream` + `consumeStream` on `callApi` — pipeline streams render canonically; both bespoke renderers deleted; `matrx/no-bespoke-stream-renderer` ESLint at error.
- 360 loop v1 — `writeTargets`/`applySurfaceWrite`/UI-state reads/`applyPolicy` + per-binding `write_policies` (DB v2 payload, merge layers, launch registration, manual floor); editor UI everywhere the binding lives; shortcut storage under `__write_policies`.
- Marketing-page targets live (`page_meta_tags`, `page_target_keyword`, `page_supporting_keywords`, `page_draft_content`) + LSI kind components' user-origin buttons.
- **Agent-origin stream side wired (2026-08-08)** — `apply_surface_write` inline tool injected per turn from `listAgentWritableTargets()`, routed to `applySurfaceWrite(origin:"agent")`; decline = non-error result. **E2E-verified live** on the marketing-page workspace: agent call → ask confirm → Apply → `updatePageIntent` saved + fields updated + loop resumed.
- `pnpm type-check` green; aidream ORM model for `ui.ui_surface_write_target` generated and in the deployed build (`/health/version` SHA verified 2026-08-08).
- **Tasks surface agent-writable (2026-08-08)** — second adopter, 8 ask targets, handlers in `TaskEditorBody.tsx`; live-verified (4 targets one run). Campaign skill `.claude/skills/surface-write-targets/` written; 5 self-replicating chips fired.

## Decisions needed (Arman)

- **Ask-policy UX**: agent write approval is an inline `confirm()` at the
  moment of the write. If you want these queued in the same persistent inbox
  as proposed directives instead, say so — deliberate follow-up, not an
  oversight.
- **Write-target inheritance**: `writeTargets` do NOT inherit down the
  surface parent chain (values do). A child surface never implicitly gains
  the right to write its parent's fields. Say so if you want the opposite.
