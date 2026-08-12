# Agent Tasks

Active worklist managed by agents. **See `AGENT_INSTRUCTIONS.md` for rules** — especially around task format, condensation, and when to ask the user.

> Quick scan order for arriving agents:
> 1. **Needs Clarification** below (questions waiting on the user)
> 2. **Blocked** (waiting on external)
> 3. **Active** (`ready` and `in-progress`)
> 4. **Completed** (recent context, condensed)

---

## Needs Clarification

_(none)_

## Blocked

_(none)_

## Active

> **Backlink chips (TASK-BL-*)** — refreshed 2026-08-11 after a full audit of
> the live code. The 2026-08-08 set (old TASK-BL-1…6) was never started: local
> agents built a bigger line instead (source-page capture + AI assessment,
> referring-domain opinions, Authority Router, Reputation). These chips are the
> AUDITED remainder, in priority order, and Arman's explicit ask on 2026-08-11
> was **"a really nice, clean user interface."** Shared context, resources,
> exemplars and traps: **`docs/handoffs/backlink-intelligence-frontend.md`**
> (read it first). Each chip is independently runnable on main; mark
> `in-progress` when you take one. **The row table is `seo.backlink`** — the
> older `seo.backlink_observation` is not what the UI reads.

- **TASK-BL-UI-B** — Verdict-first Overview + coherent tab set (2026-08-11, `ready`). Today Overview is 14 undifferentiated numeric tiles (two near-identical KPI strips built from DIFFERENT primitives — one is a hand-rolled re-implementation of `MetricCell`), then a chart, four top-ten cards, and a raw JSON "refresh receipt" tree on the primary tab. Nothing on the page says *is my link profile healthy*. Fix: (1) lead with a verdict/health summary — the Anchor profile already does this well (warnings first, then "Anchor distribution looks natural"); copy that pattern. (2) Collapse to ONE KPI strip built from `MetricCell`. (3) Replace the Overview JSON receipt with a one-line human summary ("Checked 12 Aug — 412 new links, 38 lost"), JSON behind a support-only disclosure. (4) Regroup the tabs: three data generations (provider aggregates, provider rows + AI assessment, first-party opinions) currently share one flat strip, Anchors appears TWICE (its own tab and inside Insights), and Insights is a nine-pill second-level nav whose first four pills are just filters of the Backlinks tab — three levels of nav before a row. Proposed: **Overview · Links (lens chips in its own toolbar) · Sites · Pages & anchors · Competitors**. (5) In the Backlinks table, hide the six AI-assessment columns until anything has actually been reviewed (they render "—"/"Awaiting" otherwise). Coordinate with TASK-BL-UI-A on naming.

- **TASK-BL-UI-C** — Mobile pass (2026-08-11, `ready`). Verdict from the audit: it is not usable on a phone. Fix, per `.claude/skills/ios-mobile-first`: toolbar of 9 controls wraps to ~5 rows and eats ~40% of the viewport before any data (needs an overflow menu); two stacked horizontally-scrolling pill strips (tabs + nine insight pills); **`title=` is the ONLY explainer mechanism across ~15 sites** (rank, spam score, broken flag, tab descriptions) and native tooltips do not exist on touch — convert to tap-able `Tooltip`/`Popover`; `h-[min(52rem,70vh)]` in `BacklinkEnrichmentDetail.tsx` (**`vh` is banned — use `dvh`**); raw `<select>` + `Textarea className="text-xs"` in `BacklinkEnrichmentDetail` and `ReferringDomainIntelligenceTable` (below 16px triggers iOS zoom-on-focus; also swap raw `<select>` for the library `Select` used elsewhere in the same workspace); inverted breakpoint `sm:max-w-md sm:truncate` in `BacklinkAnchorProfile` (truncation only applies at `sm`+, so the smallest screens blow out); three nested scroll areas in the record drawer; no `useIsMobile()` and no `pb-safe` anywhere in the folder.

