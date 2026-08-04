# FOUND DEFECTS — AI Matrx Admin (frontend)

The ledger of found bugs and gaps on the frontend. Twin of aidream's `FOUND_DEFECTS.md`.

**Rules**

- File only defects you can't fully fix in the moment, and only UNRELATED findings — a bug related to your current task gets **fixed**, not filed. Enough context to act cold: what, where, the fix.
- **When you fix one: collapse it to a one-line bullet in Resolved (title + date + commit/file pointer) — or delete it outright.** No histories, no verification narratives, no journeys. An entry earns lines only while it is open.
- Keep open entries compressed to load-bearing facts: what's broken, exact paths, the fix, who decides. A partially-fixed entry keeps only the open remainder.
- CLAUDE.md links here. Read both before touching files, media, or persistence.

---

## OPEN

### D122 — `history.row_versions` partition exhaustion froze 121 tables platform-wide for 4 days (2026-08-04) — FIXED, residual gaps open

`history.row_versions` is RANGE-partitioned on `occurred_at` with **hand-created** monthly partitions. The last ended `2026-08-01T00:00Z` and nothing created the next, so `platform._version_capture()` — a trigger on **121 versioned tables** — failed every INSERT/UPDATE/DELETE with `23514 no partition of relation "row_versions" found for row`. `files.files` last accepted a row at 2026-07-31 22:09; no file, note, task, transcript, flashcard set, membership, or `chat.agent_run` was written for four days. **Fixed** 2026-08-04: `migrations/history_row_versions_partition_autoprovision.sql` (provisioner fn + 18-month runway + `row_versions_default` catch-all + pg_cron `ensure-row-version-partitions` + a `system_error` alarm if the default is ever used).

**Residual, open:**
1. **No guard compares partition runway to `now()`.** `pnpm check:schema` / aidream's `db/schema_analysis` compare code-vs-DB *shape* and would not have caught this — the schema was correct, the *data range* was exhausted. A "time-bounded DDL about to expire" check belongs in the release gates. **Decides: anyone.**
2. **`public.agent_run` / `public.agent_run_stage` are stale empty duplicates** of the live `chat.*` tables (moved by `agent_run_canon_02_move_to_chat.sql`, 2026-06-28) and are still generated into `db/models/public.py` in aidream. Graveyard them (`db-graveyard-table` skill). **Decides: anyone.**
3. **Nothing alarms on "a whole table stopped receiving writes."** Four days of total write failure produced `request_crash` rows and user-visible toasts but no alert. A write-rate watchdog over the busiest tables is the second layer. **Decides: Arman** (ops scope).

### D121 — website-factory audit: 12 content-plan/CMS defects on a dispatch board (2026-07-30)

The 2026-07-30 content-plan/CMS readiness audit found 12 defects — renderer ignoring `theme_config` (my-matrx), plan statuses blind to CMS publishes (1 node "published" vs 42 live pages), FE CMS writes bypassing `matrx-content-guard`, nondeterministic duplicate header/footer render, agent-only capabilities with no human UI (starter kit, header/footer toggles, theme/nav/footer editing), the never-exercised `plan.cms_fill_job` queue with no chaos test, and doc drift. Each is a self-contained assignment with status tracking in [docs/handoffs/website-factory-bug-dispatch.md](docs/handoffs/website-factory-bug-dispatch.md) (WF-1…WF-12); vision-level gaps live in [docs/handoffs/website-factory-vision.md](docs/handoffs/website-factory-vision.md). Close this entry when the board is empty. **Decides: Arman assigns; WF-1/WF-2/WF-3 are HIGH.**

### D120 — `components/ui/chart.tsx` is `// @ts-nocheck` (2026-07-30)

The shadcn-style recharts wrapper (`ChartContainer`/`ChartTooltipContent`/…) opts its whole file out of the type gate in a repo whose CLAUDE.md forbids `any`. Consumers (cx-dashboard usage charts, education StudyTrends, flashcard perf) build on untyped props with zero drift detection. Fix: type the wrapper against recharts ^3.9's real types (its payload generics are the usual pain point) and delete the pragma; new chart surfaces should meanwhile type recharts directly (the Search Console `PerformanceChart` does — use it as the reference) rather than deepening this wrapper. **Decides: anyone.**

### D119 — any EDITOR can flip a canonical entity's `visibility` (incl. to `public`) at the DB layer (2026-07-29)

`std_update` RLS on canonical tables (verified on `workbench.working_documents`) gates UPDATE at `editor` for ALL columns — `visibility` included. Only the ShareModal UI is owner-gated; an editor-sharee can `PATCH ... SET visibility='public'` via PostgREST directly, exposing the row to every authenticated user. `setVisibilityColumn`'s "owner-only writes are enforced by RLS" comment (`utils/permissions/service.ts`) is false for std-variant tables. Fix candidates: a column-level trigger/guard (visibility changes require owner or admin-level access) applied per the canonical RLS pipeline, platform-wide — not per table. Surfaced by the working-document sharing work but applies to every std entity-variant table. **Decides: Arman** (security posture change, cross-cutting).

