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

> **Backlink phase-2 chips (TASK-BL-1…6)** — approved by Arman 2026-08-08 for
> local agents to pick up in parallel. Shared context, resources, exemplar
> patterns, and traps: **`docs/handoffs/backlink-intelligence-frontend.md`**
> (read it first — chips stay short on purpose). Each chip is independently
> runnable on main; mark `in-progress` with your session when you take one.

- **TASK-BL-1** — Backlink drilldown panels (2026-08-08, `ready`). Right-click + row action on any referring-domain / anchor / target-page row (dimension tables + overview top-10 cards) opens a floating window showing that slice's backlinks — the observation table filtered by `source_domain` / `anchor_text` / `target_url`. Mirror the GSC pattern exactly: opener in `features/overlays/openers/` (deterministic instanceId so identical slices focus, not stack), window body composing `BacklinkObservationTable` with a new optional `fixedFilter` prop that adds server-side `.eq()`s in `listLatestBacklinks`, context menu via `NonEditableContextMenu` + `resolveContextOnOpen` + `data-row-id` (see `GscDimensionTable.tsx`). Acceptance: drill from Domains tab and from an Overview card; two drills on the same domain focus one window; register the panel per the `window-panel-authoring` skill.

- **TASK-BL-2** — Referring-domain watchlist (2026-08-08, `ready`). Watch column on the referring-domain dimension table + a Watched filter/view, riding the ONE favorites primitive (`platform.user_entity_state.is_favorite`) exactly as GSC does: copy the chokepoint pattern from `features/marketing/search-console/lib/watch.ts` + `useRowWatch` + `WatchButton` (generalize/reuse rather than fork if trivially possible — check whether the GSC helpers can take an entity token before writing new ones). Acceptance: watch survives reload, shows in the table, and the watch state is one shared primitive — no new table, no new slice.

- **TASK-BL-3** — Snapshot movers — gained/lost per dimension (2026-08-08, `ready`). New Insights view "Movers": diff the two latest dimension snapshots per kind (referring_domain + anchor) into gained / lost / changed rows with delta columns (`gscDeltaCell` conventions from `search-console/lib/columns.tsx`). Pure diff function in `features/marketing/components/backlinks/lib/` (unit-tested like `anchors.test.ts`); data read = two-snapshot fetch variant in `backlinks-queries.ts` (extend `listDimensionRows`' snapshot resolution — do NOT fork the query file's helpers). Empty/1-snapshot state must say honestly that movers need two refreshes.

- **TASK-BL-4** — Internal↔external anchor integration (2026-08-08, `ready`). The unbuilt story our data fully backs: join external anchors (`seo.backlink_dimension_snapshot` kind `anchor`) with internal anchors (`web.link_edge.anchor_text`, ~420K rows) and per-page anchor policy (`web.page.desired_values.accepted_anchor_texts`). Add a per-target-page view (Insights or Pages tab): for a page earning backlinks, show external anchors used vs. internal anchors used vs. the page's accepted list, flagging conflicts (same exact-match anchor dominating both internal and external = footprint risk). READ FIRST: "Internal-link two-plan contract" in `features/marketing/FEATURE.md` — reuse `normalizePlanUrl`/anchor normalization from `data/page-links.ts`, never re-derive. Bounded reads only (`web.count_link_edges` RPC + capped queries).