- **TASK-BL-ASSISTS** — Mount assists + ship the producer (2026-08-11, `ready`). The backlinks workspace mounts ZERO assists, while its own siblings (Reputation, Competitors, Search Console, Content Plan) all do — a direct miss of the standing Assists ruling. Mount `<AssistStrip surfaceName="matrx-user/marketing-backlinks" …/>` under the toolbar (mirror `GscAssistStrip` — site-filtered by dedupe key) and add `features/marketing/components/backlinks/backlinks-assists-producer.ts` (copy `search-console/insights-assists-producer.ts`), with deterministic sweeps over already-loaded state: (1) **lost-link reclaim** — links moved to `lost` → agent drafts reclaim outreach; (2) **broken-target repair** — `broken_backlinks > 0` or target status ≥ 400 → agent proposes the redirect map (this IS the missing one-click fix for a problem the UI already detects and names); (3) **anchor over-optimization** — `analyzeAnchorProfile` already computes `warnings` client-side, so a critical warning becomes an assist; (4) **risk pile-up** → drafts a review list (never an auto-disavow); (5) **unreviewed backlog** → runs the next review batch with an explainer of what it costs; (6) **competitor gap** → "N sites link to your competitor but not to you". Every chip obeys THE INTENTIONAL-ACTION LAW (expand → verb-labeled button + explainer + receipt). Read `features/assists/FEATURE.md` first.

- **TASK-BL-AGENTS** — Bind the two surface agent roles (2026-08-11, `ready`). `features/surfaces/manifests/marketing-backlinks.manifest.ts` declares `backlink_analyst` + `outreach_strategist`, both still `defaultAgentId: null` — the surface streams a rich typed scope to nobody, and the roles are dead ends. Author both agents (aidream MCP `agent_author`, per the `matrx-agents` skill) grounded in the surface's actual scope values (summary, trend, top dimensions, lens rows, assessments), bind them as the roles' defaults, and add visible launch chips via `useShortcutTrigger` (rules: `agent-execution-redux` skill). They are useful read-only on scope today; the server-side `seo`-tool backlink actions are a filed aidream chip.