### D118 — conveying `working_document → conversation` edges let an editor-sharee re-share and amplify access (2026-07-29)

The edge is access-conveying (`container_side='target'`, `conveys_max='editor'`). An editor-sharee B who attaches owner A's document to B's own conversation and shares that conversation conveys up to EDITOR on A's document to third parties — invisible to A, and at odds with the sharing invariant that non-owners cannot re-share. First became reachable when cross-user attach shipped (2026-07-29); the FE now blocks the doomed *viewer* attach path, but *editor* attach conveyance is by-design DB behavior. Options: drop `conveys_max` to `viewer` for this pair, or require doc-OWNER (not editor) for new conveying edges in `assoc_add`. **Decides: Arman** (access-architecture policy; cross-repo doc `common-docs/systems/access-architecture/FEATURE.md`).

### D117 — `content_ir_kind_instance` registry row declares the `visibility` enum in the boolean `is_public_column` slot (2026-07-29)

`platform.shareable_resource_registry.content_ir_kind_instance` has `is_public_column='visibility'` — but that column holds the canonical `platform.visibility` ENUM, not a boolean. A non-null `is_public_column` routes ShareModal's public toggle through `make_resource_public` (boolean write) instead of the canonical `setVisibilityColumn` enum path, and `getResourceVisibility` will read the enum string as a boolean. Fix: set `is_public_column=null` in the live registry + TS mirror + snapshot together (the canonical-visibility shape), then verify ShareModal's Public tab against a kind instance. Found while regenerating the snapshot (which had drifted 6 rows behind the live DB); mirrored verbatim for parity in the meantime. **Decides: anyone — small, but touch all three surfaces in one commit.**

### D118 — invisible inbox injections (`is_visible_to_user=false`) may seed a phantom user bubble in-session (2026-07-29)

The Turn-Boundary Inbox client (Flow 6 in `features/agents/components/chat/FEATURE.md`) correctly skips the optimistic bubble for invisible steering messages, but the server still announces the persisted row via `record_reserved cx_message` (role=user), and `process-stream`'s fallback branch (`reserveMessage`) seeds it into `messages.byId` with no visibility flag — a possible empty/phantom bubble until reload (reload filters by `is_visible_to_user`). Fix: carry visibility on the reservation metadata (server) or track announced invisible injection positions in `process-stream` and skip the reservation. Low frequency — invisible injections are only produced by `kind:"system_message"` + `is_visible_to_user:false`, which no product UI sends yet.

### D116 — RESOLVED 2026-07-29: both bespoke stream renderers deleted, gap closed, lint enforced

Both callers are gone and the reason they existed is fixed:

1. `LiveResearchFeed.tsx` — **deleted.** `useKeywordResearch` now ADOPTS the server-orchestrated pipeline stream into `activeRequests` via the new `adoptForeignStream` thunk + `callApi`'s `consumeStream` option, and both surfaces render `<MarkdownStream requestId />`.
2. flashcards `CreateFromTopic` fallback session — **deleted.** `selectKindEnvelope` stands alone.

The root cause was a real platform gap, not carelessness: `activeRequests` (which every canonical read is keyed on) was fillable ONLY by `executeInstance`, so a run orchestrated server-side inside a pipeline endpoint had no `requestId` and literally could not render canonically. That is what `adoptForeignStream` fixes; aidream's `stream_agent_as_blocks` is the server twin (pipeline runs now emit `render_block` events with envelopes, not bare chunks).

The owed lint rule shipped: **`matrx/no-bespoke-stream-renderer`** (ESLint, error) fences `useLiveJsonRegion` / `openParseSession` to `features/content-ir/`.

⚠️ **Verification debt (carried, not closed):** the work was written in an environment where `pnpm install` fails (`codeload.github.com` 403 through the proxy), so it is **neither type-checked nor browser-verified**. Before this is trusted: `pnpm type-check`, then exercise `/marketing/keyword-research` and the Keyword Intelligence research tab live. Tracked in `docs/handoffs/canonical-stream-and-surface-writeback.md`.

### D115 — in-session tool-viz repaint REVERTED (build detonator) — reimplement without the import edge (2026-07-28)

The v0.4.198/199 repaint pair (`165034fb8` toolStateEffects kind-components effect; `6a74e4ddc` DB tool-renderer repaint: `DbToolRendererImpl` version consumer, `toolRendererCache` invalidation, `useToolRendererVersion`) was bisect-proven to cost **+14.3GB peak build RSS (35.4→49.7GB local) and +50-57% compile time**, which OOM-killed every Vercel build v0.4.199-210; reverted in v0.4.212 (probes: 211/212, local A/B in worktrees). Mechanism: the effect's `await import()` of `@/features/content-ir/registry/component-registry` (and `dbKindComponentCache`) from `toolStateEffects.ts` — a module statically reachable via `process-stream.ts` from ~every context — split the giant content-ir registry cluster (which carries a documented eager-init CYCLE) into new async chunk groups per context. THE FRAGMENTATION LAW, `await import()` edition: the sanctioned handler-body dynamic import still detonates when the target graph is enormous AND the importer is ubiquitous. **Fix pattern: invert the dependency** — content-ir registers an invalidation callback into a tiny shared registry at its own init (it is always initialized wherever a `__kind` block can render); `toolStateEffects` fires the callback by name with zero import edge to content-ir. The user-facing bugs these fixed (stale compiled kind component / stale DB tool renderer until hard refresh) are LIVE AGAIN until reimplemented.