- **TASK-BL-5** — Disavow export (2026-08-08, `ready`). On the Toxic-risk lens: selection + an Export action producing a Google-format `disavow.txt` (`domain:example.com` lines, deduped, with a commented header naming site + date + spam threshold). Wire through the existing `ExportMenu`/`components/agent-copy/export.ts` primitives (extend with a plain-text export item if needed — check first, don't fork). A confirm step (`@/components/ui/confirm-dialog`) explains what a disavow file does; never auto-submit anywhere. Acceptance: file downloads with correct content from real toxic rows; empty lens = disabled action with reason.

- **TASK-BL-6** — Backlink agent enablement (2026-08-08, `ready`, partially blocked on aidream). The manifest (`features/surfaces/manifests/marketing-backlinks.manifest.ts`) declares `backlink_analyst` + `outreach_strategist` roles with `defaultAgentId: null`. Author the two agents (aidream MCP `agent_author`, per the `matrx-agents` skill) with prompts grounded in the surface's scope values (summary, trend, top dimensions, lens rows), bind them as the roles' defaults, and add visible on-page launch chips via `useShortcutTrigger` (rules: `agent-execution-redux` skill) on the Overview + Insights tabs. Server-side tool access (refresh/read actions on the `seo` tool) is aidream work — `aidream/docs/handoffs/backlink-intelligence-backend.md` item 3; the agents are still useful read-only on surface scope until that lands.

- **TASK-SLR** — Picklists → Structured Lists full cross-repo rename (2026-07-14, `in-progress`). Eliminate the `picklist` identifier everywhere (data object + dropdown projection: tool, `cc.picklist`, wire tokens, component/route names) → `structured_list`. Layer-by-layer with 100%-verification gates + persisted-data migration (agent.definition JSON, tool bindings, window_sessions). **Full plan + live status = the cross-repo playbook `/Users/armanisadeghi/code/common-docs/projects/structured-lists-rename/FEATURE.md`** (the resumable source of truth — update it, not this line, as layers complete). Layer 0 (data object) done + verified (FE `dee8c4ede`, aidream `d8fbfa7b0`). Next: Layer 1 (RPC rename).

---

## Completed

- **TASK-001** — Agent Handoff + Value Store FE integration (2026-07-12): `is_visible_to_user` filter on every user-facing message read (contract idiom `.eq(true)`; column live-verified NOT NULL, RPC filters server-side); handoff bubble rebind + failed-handoff rewind hardened by adversarial review against the LIVE server event flow (reservation scoping by `parent_refs.conversation_id`, per-call_id oldest-pending rewind anchor, INIT-operation_id handoff gating — pure core in `execution-system/utils/handoff-stream-state.ts`, 12 new tests); value-store/groom cards render stream-time only (`content:null`, persistence leak pinned by test); `promoteMessageId` duplicate-id merge guard; aidream type-generator fixed to emit kind-discriminated events (`e6b121f93`). Commits `88bd55981`, `af1fd5b3e`, `8653e04b8`, `9fc93f6db`, `e611e9e30`, `2561805d2`, `a9931f4f8`. NOT yet driven against a live handoff stream (none available) — first real handoff session should be watched. Two server defects found + filed in aidream's ledger (contained-failure emits no signal; reference mode mints values for failed children).
- **TASK-002** — Definer-grant recurrence guard shipped as Data Integrity check `definer-grant-anon-identity` (all exposed schemas, allowlist-as-data) + the whole console `check:*` family (14 gates) absorbed into `/administration/data-integrity` as on-demand script checks (2026-07-12, `3091e2611` + `9e13b6f7b`). First run found 20 live violations → batch C authored + classified, NOT applied (see D31).
- **TASK-003** — Capability silent-drop killed (2026-07-12, `48f86628f` + `bcf898316` + `674f94901` + `d6cf0e9f6` + `9e7539581`): full live vocabulary (`extraction`/`single`, `entities`, `multilingual`, 18 feature values), screaming parser (values + unknown top-level keys, captureError data-shape), extraction launch refusal on EVERY path (agentId + shortcut branches, toast surfaced), audit-tab Save now merges canonically (parse(save(parse)) lossless on all 5 live extraction rows). Residual: D48 cold-registry bypass (ledgered).
- **TASK-004** — duplicate of D45-mobile, fixed the same day by the autonomous run (see FOUND_DEFECTS Resolved D45-mobile; commits `4bf7958d5`/`e7fae6a95`/`d4011b698`).