- **TASK-BL-DISAVOW** — Disavow export from the risk lens (2026-08-11, `ready`). `lib/vocab.ts` registers `disavow_review` as a recommended action and the risk lens describes itself as "never an automatic disavow list", but there is NO export path — the recommended action terminates in a badge. Add selection + a Google-format `disavow.txt` export (`domain:example.com` lines, deduped, commented header naming site/date/threshold) through the existing `ExportMenu` / `components/agent-copy/export.ts` primitives (extend with a plain-text item if needed — check first, don't fork), behind a `ConfirmDialog` that explains in plain language what a disavow file does and that we never submit it anywhere. Empty lens → disabled action with the reason.

- **TASK-BL-DRILL** — Slice drilldown panels (2026-08-11, `ready`). Right-click / row action on any referring-domain, anchor, or target-page row opens a floating window showing that slice's links — the observation table filtered to it. Mirror the GSC pattern exactly (`search-console/windows/GscDrilldownWindow.tsx` + `features/overlays/openers/gscDrilldownWindow.tsx`): deterministic instanceId so repeat drills focus rather than stack, `NonEditableContextMenu` + `resolveContextOnOpen` + `data-row-id` (the backlinks folder has ZERO context-menu wiring today while GSC has it), and a `fixedFilter`-style prop on `BacklinkObservationTable` that adds server-side `.eq()`s in `listLatestBacklinks`. Note `BacklinkEnrichmentDetail` is a 683-line detail view mounted inline in a table row — it is exactly the payload such a window should host. Register per the `window-panel-authoring` skill.

- **TASK-BL-MOVERS** — Gained/lost between checks (2026-08-11, `ready`). New Insights view: diff the two latest dimension snapshots per kind (referring domains + anchors) into gained / lost / changed with delta columns (`gscDeltaCell` conventions from `search-console/lib/columns.tsx`). Pure diff function in `features/marketing/components/backlinks/lib/` with unit tests (match `anchors.test.ts` / `enrichment-run.test.ts` discipline); the read is a two-snapshot variant extending the existing snapshot resolution in `backlinks-queries.ts` — do NOT fork its helpers. With only one stored check, say so honestly rather than rendering an empty table. NOTE: the trend chart's new/lost numbers are PROVIDER aggregates, not a snapshot diff — this is different data, so label both clearly.

- **TASK-BL-ANCHORFOOT** — Internal↔external anchor footprint (2026-08-11, `ready`). The story our data fully backs and nothing yet tells: join external anchors (`seo.backlink_dimension_snapshot` kind `anchor`) with internal anchors (`web.link_edge.anchor_text`, ~420K rows) and each page's accepted anchor policy (`web.page.desired_values.accepted_anchor_texts`), flagging conflicts — the same exact-match phrase dominating BOTH internal and external links is a footprint risk. READ FIRST: the "Internal-link two-plan contract" in `features/marketing/FEATURE.md`; reuse `normalizePlanUrl` + the anchor normalization in `data/page-links.ts`, never re-derive. `features/marketing/authority/data.ts` already reuses `normalizePlanUrl` + `desired_values` for link plans — extend that lineage, don't fork it. Bounded reads only (`web.count_link_edges` RPC + capped queries); nothing anywhere currently reads `accepted_anchor_texts` from the backlink side.

- **TASK-BL-WATCH** — Referring-domain watchlist (2026-08-11, `ready`). Watch column + a Watched view on the referring-domain table, riding the ONE favorites primitive (`platform.user_entity_state.is_favorite`) exactly as GSC does — reuse `search-console/lib/watch.ts` + `useRowWatch` + `WatchButton`, generalizing them to take an entity token if that is a small change, rather than forking. No new table, no new slice.

- **TASK-BL-7** — "This site was deleted or is no longer accessible" is shown for sites that are ALIVE (2026-08-11, `ready`, **platform-wide, not backlinks-only**). `assertFound` (`features/marketing/data/service.ts:171`) throws that exact sentence on ANY zero-row read, so an access/organization-resolution miss is reported to the user as a deletion. This is not theoretical: two agent-review items for marketing pages were rejected as "site deleted or inaccessible" while the brand and site were both live and un-deleted in the database (Data Destruction, 444 stored links). It is also a dead end — the message offers no door and no next step. Fix: distinguish not-found from no-access (a second bounded existence check, or a `SECURITY DEFINER` helper that answers "exists but you lack access" without leaking contents), give each case honest copy, and give the no-access case an actual door (request access / switch organization / go to the sites list). Loud-recovery doctrine applies: whichever branch fires should be visible in the Error Inspector, not silently swallowed.

> **Surface write-target chips (TASK-SWT-*)** — the avalanche campaign's next
> assignments, scouted 2026-08-12 against latest main. Each one makes ONE
> surface agent-writable. **Invoke the `surface-write-targets` skill first**
> (`.claude/skills/surface-write-targets/SKILL.md`) and follow it exactly —
> judgment bar, manifest + handler recipe, and the MANDATORY live-agent run.
> These were filed as tasks rather than spawned as sessions because the
> originating session hit the session-lineage depth limit; they are otherwise
> ordinary chips and each ends by firing 3-5 chips of its own.
>
> **Shared traps, all learned the hard way on `matrx-user/marketing-findings`
> (landed 2026-08-12) — read its exemplar `FindingWriteTargets.tsx` first:**
> (1) Confirm the write LANDED — re-read the returned row or the store and
> THROW when the stored value differs; a canonical service that swallows
> failures into a toast will otherwise have you report success for a write the
> server refused. (2) **Write EVERY member of an enum target live.** Findings
> shipped `acknowledged | open` where `open` routed to the wrong canonical verb
> (`reopenFinding`, which writes `reopened`) — it stored the wrong status AND
> then failed its own landing check, reporting failure for a write that had
> already mutated the row. The original verification covered every value except
> that one. (3) **Every value an agent can write needs a USER TWIN** — a
> control the user can see land and reverse in place. Findings' header offered
> only "I'm on it", so three statuses had no correction affordance; completing
> the twin is in scope, not scope creep. (4) The inline-tool layer PARSES a
> JSON-looking argument before your handler sees it, so a string-typed target
> cannot take raw JSON — accept the OBJECT and serialize it yourself.
> (5) The seam resolves handler closures BEFORE the user confirms, so read
> state from the store/a ref at call time, or make interdependent fields ONE
> object target. (6) Never re-type an enum into a description — interpolate the
> real constant. (7) **Collisions land MID-FLIGHT**: findings was assigned to
> two agents and a competing design was pushed to the SAME branch name while
> the second agent was verifying. Re-check `git fetch origin main` + `git
> ls-remote origin <branch>` immediately before committing; if someone landed
> first, KEEP their work, add only what is additive, and merge `origin/main` in
> rather than rebasing their commit so their SHA survives and your push is a
> fast-forward — never force-push over another agent's branch. (8) Reconcile
> `features/surfaces/FEATURE.md` conflicts BY HAND (both sides), and if you run
> a blanket find/replace over a FEATURE.md, check it did not rewrite an OLDER
> historical entry that legitimately mentioned the same symbol — that exact
> mistake happened on findings. (9) Before assigning any onward chip, intersect
> "no `writeTargets`" against ACTUAL provider mounts — and note that
> `grep -rhno 'surfaceName="[^"]*"'` MISSES mounts passing a const
> (`surfaceName={SURFACE}`), so also grep `SurfaceRuntimeProvider` in the
> feature dir. A `stub`-readiness manifest may be FICTION describing a
> different app (this happened to `canvas`) — `surface-authoring` comes first.

- **TASK-SWT-COMPETITORS** — Make `matrx-user/marketing-competitors` agent-writable (2026-08-12, `ready`). Manifest `features/surfaces/manifests/marketing-competitors.manifest.ts` (route `/marketing/competitors`, readiness `verified`, no `writeTargets`); mount is `features/marketing/competitors/CompetitorAutopsyWorkspace.tsx`. **The strongest remaining candidate:** `features/marketing/competitors/data.ts` already exposes TWO canonical human-decision writes — `updateCompetitorTracking(...)` and `updateOpportunityStatus(...)` — and the manifest's declared reads are their exact twins (`competitors` carries "tracking" and "latest resolved judgment"; `opportunities` carries "human status"). The surface also declares a `competitor_strategist` role whose stated job is "prioritizes the minimum action set", so it already expects agents to do this. Read the real tracking/status vocabulary from the constant or TS union and interpolate it. **The NOs:** relevance / threat / overlap / visibility and the opportunity scores are pipeline OUTPUT, and `latest_autopsy` / `active_run` are run artifacts — writing any of them forges the analysis record; competitor domain/id is identity; list filters are view state. Honest check: confirm both fields are genuinely user-editable in the workspace UI before declaring them.

- **TASK-SWT-REPUTATION** — Make `matrx-user/marketing-reputation` agent-writable (2026-08-12, `ready`). Manifest `features/surfaces/manifests/marketing-reputation.manifest.ts` (route `/marketing/brands/[brandId]/sites/[siteId]/reputation`, readiness `verified`, no `writeTargets`); the provider IS mounted in `features/marketing/components/reputation/ReputationWorkspace.tsx` (~line 465, via `surfaceName={SURFACE}` — which is why a literal-string grep misses it). **The candidate:** `updateReputationCase({caseId, status, ruling})` in `features/marketing/data/reputation-queries.ts` writes a case status AND a **human ruling** object through the `seo.update_reputation_case` RPC — an authored adjudication, which is squarely the YES class; the surface's own `reputation_adjudicator` role names the work. Status + ruling are interdependent, so strongly consider ONE object target (the findings `finding_suppression` shape) rather than two racing ones. **The NOs:** `reputation_narratives` / `reputation_brief` / `evidence_inventory` / `publication_opportunities` are generated artifacts and evidence, and `reputation_run_state` is run state. Read the real `ReputationCaseStatus` union rather than re-typing it.

- **TASK-SWT-SETTINGS** — Assess and (if it earns it) make `matrx-user/settings` agent-writable (2026-08-12, `ready`). Manifest `features/surfaces/manifests/settings.manifest.ts` (route `/user-settings`, readiness `verified`, no `writeTargets`); mount `features/settings/route-shell/SettingsTabContentImpl.tsx`. **Read this chip's caveat before starting:** every value the surface declares TODAY is view state (`active_tab_id`, `active_tab_label`, `active_tab_path`, `is_saving`, `settings_sections`, `is_admin_view`) and view state does NOT earn a target on its own — so the first job is to find whether the actual PREFERENCE fields underneath (persisted via `features/settings/hooks/useSetting.ts` / `useSettingPersistence`) are worth declaring, which likely means adding their READ twins first. A preference an agent can genuinely reason about from context is a YES; a mechanical toggle nobody would ask an agent to flip is a NO, and the honest outcome may be "this surface does not earn it" — which the skill explicitly says to report rather than pad. If so, say so and spend the effort on the chips.

- **TASK-SWT-MESSAGES** — Assess `matrx-user/messages`, `surface-authoring` FIRST (2026-08-12, `ready`). Manifest `features/surfaces/manifests/messages.manifest.ts` (route `/messages`, **readiness `stub`**, no `writeTargets`); mounts in `app/(core)/messages/MessagesPageClient.tsx` and `app/(core)/messages/[conversationId]/page.tsx`. **Prerequisite:** the readiness is `stub`, meaning the vocabulary was never audited against the page — the `canvas` chip found a stub manifest that described a DIFFERENT application, so verify every declared value against the live page and run `surface-authoring` before any write work. **If the surface is real,** the candidate is the composer DRAFT, following the shipped `matrx-user/chat` precedent exactly: `input_draft` is a legitimate draft target because it holds the message the user has NOT sent yet and is fully reversible, while the transcript (`last_message_text`, `all_conversations`, message counts) gets NO target — rewriting it fabricates history rather than editing a draft. SENDING stays human, as it does on `chat`, `podcast-studio` and `image-generate`. `current_conversation_title` may be a second target if a canonical rename service exists — check before declaring.

- **TASK-SLR** — Picklists → Structured Lists full cross-repo rename (2026-07-14, `in-progress`). Eliminate the `picklist` identifier everywhere (data object + dropdown projection: tool, `cc.picklist`, wire tokens, component/route names) → `structured_list`. Layer-by-layer with 100%-verification gates + persisted-data migration (agent.definition JSON, tool bindings, window_sessions). **Full plan + live status = the cross-repo playbook `/Users/armanisadeghi/code/common-docs/projects/structured-lists-rename/FEATURE.md`** (the resumable source of truth — update it, not this line, as layers complete). Layer 0 (data object) done + verified (FE `dee8c4ede`, aidream `d8fbfa7b0`). Next: Layer 1 (RPC rename).

---

> **Surface write-target chips, second set (TASK-SWT-*)** — filed 2026-08-12 by
> the agent assigned `matrx-user/messages`, which was correctly ruled out on the
> judgment bar (see the manifest docblock and the 2026-08-11 surfaces Change Log
> entry — that negative result is settled, do NOT re-derive it). **Invoke the
> `surface-write-targets` skill first** (`.claude/skills/surface-write-targets/SKILL.md`)
> and follow it exactly: judgment bar, manifest + handler recipe, and the
> MANDATORY live-agent run. A separate set (TASK-SWT-COMPETITORS / -REPUTATION /
> -SETTINGS / -MESSAGES) is filed on `claude/surface-write-marketing-findings` —
> check that branch before claiming, so the two sets do not collide.
>
> **Shared traps.** Live-verify or you have not verified: two independent agents
> found the `marketing-findings` undo defect ONLY by running it, never by
> reading it. `grep -rhno 'surfaceName="[^"]*"'` MISSES mounts passing a const
> (`surfaceName={SURFACE}`) — also grep `SurfaceRuntimeProvider` in the feature
> dir. Reconcile `features/surfaces/FEATURE.md` conflicts BY HAND, both sides,
> then check `git diff --numstat origin/main -- features/surfaces/FEATURE.md`.
> Collisions land MID-FLIGHT: re-check `writeTargets` on latest main right
> before committing, and if a design already landed it WINS — keep it, add only
> what is additive, never force-push over another agent's branch.

- **TASK-SWT-AGENT-SETTINGS** — Make `matrx-user/agent-settings` agent-writable (2026-08-12, `ready`). Manifest `features/surfaces/manifests/agent-settings.manifest.ts`, no `writeTargets`. **The candidates:** `AgentSettingsForm` owns four genuinely authored fields — name, description, category, tags — a real multi-field YES set. **Prerequisite:** the surface has NO emitter, is window-only, and `features/surfaces/route-to-surface.ts` (~line 34) maps an `/agents/settings` prefix that does NOT exist as a route — run `surface-authoring` FIRST or you will verify a page that offers an agent no write tool at all. **The gotcha that will cost you the run:** handlers must stage into the form's LOCAL `draft` state; reusing `useAgentBuilderWriteHandlers` dispatches `setAgentField` into the shared Redux record the form DIFFS AGAINST, so the form shows the new value while its Save bar reads "All changes saved" — a silent no-op that looks like success. **The NOs:** id / ownership / access level, and the bound tools / skills / model (changing what an agent may REACH is a capability change, not a copy edit — `agent-builder`'s ruling), and version lineage.
- **TASK-SWT-BUNDLES** — Make `matrx-admin/bundles` agent-writable, data path FIRST (2026-08-12, `blocked-on-data`). Called "the best remaining write-target candidate on the judgment bar" by the 2026-08-11 replacement search: `BundleDetail` is an inline name / description / metadata editor with its own Save bar, which is the draft-target shape the campaign wants. **It cannot be live-verified today** — its manifest has no emitter AND `/administration/agents/bundles` fails to load any rows ("Failed to load bundles" against `tool.bundle`). So this chip is two jobs in order: fix or explain the `tool.bundle` read path, then `surface-authoring` for the emitter, then the write targets. If the data path turns out to be dead product rather than a bug, say so and stop — that is a useful answer, not a failure.
- **TASK-SWT-ENTITY-VERB-AUDIT** — Live-audit every shipped `mode:"entity"` write target for the wrong-canonical-verb defect class (2026-08-12, `ready`). **Grounded in a real, reproduced defect**, not a hunch: `matrx-user/marketing-findings` shipped its `finding_lifecycle_status: "open"` branch through `reopenFinding` (writes `reopened`) instead of `unacknowledgeFinding` (writes `open`). That wrote one of the exact two statuses the target's own model-facing description promised an agent could NEVER write, and the handler's post-write landing check then threw AFTER the mutation had committed — reporting `did not land` to the agent for a write that had happened. **The generalisable lesson: a landing check that runs after an irreversible mutation cannot undo it, so the VERB has to be right; the check catches a server that refused, never a client that asked for the wrong thing.** Enumerate the adopters (`grep -l writeTargets features/surfaces/manifests/*.manifest.ts`), and for each `mode:"entity"` target read the handler's canonical call and confirm the value it advertises is the value that verb actually writes — then RUN the ones you doubt, reading the row back after a reload rather than trusting the agent's summary. Report per surface: verb correct / verb wrong / not exercised, and fix what you find. Do not "fix" anything you did not reproduce.