### D110 — stray or broken Cloudflare Workers build is red on frontend releases (2026-07-27)

GitHub check `Workers Builds: ai-matrx-admin` fails on release commits while Vercel is green and serving. No Wrangler/Cloudflare config exists in the repo; the check comes from an external Cloudflare integration. **Decides: Arman** — retire the integration, or configure the deployment it expects.

### D108 — seven historic feedback screenshots are permanently dead (2026-07-27)

`users.user_feedback.image_urls` has seven expired `…/share/<uuid>/download` pointers (404 `share_link_invalid`). New MCP writes already reject this URL class. Fix: recover originals from backups if possible and replace with CDN URLs; otherwise mark irrecoverable.

### D106 (remainder) — research context builder: replace the token-budget number (2026-07-26)

Items 1-3 (save/load drift) fixed 2026-07-28. Remaining: replace the token-budget number with a green/yellow/red indicator + warnings — the user needs "fine / getting heavy / too much", not a count.

### D106b — five more surfaces still claim "Only you" from data that can't support it (2026-07-26)

Same class as the files fix (`22e8d79ea`): a surface reads one signal and renders a privacy guarantee, blind to container conveyance via `platform.reachability`. Fix per surface: call `public.entity_access_summary(type,id)` or reword to what the surface actually knows. Don't bulk-rewrite blind — check each feature's conveyance first.

- `features/secrets/components/VaultItemDetail.tsx:1406` (highest stakes — credentials)
- `features/canvas/social/CanvasShareSheet.tsx:373`
- `features/structured-lists/StructuredListManagerV2.tsx:139`
- `features/content-ir/studio/components/ShapeOwnerEditor.tsx:40`
- `features/education/data/features.ts:236` (marketing promise — resolve with D105)

### D105b — file surfaces must separate MY files from ORG files (Arman ruling 2026-07-28)

RULED: `internal` default is correct and stays — files are org collaboration data by design; never propose flipping visibility defaults. The real defect is architectural: file list pages don't cleanly separate files that are YOURS from files that belong to the ORGANIZATION (the Mine / My Orgs scope pattern from the canonical entry list). Needs an architecture discussion with Arman before building; do not restyle privacy labels as a substitute.

### D103 — legal vertical landings predate `ModuleLanding`; PD calculator has no guest landing (2026-07-26)

`features/legal/components/landing/LegalLanding.tsx` + `wc/components/landing/CaWcLanding.tsx` (~900 lines) hand-duplicate `ModuleLanding`, aren't in `MODULE_LANDING_DIRECTORY`, get no conversion nudges. Migrate both onto `ModuleLanding` + register. Also: `PdRatingsCalculatorLanding.tsx` (331 lines, zero importers) — wire in via the `module-landing-pages` skill or delete.

### D101 (partial) — `agx_get_list` has no org scope; the delete path is a HARD delete (2026-07-25)

Soft-delete predicate fixed on both gallery readers; the hard-delete path became a soft delete (`deleted_at`) 2026-07-28. Remaining: (1) org-teammate agents invisible in `agx_get_list` — belongs with retiring `/agents/all` onto `agx_list_scoped` once `/agents/browse` is ratified; (2) ~6 more SECURITY DEFINER readers of `agent.definition` share the missing soft-delete predicate (`agx_get_shared_with_me`, `agx_get_shared_for_chat`, `get_agents_for_chat`, `agx_get_access_level`, `agx_duplicate_agent`, `agx_get_shortcuts_for_context*`, `agx_get_list_full` builtin arm).

### D100 — three registered catalog entity types are ACL-invisible (2026-07-24)

`public.analysis_recipes`, `runtime.global_origin`, `scraper.sites` have no ownership/visibility columns and no `default_visibility`, so `iam.has_access_for_base()` denies everyone and no `assoc_add` edge can target them. Latent (no live callers). **Product call**: declare `default_visibility` (`public` for catalogs, `internal` for org-scoped) or add ownership columns.

### D96 — aidream writes Univer document snapshots with no page geometry (2026-07-23)

`workbench.udt_document_snapshots` rows with `origin='agent'` carry `documentStyle: {}` → no wrap, no scroll. FE recovers loudly (`sanitizeUniverDocSnapshot#restorePageStyle`), but the writer bug lives in aidream: stamp A4 geometry (mirror `features/data-tables/document-page-style.ts`), then backfill existing `{}` snapshots.

