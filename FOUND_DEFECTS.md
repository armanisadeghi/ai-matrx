# FOUND DEFECTS — AI Matrx Admin (frontend)

The ledger of found bugs and gaps on the frontend. Twin of aidream's `FOUND_DEFECTS.md`.

**Rules**

- File only defects you can't fully fix in the moment, and only UNRELATED findings — a bug related to your current task gets **fixed**, not filed. Enough context to act cold: what, where, the fix.
- **When you fix one: collapse it to a one-line bullet in Resolved (title + date + commit/file pointer) — or delete it outright.** No histories, no verification narratives, no journeys. An entry earns lines only while it is open.
- Keep open entries compressed to load-bearing facts: what's broken, exact paths, the fix, who decides. A partially-fixed entry keeps only the open remainder.
- CLAUDE.md links here. Read both before touching files, media, or persistence.

---

## OPEN

### D182 — Component-RLS remainder: 33 tables still can't `INSERT…RETURNING` as authed (2026-08-13)

Left open by the D181 fix. (1) **21 component tables have `created_by` but no `_stamp_actor` trigger and no default** (`files.file_versions` + 20 `seo.*`: backlink*, serp_snapshot, rank_observation, competitor*, change_event/assessment, page_performance, search_performance_daily, …) — authed `.insert().select()` still 42501s unless the client sends `created_by` explicitly. Fix = attach the canonical trigger trio per table. (2) **12 component `std_select` policies sit on tables with no `created_by` column at all** (`growth.loop_event/loop_stage_run`, `legal.wc_injury/wc_report`, `scheduler.sch_agent_task`, 7 `seo.*` raw-pipeline tables) — needs base-retrofit. All 33 are service_role-written today, so nothing user-facing is known broken. (3) **Product call for Arman:** the component `std_insert` parent-editor arm doesn't force `created_by = auth.uid()`, so a parent-editor can stamp another user as creator, conveying that user owner-read (entity variant does force it).

### D180 — Hydration mismatch + "script tag while rendering" on every `(core)` marketing route (2026-08-13)

Two console errors on load in dev on `/marketing/keyword-research` AND untouched `/marketing/ai-visibility` — shell-level, not feature-level: a `<script>` rendered inside a React tree somewhere in the `(core)` layout chain. Hydration failures silently re-render the whole tree client-side — real perf + correctness cost. Not yet investigated.
### D183 — 🚨 The RLS kernel materializes EVERY row id: `seo.search_performance_daily` (13.2M rows) is unreadable to any signed-in user (2026-08-13)

**Every `authenticated` read of that table — and of any `security_invoker` view
over it — dies at the 8s statement timeout.** Live symptom: 10× Postgres
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

**NOT FIXED HERE, deliberately.** CLAUDE.md: *never add or change a security
layer on your own authority*, and this is a live RLS policy on a shared DB.
The fix is a predicate-shaped policy (org/site-scoped, index-friendly, same
rows) or a kernel that returns a predicate instead of an array — **Arman's
call, one owner, one change.** Do not "fix" it by widening access, and do not
narrow it by dropping the sparse permission lanes without checking they are
empty for the table.

Secondary, same incident, filed here so they are not lost:
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

### D179 — Keyword Research workbench: remaining UI debt (2026-08-13, Arman review)

Arman: "there are other UI issues with this page as well" (`/marketing/keyword-research`), beyond the three fixed in the sharing pilot. Wants one full `ui-sharp`/`ui-dense` pass (launcher strip, metrics line under `KeywordInput`, cluster chip, toolbar, table density): screenshot first, enumerate, fix as one change. **Chip fired 2026-08-12.**

### D171 — `content_role` has two writable authorities and 13 live disagreements (2026-08-11)

System-of-record: `common-docs/systems/entity-content-role/FEATURE.md` — read it before changing either role field or its consumers in any repo.

### D167 — Research outputs cannot be SAVED: `rs_topic_append_output` blocked by the RLS UPDATE policy (2026-08-11)