## Completed

- **TASK-BL-UI-A** — Plain-language pass on the backlinks workspace (2026-08-11, `done`). Root `CLAUDE.md` §"The user — a brilliant, absolutely NON-technical Subject Matter Expert" was violated throughout this surface; it now reads as one voice. The label layer lives ONCE in `lib/vocab.ts` (refresh profiles, review statuses, relevance, control levels, recommended actions, page types, link types, placements, link attributes, `backlinkEmptyHint()`, the rank/spam/credit explainers) — components call a label function, never `humanizeAssessmentValue(raw_key)`. Machine keys, query params and filter values are untouched. Verified 0 occurrences of `Dead letter`, bare `Awaiting`, `Your ruling`, `Cache key`, `PR`/`DR` headers, and user-visible `snapshot`. Kept deliberately: `backlink`, `anchor text`, `referring domain`, `dofollow`/`nofollow`, `spam score` — each explained once where first shown. `StatusBadge` gained an optional `label` prop (extended, not forked) so tone stays keyed on the machine value. Gates: tsc clean in every touched file, eslint clean, 30/30 tests. Layout/tab/mobile restructuring stayed out — TASK-BL-UI-B and TASK-BL-UI-C own those.
- **TASK-001** — Agent Handoff + Value Store FE integration (2026-07-12): `is_visible_to_user` filter on every user-facing message read (contract idiom `.eq(true)`; column live-verified NOT NULL, RPC filters server-side); handoff bubble rebind + failed-handoff rewind hardened by adversarial review against the LIVE server event flow (reservation scoping by `parent_refs.conversation_id`, per-call_id oldest-pending rewind anchor, INIT-operation_id handoff gating — pure core in `execution-system/utils/handoff-stream-state.ts`, 12 new tests); value-store/groom cards render stream-time only (`content:null`, persistence leak pinned by test); `promoteMessageId` duplicate-id merge guard; aidream type-generator fixed to emit kind-discriminated events (`e6b121f93`). Commits `88bd55981`, `af1fd5b3e`, `8653e04b8`, `9fc93f6db`, `e611e9e30`, `2561805d2`, `a9931f4f8`. NOT yet driven against a live handoff stream (none available) — first real handoff session should be watched. Two server defects found + filed in aidream's ledger (contained-failure emits no signal; reference mode mints values for failed children).
- **TASK-002** — Definer-grant recurrence guard shipped as Data Integrity check `definer-grant-anon-identity` (all exposed schemas, allowlist-as-data) + the whole console `check:*` family (14 gates) absorbed into `/administration/data-integrity` as on-demand script checks (2026-07-12, `3091e2611` + `9e13b6f7b`). First run found 20 live violations → batch C authored + classified, NOT applied (see D31).
- **TASK-003** — Capability silent-drop killed (2026-07-12, `48f86628f` + `bcf898316` + `674f94901` + `d6cf0e9f6` + `9e7539581`): full live vocabulary (`extraction`/`single`, `entities`, `multilingual`, 18 feature values), screaming parser (values + unknown top-level keys, captureError data-shape), extraction launch refusal on EVERY path (agentId + shortcut branches, toast surfaced), audit-tab Save now merges canonically (parse(save(parse)) lossless on all 5 live extraction rows). Residual: D48 cold-registry bypass (ledgered).
- **TASK-004** — duplicate of D45-mobile, fixed the same day by the autonomous run (see FOUND_DEFECTS Resolved D45-mobile; commits `4bf7958d5`/`e7fae6a95`/`d4011b698`).