### D92 — 38 dead RLS policies: policy exists, `authenticated` lacks the privilege (2026-07-23)

Run `pnpm check:access-drift` for the live list (clusters: `scraper.*`, `runtime.*`, `history.row_versions`, `seo.*`, assorted `platform.*`, `iam.memberships`/`invitations`). Fix per cluster: decide intended audience, then `GRANT USAGE`/`GRANT SELECT` (or delete the dead policy). Intentional deny-alls are allowlisted in `scripts/access-matrix/check-access-drift.ts`.

### D93 — `rag.kg_chunks` reads statement-timeout for non-entitled users (perf class) (2026-07-23)

Per-row SECURITY DEFINER policy functions evaluate over thousands of candidate rows before RLS concludes zero. Denial-by-timeout burns a full statement budget and looks like an outage. Fix: hoist the constant `(source_kind, source_id)` predicates to a LATERAL/initplan-friendly shape or per-source materialized visibility check; optimize only against measured plans.

### D94 — `docproc.page_extraction_jobs.project_id` is a project FK on a feature table (forbidden pattern) (2026-07-23)

Nullable tagging-column variant, not load-bearing (auth gates never read it). Removing it end-to-end (column + FE types/forms + aidream model + edge backfill) is its own focused change.

### D88 — service-role RPCs accept raw p_user_id with no internal actor guard (2026-07-23)

`public.get_mcp_credentials` (returns decrypted MCP tokens) and `public.get_user_form_context` are safe only because EXECUTE is service-role-only — one re-grant away from a D86-class actor-spoof hole. `get_mcp_credentials` dies with vault Phase 4; until then add an internal guard (`auth.uid()` null/service or equal `p_user_id`).

### D85 — CROSS-REPO (aidream): concurrent child agents share ONE emitter turn-text accumulator (2026-07-23)

**Owner: aidream. Symptom fixed; root cause latent.** Podcast feature-image agents now run isolated (`suppress_stream=True`) with a `_is_media_url` guard, but every concurrent fan-out platform-wide shares the emitter's `_turn_text_acc` and can cross-contaminate captured `.output`. Durable fix: per-child emitter isolation in `fork_for_child_agent`.

### D84 — live Supabase security-advisor baseline contains unrelated errors (2026-07-22)

Pre-existing `security_definer_view` errors + RLS-disabled exposed tables (e.g. `public.full_spectrum_positions`, `files.structure`, `workflow.worker_heartbeat`). Needs an owner-by-owner audit before the advisor can be a clean release gate.

### D81 (remainder) — two inline mic level-meter copies left (2026-07-22)

Canonical core now `features/audio/streamLevelMeter.ts` (+ `useStreamAudioLevel`); 3 of 5 modules ported 2026-07-28. Remaining: `useSimpleRecorder.ts` and `voice-agent/audio/audioCapture.ts` — analyser lifecycle entangled with recording teardown; port carefully, one per change, verifying the meter still moves.

### D80 — stale agent records report full `_loadedFields` with EMPTY `variableDefinitions` (2026-07-22)

Persisted/rehydrated agentDefinition records predate live edits, `isReady` short-circuits the refetch, and model settings/context slots/variable panel render stale. (Caller-injected runtime variables now pass through unconditionally, so execution is correct.) Fix candidates: treat rehydrated records as never `isReady`; stamp `_loadedFields` with `updatedAt` and refetch when the live row is newer; or always `fetchAgentExecutionFull` on launch. **Decides: Arman** (persistence strategy).

### D79 — CRITICAL: direct project FKs make feature rows project-dependent; research decoupling in flight (2026-07-21)

Frontend cutover DONE (project-optional `createTopic`, association-backed filtering, no path writes `project_id`); Phase-0 migration live. Remaining: aidream Phase-3 cutover + deploy, Phase-4 column drop/scope migration, the aidream release guard, live acceptance matrix. System of record: `common-docs/projects/research-project-decoupling/FEATURE.md`. Keep until then.

### D78 — CRITICAL: legacy `platform._mirror_fk_to_assoc` triggers remain live (2026-07-21)

Research's `_mirror_proj` trigger dropped (ratchet baseline 32 remain platform-wide). FE alarm layer shipped (`lib/diagnostics/errorTierRules.ts` pins any firing as permanent critical). Remaining: the aidream release guard (strict tier + 32-ratchet) and live verification of the induced-failure inspector flow.

### D74 — `web.link_edge.http_status` is NEVER populated: no broken-link detection exists (2026-07-20)

All 10,676 rows null. FE is ready (link graph, External view, HTTP column). Fix lives in the scraper (matrx-scraper/aidream): post-crawl link-check pass writing `http_status` back. Relay prompt handed to Arman 2026-07-20.

### D73 — Folder picking needs a canonical story (2026-07-20)

File-picker consolidation done; `FolderPicker`/`SaveAsDialog` still use the old `PickerShell` dialog. Decide: extend `FilesResourcePicker` with folder-select mode or keep a dedicated folder surface, then retire `PickerShell`.