Every Outputs Studio generator (blog, slides, podcast, SEO) persists through `public.rs_topic_append_output`; generation works, save fails — the user watches a full run and loses it. Measured live: SELECT on `research.rs_topic` returns the row; UPDATE affects 0 rows; the RPC (`migrations/research_canon_05_move_to_research_schema.sql:108`) is plain plpgsql with `FOR UPDATE`, which needs the UPDATE policy → `rs_topic % not found` → PostgREST 400. Topics are `visibility='internal'`; SELECT honours it, UPDATE doesn't. **Decides: Arman** — should an org reader be able to write an org-internal topic, and should the RPC become `security definer` + `iam.has_access`? Also: the raw "not found" is an `<AccessGate>` case — the row exists and the user can see it.

### D170 — A live run whose payload is JSON or an XML wrapper shows an EMPTY window until it finishes (2026-08-11)

The floating-window posture only kills the spinner for markdown payloads. Watched blank for their whole run: podcast blog writer/show notes (`useEpisodeArticles` — structured JSON envelope) and the marketing image prompt generator (`generate-page-image.ts` step 1 — `<image_prompt>` wrapper). Fix belongs in the canonical pipeline, never the call site: content-IR renders un-kinded live JSON progressively, or these agents get a registered kind. Per `docs/handoffs/live-run-streaming-sweep.md`; note its §6 wrongly records podcast articles as plain markdown — the wire is JSON, markdown is assembled client-side (`articleMarkdown.ts`). Whether they get a kind is **Arman's call**.

### D169 (was D167) — Transcript Studio never loads its own `studio_runs` rows, so refresh forgets every pass (2026-08-11)