### D114 — ROTATE exposed provider keys + prune NEXT_PUBLIC secret env vars. Arman action (2026-07-28)

The D113 fix stops NEW bundles from carrying keys, but past production bundles shipped `NEXT_PUBLIC_CARTESIA_API_KEY` and `NEXT_PUBLIC_OPENAI_API_KEY` — treat both as compromised and **rotate them at the provider**, then set the Cartesia key as server-only `CARTESIA_API_KEY` (already read by `/api/cartesia*`). Also prune the ~20 unreferenced `NEXT_PUBLIC_*` secret env vars in `.env.local`/Vercel (Anthropic, Gemini, Groq, Deepgram, Replicate, Stability, Cerebras, Fireworks, xAI, GetImg, ModelLabs, News, Comfy, Deploy, Picovoice, Stream secret, TensorDock, Unsplash secret) — unreferenced code can't bundle them, but the naming invites the next leak; rename server-side ones without the prefix, delete dead ones.

### D76 — app-wide: "state update on a component that hasn't mounted yet" on `/scraper` and `/` (2026-07-19)

Unattributed; spans routes sharing only providers/shell. Needs a live repro with the component stack. Cross-reference D61 (same warning on `/chat` streams, suspect render-time side-effect in the db-component compile path) — if the root cause is shared, fix once and close both.

### D61 — /chat streams warn "state update on a component that hasn't mounted yet" (2026-07-18)

See D76. Suspect: `getOrCompileDbKindComponent` called during render with a module-store cache. Needs attribution via dev overlay component stack.

### D82b — CROSS-REPO (aidream): education/flashcard podcast runs publish "Untitled Episode" (2026-07-22)

**Owner: aidream.** (1) Empty title treated as success — derive a title when the agent omits one; never persist `title=''`. (2) `buildDeckOverviewRequest` sends `max_images: 0` yet episodes publish to the public show — **decides: Arman**: give deck overviews a cover or keep them out of the show. Reproduces on the next flashcard→podcast run.

### D83 — `pc_episodes.duration_seconds` null on 44 of 48 episodes (2026-07-22)

aidream never writes it; lists/RSS can't show runtimes (player recovers client-side per fetched file only). Fix in aidream at publish time; backfill needs per-file probing.

### D67 — doctrine says "banned", ESLint says `warn`, with live violations (2026-07-18)

Browser dialogs (`no-alert` etc., ~20 live in app-builder + demos), barrel files (488 warnings), banned lucide brand icons (runtime-missing → 500s; `warn` is the wrong severity). Each needs: finish cleanup and promote to `error`, or soften the doc. Don't leave doc and rule disagreeing.

### D60 — chat draft transfer never lands for VARIABLE-INPUT agents (2026-07-17)

Plain-agent path fixed. For agents with launch variables/broker inputs (repro: agent `a2525cd3`) the stash is consumed but the smart-input stays empty — suspect the variable-bearing input binds text differently or the instance is recreated on variable hydration. Also: `setUserInputText`'s `if (!entry) return;` is a silent drop — should scream.

### D59 — CRITICAL: follow-up turns must CONFIRM identity-context changes with the user (2026-07-15)

Context (`organization_id`, `project_id`, `task_id`, `scope_ids`, agent identity) must not silently drift between turns. Today: console warn + BE stream warning only — neither blocks nor confirms. Required: FE compares previous vs current and prompts the user. **Owner: Arman** (confirm UX). Twin entry in aidream.

### D58 (remainder) — Stripe Connect built + live; Arman dashboard actions remain (2026-07-15)

The stub is DELETED live (verified 2026-07-28); real path shipped `584eb5941`: Checkout destination-charge (80/20 split) → signature-verified webhook → service-role `edu_class_confer_purchase` (+ refund/dispute revoke). **Blocked on Arman:** (1) enable Stripe Connect on the platform account; (2) set `STRIPE_WEBHOOK_SECRET` + register `/api/stripe/webhook` in the dashboard; then one test-mode purchase E2E.

### D57 — COPPA gate: only the LEGAL policy calls remain (2026-07-15)

All code layers done (client fail-closed, server-side enforcement in aidream, `age_band` write-tamper trigger + audit). **Open (Arman/legal):** (1) self-declared age — hard-block the `under_13→adult` transition vs allow-audited (currently audited + `review_signal`); (2) verifiable-consent method per COPPA §312.5. See `COPPA_VERIFIABLE_CONSENT_RUNBOOK.md` §1.

### D53 — `files.matrxserver.com` CORS blocks local browser uploads; fix published, deploy pending (2026-07-14)

`matrx-files==0.1.10` fixes CORS; remaining: deploy to the EC2 service (AWS SSO was expired). Live recheck still 405/no-ACAO until the container swap.

### D51 — vision-variant path collision fixed in aidream; pending prod release (2026-07-14)

Root cause: variant paths lacked master-file identity, so all grade-flow uploads collapsed onto one cached variant. Fixed in aidream `8d9513e8a` (master-scoped path + loud `derived_from` guard), verified on dev. Ships with the next aidream release.

### D35 — `platform.association_types` PK forbids what the pair+label index exists to allow (2026-07-09)

**Decides: Arman.** Latent (0 labeled rows). (A) per-label rules wanted → surrogate uuid PK, 3-col index becomes the key (needs aidream ORM regen); (B) not wanted → drop the 3-col index + label field + amend the reachability doc. Never `label NOT NULL DEFAULT ''`.

---

## Pending Arman review

**Proposed promotion (2026-07-19):** none outstanding — D72 (the prior P0 proposal) was fixed 2026-07-28.

---

## Rejected

_One line each: `- D## — <short reason> — <date> — delete when: <condition>`_

---

## RESOLVED

One line per fix — title, date, pointer. History lives in git.

- **D113** — no Cartesia key in the browser: ONE token primitive (`lib/cartesia/accessToken.ts` — lazy, cached, dedupe, refresh-retry-once) + ONE ws connector (`connection.ts`); all 8 hooks/adapters ported; voices list/clone/create moved to authed server routes (`/api/cartesia/voices*`); raw-key `client.ts`/`tts-service.ts`/`AudioPlayground` deleted; `NEXT_PUBLIC_OPENAI_API_KEY`/`NEXT_PUBLIC_GOOGLE_API_KEY` bundle refs also removed. Rotation = D114. 2026-07-28.
- **D107** — closed by Arman's attribution: the OOM fix was eliminating bad edge lazy imports (v0.4.137 revert), NOT the memory ceiling; `turbopackMemoryLimit` restored to 40GiB. 2026-07-28.
- **D104** — shared `PublicFooter` (Privacy/Terms/Contact) mounted in `(public)/layout.tsx` + `app/page.tsx` (`components/matrx/PublicFooter.tsx`). 2026-07-28.
- **D106.1-3** — research context builder save/load drift: `parseBindings` round-trips `delivery`+`strategy`; agent selection lifted + persisted (`features/research/service/resources.ts`, `ContextBuilder.tsx`). 2026-07-28.
- **D101.2** — agent delete is now a soft delete (`deleted_at`) in `agent-definition/thunks.ts`. 2026-07-28.
- **D81 (3/5)** — level-meter core extracted to `features/audio/streamLevelMeter.ts`; MediaDevicesPanel, useChunkedRecordAndTranscribe, continuousCapture ported. 2026-07-28.
- **D74b** — Cartesia voices list unwraps the paginated envelope via direct versioned REST (`lib/cartesia/cartesiaUtils.ts`); real error surfaced in the toast. Key exposure filed as D113. 2026-07-28.
- **D70** — every React Flow surface behind ONE dynamic gate (rag viz + schema-visualizer shells → `*Impl`); `reactFlowStaticImportBan` comment corrected. 2026-07-28.
- **D66** — `app/(dev)/**` un-excluded from the type gate; all dev-route errors fixed properly; full repo green. 2026-07-28.
- **D64/D65** — RATIFIED by Arman: "scream loud, never stop the build" — `ignoreBuildErrors` stays (annotated), `pnpm type-check` added to the advisory release gates so every release screams. 2026-07-28.
- **D112** — canonical list title cells are now real `next/link`s (keyboard/SR/middle-click) via `MatrxColumnDef.href` in `MatrxDataTable`; agents-browse + CRM columns wired. 2026-07-28.
- **D102** — `callApi` now surfaces server `user_message`/`message`/`details[].message` instead of bare "HTTP 422" (`lib/api/call-api.ts`). 2026-07-28.
- **D97** — Univer autosave filtered to `CommandType.MUTATION` (+ denylist); scrolling no longer writes snapshots — `DocumentEditor.tsx`, `WorkbookEditor.tsx`, shared `isSnapshotMutation.ts`. 2026-07-28.
- **D99** — `useEpisodeArticles` render-phase ref write + sync setState-in-effect refactored; lint clean. 2026-07-28.
- **D98** — `OutputsStudio` loading derived from fetch lifecycle; banned `Sparkles` replaced; stale disables removed. 2026-07-28.
- **D75** — transcripts sidebar nested `<button>` → `role="button"` div with keyboard handlers (`TranscriptsSidebar.tsx`). 2026-07-28.
- **D73c** — /artifacts stuck `isNavigating` spinner: pathname-reset + 6s fallback + unified `handleNavigate` (`CmsArtifactList.tsx`). 2026-07-28.
- **D72** — /files row-click share race closed: hidden toolbars get `pointer-events-none`, row onClick ignores `[data-row-actions]` targets (`FileTableRow.tsx`). 2026-07-28.
- **D68** — OverlayController ESLint override now `error` and re-lists all 13 global ban groups. 2026-07-28.
- **D69** — `features/files/**` gets `no-restricted-imports: off` (ring-fence targets outside consumers). 2026-07-28.
- **D109** — `TEMP_SKIP_RELEASE_CHECKS` no longer exists anywhere (repo, env, shell rc); release gates run normally. Verified 2026-07-28.
- **D82** — (1) v1 paginated RPC SQL injection fixed with bound params (`migrations/get_user_table_data_paginated_v1_injection_fix.sql`); (2) `get_user_feed` actor guard 2026-07-25; (3) dead prompt branches dropped from `get_version_history` + dead `features/versioning` deleted (`migrations/get_version_history_drop_dead_prompt_branches.sql`). 2026-07-28.
- **D71** — retired `rag_search` name gone from live SQL; `platform.entity_types.data_store` note updated to `knowledge_search`. 2026-07-28.
- **D111** — `web.page.canonical_page_id` added to `PAGE_COLUMNS`; `createManualPage` mints the id (`features/marketing/data/service.ts`). 2026-07-27.
- **D73-feedback** — external MCP submission no longer requires `agent_id` (`app/api/mcp/[transport]/route.ts`). 2026-07-27.
- **D104b** — research condensed export type-check fixed; duplicate snippet normalizer deleted. 2026-07-25.
- **D103b** — production build OOM from unused admin TS-error analyzer: route deleted, `pnpm capture-errors` CLI replaces it. 2026-07-25.
- **D95** — SEO command results now a discriminated union end-to-end (aidream `SeoCommandResult` + `result_kind`); FE inline casts killed. 2026-07-23.
- **D89** — `rag.fn_data_store_members_rich` admits grant readers (`migrations/data_store_members_rich_grant_reader.sql`). 2026-07-23.
- **D87** — plaintext secret columns ruled per-column: `byok_secret_key` holds env-var names (CHECK-guarded), `files.webhooks.secret` DB-plaintext by design, `workflow.trigger.webhook_secret` Fernet-encrypted (aidream `0242`). 2026-07-23.
- **D86** — `industry_*` RPC actor-spoof + anon EXECUTE fixed (`migrations/industry_rpc_actor_spoof_fix.sql`). Class rule: session identity always wins over an actor param. 2026-07-23.
- **D77** — dead `podcast-assets` bucket refs healed; dead-media episodes soft-deleted. Standing gap: nothing re-audits media refs post-write. 2026-07-22.
- **D62** — React Compiler re-enabled with A/B proof (+13% build). 2026-07-18.
- **D63** — doc-vs-config drift sweep: `pnpm check:doc-claims` built; 485 files un-excluded from the type gate; `removeConsole` restored; 28 skills migrated. 2026-07-18.
- **D41-audio** — batch STT/TTS on authenticated catalog aliases, typed responses, durable media. 2026-07-15.
- **D36** — dynamic-route soft 404s fixed in production (`3cb3a011f`, `d3214f473`). 2026-07-15.
- **D32** — 500-page PDF scale set shipped (virtualized Studio, resumable clean, lazy ZIPs). 2026-07-08.
- **D60-org** — atomic `org_create` (org + owner in one tx); direct INSERT revoked (`20260715060000`). 2026-07-15.
- **D48** — FE cold-registry gate removed; aidream is the model-resolution authority. 2026-07-16.
- **D59-scopes** — scope/scope-type soft delete restored with owner/admin ACLs (`20260715054500`). 2026-07-15.
- **D2** — canonical membership/invitation privilege escalation closed (`20260715053000-53100`). 2026-07-15.
- **D47** — Image Studio 404 affordances gated by one backend-capability registry. 2026-07-15.
- **D31** — SECURITY DEFINER caller-identity audit closed across all PostgREST-exposed schemas (`20260715042550-050602`). 2026-07-15.
- **D50** — full repo TypeScript green (616 diagnostics eliminated). 2026-07-15.
- **D12** — `selectContextPayload` preserves primitive context labels/types. 2026-07-07.
- **D47-notes** — /notes rich-document actions restored (`NotesView.tsx`). 2026-07-14.
- **D3** — Agent Find Usages + Drift live (prod registry/report/scan, weekly runs). 2026-07-15.
- **D9** — agent working-document edits stream via `context_delta` (8 regression tests). 2026-07-08.
- **D54** — anon NULL-uid bypass in `edu_class_*`/`creator_*` RPCs closed (`migrations/edu_class_anon_null_bypass_fix.sql`). 2026-07-15.
- **D55** — invalid errcode `'NO_DATA_FOUND'` → `'P0002'` (`migrations/edu_class_state_errcode_fix.sql`). 2026-07-15.
- **D56** — `edu_class_roster` peer-email leak: emails nulled for non-owners, `display_name` added (`migrations/edu_class_roster_member_email_privacy.sql`). 2026-07-15.
- **D52** — guardian-link email-enumeration oracle closed + 8/min rate limit (`migrations/edu_guardian_link_d52_enumeration_ratelimit.sql`). 2026-07-15.
- **D49** — canvas materialized tasks/structured_info artifacts self-load via `useCanvasItem` (`cecd46a51`, `5f8d577ee`). 2026-07-13.
- **D46** — draft-transcript auto-label 404: `/api/content-label` → contract-bound `/content-label`. 2026-07-12.
- **D45** — folder rename/move silent no-op: `updateFolder` sends `folder_path`; contract-derived request types (`74942304f`). 2026-07-12.
- **D45-mobile** — mobile flashcard cloze/matching rendering (`4bf7958d5`+). 2026-07-12; re-verified 07-13.
- **D44** — RAG hand-mirrored types derive from `components["schemas"]` (`5329ff502`+). 2026-07-12.
- **D33** — html-preview save-back + content-actions `onSave` chain fixed E2E (`3ccdaae1a`+). 2026-07-12.
- **D14** — war-room recording tab-switch + per-session transcripts verified; stale-key prune fixed (`6bcab5a21`). 2026-07-12.
- **D15-primitives** — generic `file_read` tool + `source_ids` RAG filter live (aidream `4769866cc`). 2026-07-12.
- **D19-items** — audit_bridge `actor_id`, webhook redeliver, `latency_ms` shipped. 2026-07-12.
- **D34-api** — `api_class` tear-out gaps closed; silent-drop sweep promoted to TASK-003. 2026-07-12.
- **D42** — aidream persistence-barrier outage (`Model name 'Users' is ambiguous`) fixed + deployed (`61d5c60b2`). 2026-07-12.
- **D40** — Gemini TTS param-shaping regression fixed (aidream v0.1.544) + concurrent sub-agent `request_id` memo race fixed (v0.1.545); podcast audio E2E verified. 2026-07-14.
- **D43** — app-builder retired-RPC family reimplemented client-side over `graveyardDb`. 2026-07-11.
- **D39** — `model_provider`→`provider_id` stale consumers fixed (aidream `3d3105cb3`; `migrations/ssr_shell_models_provider_id_fix.sql`). 2026-07-11.
- **D37** — cross-account flashcard decks readable via visibility-aware `assoc_members_visible` RPC. 2026-07-10.
- **D38** — `learn_doc` registry `is_public_column` enum-as-boolean nulled (`migrations/p7_fix_learn_doc_registry_is_public_column.sql`). 2026-07-10.
- **D34-dev** — `opengraph-image.tsx` under catch-all moved to a route handler (`9461f3b52`). 2026-07-07.
- **D28** — `study_record_attempt` NULL-result branch fixed live. 2026-07-07.
- **D27** — phantom association tokens: `normalizeEntityToken()` chokepoint + canonical reads. 2026-07-07.
- **D26** — working-document legacy columns dropped; `conversation_documents` graveyarded. 2026-07-02.
- **D25-menus** — content-block insertion restored on all 4 surfaces via v3 `EditableContextMenu`. 2026-07-07.
- **D22** — auth open-redirect + spoofable `x-forwarded-host` closed (`utils/auth/safe-redirect.ts`). 2026-07-07.
- **D30** — shareable-resource TS mirror regenerated from the registry; legacy grant rows backfilled. 2026-07-07.
- **R3** — soft-delete in authenticated RLS removed (`iam.apply_rls` v2). Standing rule: authenticated RLS = authorization only; readers filter `deleted_at` themselves (`docs/official/db-rules.md`). 2026-07-04.
- **D16** — composer draft false-alarm scream + unified send (`a3dfe59d2`). 2026-07-02.
- **D11** — per-turn context chips read frozen `model_context` snapshots. Standing rule: historical record components read frozen snapshots, never live slices. 2026-06-29.
- **D8** — item-presentation detailSources repointed to live schemas (`6769af0c6`). 2026-06-29.
- **D24** — no-op `contentHistory` overlay deleted (`594498a5e`). 2026-06-29.
- **D23** — orphaned `TaskDetails` variant replaced with `<TaskAttachmentsPanel>` (`c4a639ca9`). 2026-06-29.
- **D21** — dead AI-Runs feature deleted (`b4092df3b`). 2026-06-29.
- **D6b** — duplicate tool-viz code-runner deleted (`d05096766`). 2026-06-29.
- **D18** — `files.share_links`/`file_versions` owner SELECT RLS gap closed. 2026-06-27.
- **D17** — `userPreferencesSlice` module lists completed. 2026-06-27.
- **D6a** — window geometry restore keyed by slug (`WindowPersistenceManager.tsx`). 2026-06-27.
- **D5a** — permissive `shortcut_categories` SELECT policy dropped. 2026-06-27.
- **R2** — 11 severed overlay callbacks were dead; deleted. 2026-06-14.
- **R1** — chat Edit/resubmit severed `onSave` + missing RPCs fixed (`migrations/cx_message_soft_delete_and_truncate.sql`). 2026-06-14.
- **D41-research** — research live spend catalog-driven end to end. 2026-07-15.
- **D41-podcast** — podcast cast policy server-owned via typed `GET /podcast/cast-preview`. 2026-07-15.