No `listAgentRuns` in `features/transcript-studio/service/studioService.ts`, nothing dispatches `runsLoaded` — column status is in-memory only and the live-run door (`<WatchRunButton>` via the run row's `conversationId`) dies with the tab. Fix: add `listAgentRuns(sessionId)`, dispatch `runsLoaded` where segments load, reopen for rows still `running`. **Chip fired 2026-08-12.**

### D164 — `keyword_set` and `keyword_variant_set` are byte-identical kinds (2026-08-11)

Same `emitted_json_schema`, same fingerprint (`9q-183lvc51ku2s37`); `matchKindForSchema` is first-writer-wins so an agent bound to `keyword_variant_set` displays as `keyword_set`. Merge or genuinely differentiate — **Arman's call** (product semantics).

### D163 — 12 stored `emitted_block_schema` rows are stale against the live emitter (2026-08-11)

Found by `pnpm shape:reemit-discriminator`. 10 rows: `additionalDetails.additionalProperties` stored `false`, emitter now emits `true` — needs a ruling on which is intended before re-emitting. Plus `study_pack_set` (dangling `flashcard_set_beta` stub in `$defs`) and `video_transcript_research` (python-owned `claim_evidence` child unreconstructable — correctly refused). No runtime reader of the column today; drift-guard only.

### D159/D160 — Agent-definition reads are served from ORM caches, so a DB edit may not reach production runs (2026-08-11)

Two paths, one class: (a) aidream `execution_definition.py` → `definition_manager.load_by_id(id)` with default `use_cache=True` — a **process-global** cache with no TTL; the row decides is_public/user_id/is_active, i.e. exactly what the docstring says must be an authoritative `use_cache=False` read. Measured: grounding disabled in DB, production kept grounding until restart. (b) matrx-ai `_agx_manager_impl.py:52,71` `to_config()` → `load_by_id` under `CachePolicy.SHORT_TERM` = **10 min**, staggered per worker, so migration-applied agent edits flap between old/new — "verified live" within 10 min of an agent migration can be a false claim (unchanged `input_tokens` = still reading cache). Fix candidates: `use_cache=False` on the execution reads (one PK read per run), an invalidation hook on agent write, or a short TTL. **Decides: Arman** — execution-hot-path change in aidream/matrx-ai. Working rule meanwhile: after a migration-applied agent edit, wait out 10 min and re-run until output changes.

### D161 — The portable-schema gate SILENTLY EMPTIES map-typed fields; `research.suggest_setup` left unbound (2026-08-11)

`matrx_ai.schema.lint._make_portable` sets `additionalProperties:false` on every object node — a `dict[str,str]` field becomes an object that can legally hold nothing, silently. Fix order: (1) gate REFUSES map-typed objects loudly; (2) change `SuggestSetupOutput.keyword_goals` to a closed `list[{keyword, goal}]` (aidream `analysis.py:717` folds back to dict, HTTP shape unchanged); (3) version the prompt to teach `intent_key`/`intent_reasoning` (17 seeded keys, `research/intents.py:78` screams on unknown); (4) regenerate the kind and bind. Steps 2–3 are product authoring — **decides: Arman**.

### D155 — Google's grounded stream DROPS a span of the answer (2026-08-11)

Confirmed by Google's own forum (https://discuss.ai.google.dev/t/176967) and our raw-SSE capture: with Search grounding, 8–58% of runs lose a span (whole first grounded segment) regardless of schema; without tools, 0/16. There is no final full-text event to reconcile against (tested), repair would silently drop content, retry re-gambles. **The fix is the two-call split: call 1 grounds and gathers, call 2 structures with NO search tools (0/16 corrupt).** Forum reports 2.5-flash unaffected — worth testing. User-visible today as `noJson` (empty result in `KindRequestDialog`).

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

### D145 — DB kind components written as a bare function don't compile on web (2026-08-09)

`features/agent-apps/utils/compile-slot.ts::compileSlotComponent` only rewrites `export default`; the documented bare `function Card({data})` form silently falls back to the generic viewer. Workflow Studio already recovers the last PascalCase top-level binding — port it. **Chip fired 2026-08-12.**

### D144 — 14 shadcn wrappers blank their own visible content until hydration (2026-08-09)

`components/ui/*` wrappers gate their Radix Root on `useIsMounted` + `return null` (tooltip, dropdown-menu, tabs, accordion, collapsible, matrx/dialog, dialog, alert-dialog, sheet, popover, menubar, hover-card, navigation-menu, select) — deletes triggers/tab bars/nav from SSR and first paint. Justification is largely false (Radix uses SSR-stable `useId`); precedent: `components/ui/context-menu/context-menu.tsx`. Each wrapper needs a quick check against its own primitive before ungating. **Fix in flight 2026-08-12.**

### D143 — the files-upload eslint ban points every caller at a file that does not exist (2026-08-09)

`eslint.config.mjs:46-53` names `@/features/files/upload/requestUpload`; the real export is `features/files/upload/uploadGuardOpeners.ts:81`, and the glob would ban the suggested path anyway. Two callers permanently red (`features/war-room/components/thread/ThreadNewFileDialog.tsx:34`, `ThreadResourcesTab.tsx:43`). **Fix in flight 2026-08-12.**

### D142 — on TOUCH, EntityRef offers only one of its four doors (2026-08-09)

The peek/new-tab cluster is hover-revealed (`components/official/entity-ref/EntityRef.tsx`), so on touch devices every EntityRef degrades to Open-only; the in-flow cluster also permanently reserves ~44px per cell. **Product call (Arman):** (a) `alwaysShowActions` on mobile, (b) long-press, or (c) row `…` menu carries peek on touch (probably right for tables, wrong for prose). Either way `opacity-0` should stop reserving layout.

### D141 (was second D138) — `/marketing/.../audit` dead-ends on a large site: "Audit rollup unavailable" (2026-08-09)

On a 325-page site the audit tab replaces the whole surface with a generic retry error, hiding findings that loaded. Surface the real PostgREST error, page/cap `fetchSiteAuditRows`, keep doors to what loaded. **Chip fired 2026-08-12.**

### D140 — `lib/entity-list` gaps that block adoption (2026-08-09)

(1) No `presentation` prop — `EntityListPage.tsx:120` hardcodes route-header padding, unusable in a `WindowPanel` (CRM already solves this bespoke; small fix once a second consumer needs it, not speculatively). (2) No surfaces-runtime slot — converting CRM would drop its `SurfaceRuntimeProvider` integration. (3) No segmented-control axis (CRM's People/Companies). Also: shell `archived` ≠ CRM `active|trash`. **2 and 3 are Arman's call** (shell grows them vs those surfaces stay bespoke).

### D139 — CRM scope counts fire `3 + N_orgs` round trips per keystroke (2026-08-09)

`fetchPartyScopeCounts` (`features/crm/service.ts:224`) + 200ms debounce in `usePartyList.ts:94`. Fix = one `crm_list_scope_counts` RPC (exemplars: `agx_list_scope_counts` / `trx_list_scope_counts`); falls out of the entity-list conversion (`docs/handoffs/inventory-law-sweep.md` § Wave 4) but is a live cost today.

### D138 — the sharing registry is a SECOND route authority, and it disagrees with itself (2026-08-09)

`platform.shareable_resource_registry.url_path_template` (mirrored in `utils/permissions/registry.ts`) contradicts `entityRegistry.hrefFor` and itself: `/quizzes/{id}` vs `/education/quizzes/{id}`, `/apps/{id}` (real: `/agent-apps/[id]`), `/canvas/{id}` (no route — D137), `/code/files/{id}`. Load-bearing: `shareLinks.ts`, `useOrgSharedItems.ts`, `OrgShareReviewCard`, `OrgResourceDetail` build user-facing links from it → live broken links. Fix: audit templates against `app/`, correct the DB rows, make sharing surfaces resolve via `entityRegistry`, retire `url_path_template` as a route source.

### D137 — `/canvas/{id}` has no route: four callsites link there, including email notifications (2026-08-09)

`app/(public)/canvas/` has only `discover/` and `shared/[token]/` — `/canvas` and `/canvas/{id}` 404. Callers: `ShareModalWindow.tsx:57,65`, `CanvasPeek.tsx:51`, `lib/email/notificationService.ts:229` (mailed to users). **Decide the canonical canvas record route** (Arman), then build the page or repoint all four. `canvas_item` deliberately has no `hrefFor` until then.

### D136 — `pnpm check:hatches` is red on main: baseline drifted, ratchet no longer ratchets (2026-08-08)

~1,200 hatches landed unfrozen (five categories above baseline, others far below), so every run fails regardless of the change. Audit the growth (or burn it down), then re-freeze with `pnpm check:hatches --update` as its own change.

### D135 — soft-deleting a row HARD-deletes its association edges; "Dismiss" is not reversible (2026-08-08)

`platform._gc_entity_associations` fires on UPDATE-to-deleted and hard-deletes all edges. On `web.page` this breaks the documented Dismiss/Restore + scraper-revive contract — edges gone, nothing rebuilds them. Fix: GC on hard DELETE only (readers already filter by the entity's `deleted_at`), or tombstone edges reversibly. Platform-wide trigger, conveyance semantics — **Arman's call**.

### D134 — `agx_list_scoped` org-grant branch: nondeterministic access_level (2026-08-08)

`DISTINCT ON (a.id)` with no ORDER BY; port the transcripts twin's shape (`migrations/trx_list_scoped.sql` org_shared subquery: `ORDER BY a.id, permission_level`). **Fix in flight 2026-08-12.**

### D133 (remainder) — no product path to move a site between organizations (2026-08-08)

The wording/membership halves are resolved (AccessGate; Arman's rulings on the outsider test account and the aimatrx.com site move). Open gap: moving a site between orgs took a hand-written transaction — a site-settings "Move to organization" action is worth building.

### D132 (remainder) — session-identity drift under long-lived tabs (2026-08-08 incident)

`AuthSessionWatcher` hard-stop shipped. Open: (a) preserve unsaved in-memory edits across the forced reload (local draft snapshot before blocking)? (b) escalate N consecutive autosave failures to a blocking editor banner; (c) convention: test-account logins use isolated profiles/incognito — document in the OAuth-verification plan.

### D131 — component tables still outside the COMPONENT-ACCESS membrane + two stale entity_types rows (2026-08-08)

`is_component` tables with bespoke policy families (extra lanes the component variant would drop) each need their own `db-canonicalize-table` pass: `files.analysis/entities/overrides/page_annotations/pages`, `docproc.processed_document_pages`, `transcripts.studio_documents/studio_recording_segments/studio_session_settings`, `workbench.udt_dataset_fields/udt_dataset_rows/udt_structured_list_items`, `pdf.redaction_mapping`, `workflow.node_data_slot`, `legal.wc_impairment_definition`, `runtime.global_execution*/work_item`. Also: `platform.entity_types` rows `component_group`/`field_component` point at dead tables; `agent.card` is a VIEW flagged `is_component` (misleading, harmless).

### D130 (remainder, aidream) — server held a stream socket open past terminal + 409 on conversation-start reservation (2026-08-06)

Client side fixed (terminal-settlement guard in `process-stream.ts`, screams via `agent-stream-terminal-guard`). Open: why aidream held the response open post-terminal, and the 409 on the stream reservation.

### D128 — MCP user connections dead since the vault cutover; connect flow unverified E2E (2026-08-06)

All 4 `tool.mcp_user_conn` rows `expired` with null `credential_item_id`; zero `source_kind='mcp_discovered'` tool rows ever — MCP connections have likely never worked in prod (legacy encryption GUC never configured). Fix: one full connect → discover → invoke loop against a real remote MCP server (aidream `/api/mcp-connections/*`), then fix what breaks. Also: OAuth-popup logic hand-copied ×3 (`IntegrationsSettingsPage.tsx`, `AgentToolsManager.tsx` ×2) — consolidate when touched. Twin entry in aidream.

### D127 — Google/MCP docs actively lie: phantom feature dir + mislabeled route group (2026-08-06)

`features/api-integrations/FEATURE.md` describes files that don't exist and a deleted execution path; CLAUDE.md calls `(popup)` "OAuth popup chrome" but it's an unused BroadcastChannel demo. Fix: rewrite the FEATURE.md as an index card, correct the CLAUDE.md row, decide whether `(popup)` becomes the branded OAuth-return page (see `docs/handoffs/google-oauth-product-build.md`) or gets deleted.

### D126 — 22 hand-rolled copies of the headless "launch agent → poll → extract JSON" loop (2026-08-04)

The canonical thunk (`execute-builtin-with-extraction.thunks.ts`) has ONE consumer; 22 files re-implement it inline (`features/education/**` ×13, `features/flashcards/**` ×5, `useKindRequest.ts`, `content-plan/setup/ai.ts`), each with its own timeout/poll/error/cleanup. Fix: one `useHeadlessAgentJson(agentId, variables)` hook over the thunk, then convert in per-feature batches with that feature's manual path exercised — never blind.

### D125 (remainder) — stale `platform.entity_types` rows silently denying access (2026-08-04)

13 of 18 fixed; drift guard shipped (`entity-registry-drift` in `pnpm check:schema`). Open, all `is_active=true`: `component_group`, `field_component`, `prompt` → tables in graveyard; `agent_user_kv` → table exists nowhere. De-register or repoint — **decides: Arman**. (`profile` row is inactive/harmless; delete when convenient.)

### D124 (remainder) — the external consumer of `lib/scheduler-client/claim.ts` hasn't picked up the claim_protocol fix (2026-08-04)

`claimTask` now stamps `metadata.claim_protocol=2` (lockstep with `matrx_scheduler/queries.py::CLAIM_PROTOCOL`), but it has no in-repo caller — the host that was failing is external; identify it and confirm its claims land.

### D123 — legacy `p_table_name` RPCs: CONFIRMED anonymous RLS bypass (contained 2026-08-04)

`public.dynamic_search` (SECURITY DEFINER, anon-EXECUTE) returned arbitrary `public` rows with only the publishable key — confirmed live. Contained: `REVOKE EXECUTE FROM anon, PUBLIC` on all 33 `p_table_name` functions + `FROM authenticated` on the 5 ungated definer ones; verified 42501. Open: (1) **audit for prior abuse** — nobody has checked; (2) **drop the whole family** (containment is a grant change; brief 8 of `docs/upgrades/type-debt/2026-07-01-fleet-briefs.md` already decided the tear-out); (3) the `relation "ai_model" does not exist` caller (~5,400 failed round-trips/day, every ~16s) is STILL unidentified and holds service_role or a direct connection — not this repo, not aidream; (4) watch for `42501 permission denied for function` regressions from the revokes. **Decides: Arman** (abuse audit + drop schedule).

### D122 (residuals) — partition exhaustion class guards (2026-08-04)

The 4-day platform freeze is fixed (`history_row_versions_partition_autoprovision.sql`: provisioner + 18-month runway + catch-all + pg_cron + alarm). Open: (1) a "time-bounded DDL about to expire" check in the release gates — nothing compares partition runway to `now()` (decides: anyone); (2) `public.agent_run`/`agent_run_stage` stale empty duplicates of `chat.*` — graveyard them (**chip fired 2026-08-12**); (3) a write-rate watchdog — four days of zero writes to 121 tables produced no alert (**decides: Arman**, ops scope).

### D121 — website-factory audit: 12 content-plan/CMS defects on a dispatch board (2026-07-30)

Board: [docs/handoffs/website-factory-bug-dispatch.md](docs/handoffs/website-factory-bug-dispatch.md) (WF-1…WF-12); vision gaps in `website-factory-vision.md`. Close when the board is empty. **Arman assigns; WF-1/2/3 are HIGH.**

### D119 — any EDITOR can flip a canonical entity's `visibility` (incl. to `public`) at the DB layer (2026-07-29)

`std_update` gates at editor for ALL columns; only the ShareModal UI is owner-gated — an editor-sharee can `PATCH visibility='public'` via PostgREST. Fix candidates: platform-wide column guard (visibility changes require owner/admin) in the canonical RLS pipeline. **Decides: Arman** (security posture, cross-cutting).

### D118 — conveying `working_document → conversation` edges let an editor-sharee re-share and amplify access (2026-07-29)

Editor-sharee B attaches owner A's doc to B's conversation and shares it → conveys up to EDITOR to third parties, invisible to A. Options: drop `conveys_max` to `viewer` for this pair, or require doc-OWNER for new conveying edges in `assoc_add`. **Decides: Arman** (access-architecture policy).

### D118b — invisible inbox injections may seed a phantom user bubble in-session (2026-07-29)

Server announces the persisted invisible steering row via `record_reserved cx_message`; `process-stream`'s `reserveMessage` fallback seeds it with no visibility flag → possible phantom bubble until reload. Fix: carry visibility on reservation metadata (server) or skip the reservation for announced invisible positions. Low frequency — no product UI sends these yet.

### D117 — `content_ir_kind_instance` registry row declares the visibility ENUM in the boolean `is_public_column` slot (2026-07-29)

Set `is_public_column=null` live + TS mirror + snapshot in one commit, then verify ShareModal's Public tab on a kind instance. **Fix in flight 2026-08-12.**

### D110 — stray Cloudflare Workers build is red on frontend releases (2026-07-27)

`Workers Builds: ai-matrx-admin` fails while Vercel is green; no Cloudflare config exists in the repo. **Decides: Arman** — retire the integration or configure it.

### D108 — seven historic feedback screenshots are permanently dead (2026-07-27)

`users.user_feedback.image_urls` has seven expired share-link pointers (404). Recover from backups if possible, else mark irrecoverable. New MCP writes already reject this URL class.

### D105b — file surfaces must separate MY files from ORG files (Arman ruling 2026-07-28)

`internal` default is correct and stays. The real defect: file lists don't separate yours vs the org's (Mine / My Orgs scope pattern). **Needs an architecture discussion with Arman before building.**

### D103 — legal vertical landings predate `ModuleLanding` (2026-07-26)

`LegalLanding.tsx` + `CaWcLanding.tsx` hand-duplicate `ModuleLanding`, unregistered, no nudges; `PdRatingsCalculatorLanding.tsx` has zero importers. Migrate + register via the `module-landing-pages` skill; delete the orphan. **Chip fired 2026-08-12.**

### D101 (remainder) — `agx_get_list` has no org scope; ~6 definer readers miss the soft-delete predicate (2026-07-25)

(1) org-teammate agents invisible in `agx_get_list` — belongs with retiring `/agents/all` onto `agx_list_scoped` once `/agents/browse` is ratified. (2) soft-delete predicate missing in `agx_get_shared_with_me`, `agx_get_shared_for_chat`, `get_agents_for_chat`, `agx_get_access_level`, `agx_duplicate_agent`, `agx_get_shortcuts_for_context*`, `agx_get_list_full` builtin arm — **fix in flight 2026-08-12**.

### D100 — three registered catalog entity types are ACL-invisible (2026-07-24)

`public.analysis_recipes`, `runtime.global_origin`, `scraper.sites`: no ownership/visibility columns, no `default_visibility` → `iam.has_access_for_base()` denies everyone. Latent. **Product call:** declare `default_visibility` or add ownership columns.

### D96 — aidream writes Univer document snapshots with no page geometry (2026-07-23)

`origin='agent'` rows carry `documentStyle: {}`; FE recovers loudly. Fix in aidream: stamp A4 geometry (mirror `features/data-tables/document-page-style.ts`) + backfill. **Chip fired 2026-08-12.**

### D92 — 38 dead RLS policies: policy exists, `authenticated` lacks the privilege (2026-07-23)

`pnpm check:access-drift` has the live list (`scraper.*`, `runtime.*`, `history.row_versions`, `seo.*`, `platform.*`, `iam.memberships`/`invitations`). Per cluster: decide audience, then GRANT or delete the dead policy.

### D93 — `rag.kg_chunks` reads statement-timeout for non-entitled users (2026-07-23)

Per-row SECURITY DEFINER policy functions over thousands of rows → denial-by-timeout. Hoist constant predicates to an initplan-friendly shape; optimize only against measured plans.

### D94 — `docproc.page_extraction_jobs.project_id` is a forbidden project FK (2026-07-23)

Nullable tagging variant, not load-bearing. Removing it end-to-end (column + FE + aidream model + backfill) is its own focused change.

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

### D67 — doctrine says "banned", ESLint says `warn`, with live violations (2026-07-18)

Browser dialogs (remaining only in `app/(dev)/demos` + admin official-components displays — **fix in flight 2026-08-12**, then promote `no-alert`/`no-restricted-globals` to error), barrel files (488 warnings), banned lucide brand icons (runtime-missing → 500s; `warn` is wrong). Each: finish cleanup + promote, or soften the doc.

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

One line per fix — title, date, pointer. History lives in git. Entries older than ~2 weeks get deleted.

- **D172** — `acceptPageUrlInput` scheme check made case-insensitive to match the scraper's `_normalise_url` (`5bdf85834`). 2026-08-12.
- **D166** — kind-activation guard + `set_kind_activation` genuinely exempt the service role; `activate-kinds.ts --apply` goes through the canonical RPC (`content_ir_activation_service_role_fix.sql`, `4f2804efa`). 2026-08-12.
- **D120** — `chart.tsx` typed against recharts 3.9, `@ts-nocheck` deleted (`409a98d2b`). 2026-08-12.
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
- **D133** — "site reads as deleted to non-members": AccessGate resolves the true state; aimatrx.com site moved to the shared org; outsider test account stays memberless by design. Remainder → D133 open entry. 2026-08-11.
- **D115** — in-session tool-viz repaint via `lib/invalidation/invalidation-registry.ts` (zero import edge between stream effects and heavy clusters; guarded by `tool-viz-repaint-invalidation.test.ts`). Known sibling not covered: `features/workflow-emit/emitRendererCache.ts`. 2026-08-09.
- **D116** — both bespoke stream renderers deleted; `adoptForeignStream` closes the pipeline-run gap; `matrx/no-bespoke-stream-renderer` lint shipped. ⚠️ Verification debt: written where `pnpm install` failed — needs type-check + live exercise of `/marketing/keyword-research` (tracked in `docs/handoffs/canonical-stream-and-surface-writeback.md`). 2026-07-29.
- **D124** — `claimTask` stamps `claim_protocol=2`. External-caller remainder → D124 open entry. 2026-08-04.
- **D125** — 13 stale entity_types rows repointed + `entity-registry-drift` guard. Graveyard-4 remainder → D125 open entry. 2026-08-04.
- **D130** — headless image-gen promise always settles on terminal (terminal-settlement guard in `process-stream.ts`). Server remainder → D130 open entry. 2026-08-08.
- **D64** — `ContainerResourceSheet` keyed derived-state refactor. 2026-08-09.
- **D106 / D106b** — BudgetMeter verdict headline; honest "Only you" copy on 4 surfaces. 2026-08-09.
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
