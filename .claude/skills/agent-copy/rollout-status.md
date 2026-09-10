# Rollout status (update this as you go)

## Contents

- Done — primitive, integrations, shared formatters, wired features and pages
- Law-compliant FORM surfaces (the 2026-08-15 form sweep)
- Known debt (still outstanding) — pre-MISSION raw-dump payloads
- Open per-item gaps on the version-diff page

**Done:**

- Primitive + README + roadmap (`components/agent-copy/`), `xs` size, groomer
  window (`AgentCopyGroomerWindow` + `groomer-types.ts`) routed from the one AI
  menu; a separate launcher beside the control is forbidden.
- Graded Copy-for-AI variants: `AiCopyMenu`, `CopyButtons.aiVariants`,
  `CopyButtons.aiCustom`, `MatrxDataTable copy.aiVariants/aiCustom`, shared
  `clipboard.ts`, plus `buildGroomerPresetPayload` / `groomerPresetVariants`
  (groomer-types) and `keyFieldsAiVariant` (marketing `copy-payloads.ts`).
  Wired on the medium/massive marketing site tabs (keywords, ranks, findings,
  analysis, audit, links, crawls, discovery, cost + backlinks reference);
   small bounded tabs deliberately keep the plain direct AI control inside the pair — the sized-to-data call
  is part of the job. `AiCopyMenu` remains in step with aidream
  `apps/dashboard/src/components/agent-copy/AiCopyMenu.tsx`.
- Built-in integrations: `MatrxDataTable` `copy` config → row/view/window/field
  menus; `DataRowInspector` per-field hover copy; `JsonInspector` `agentCopy`.
- Shared formatters: `lib/sandbox/format.ts`, `features/ai-models/format.ts`,
  `features/marketing/components/backlinks/format.ts`,
  `features/sharing/format.ts`.
- **Sharing / access (2026-08-15)** — wired in `features/sharing/*`, so every
  surface that renders sharing UI gained copy at once (ShareModal and its
  window, file info, notes, RAG data stores, agent share panel, marketing site
  access). `PermissionsList`: per-grant and list controls with export
  (JSON + CSV) over ALL grants, `ShowAllToggle` above a 12-row preview, and a
  copyable empty state. `AccessSummaryPanel`: panel + per-reason controls,
  reason CSV export, and a payload for its ERROR branch (a failed reachability
  read means UNKNOWN, never "private"); its reason rows now come from the
  shared `accessReasonRows` extractor that the view itself renders, so copy
  cannot drift from screen. `PublicAccessTab` declares its rendered sentences
  once and both renders and copies them. The share tabs stay composers — no
  forced record buttons — but their rendered failures are copyable with LIVE
  form state. `SiteAccessWorkspace` adds the page Copy-for-AI menu, threads
  one `SharingCopyContext` (identity + KPIs) into every child, and offers an
  "Errors & access blockers" variant beside the what-I-see default.
  `accessKpis` is the what-I-see KPI mirror here, the `auditPageKpis` analogue.
- **User-facing feature clusters (2026-08-15 wave, `v0.4.621`)** — the half of
  the app outside marketing/admin. **Knowledge/content**: notes, transcripts +
  transcript-studio + transcription-cleanup (session lists, Raw column),
  dictionary. **Work management**: tasks + projects (live editor state, list,
  table, rows), scheduling, organizations, war-room. **Data pipeline**:
  research, rag, cms site list (`features/cms/copy.ts`, wired in the
  `(core)/cms` route), and the sanitized MCP integrations surface
  (`features/agents/mcp-copy.ts` + `IntegrationsSettingsPage` — no endpoint
  URLs or OAuth ids). **content-plan**: plan tree, pages table, entity roster,
  pillar map, reality card, brief editor, drift bar/sheet, AI runs.
  ⚠️ **Coverage is NOT provable by `grep features/<name>`** — cms and MCP
  integrations both read as "0 files" under a folder grep while being fully
  wired, because the wiring lives at the route / shared-surface. Grep the route
  tree too before declaring a gap.
- **Still open, each with its own handoff — read it before touching either:**
  media cluster (image-manager, podcasts, audio, pdf; files partly done —
  `docs/handoffs/agent-copy-media-cluster.md`, whose audit found `CloudFile`
  carries FIVE signed-URL/storage-path fields a verbatim dump would leak) and
  the data/knowledge remainder (`docs/handoffs/agent-copy-data-knowledge-cluster.md`).
- Pages: sandbox admin / user-list / detail; `administration/admins` (admins +
  audit); `administration/ai-tasks`; `administration/invitation-requests`;
  `/marketing/brands/[id]/sites/[id]/backlinks` (the full-granularity + groomer
  reference page); relationships hub — all tabs; the planner is the
  what-I-see reference (`access-planner/copy.ts`).
- **What-I-see wirings (post-MISSION, use these as the pattern):**
  `features/agents/components/diff/AgentVersionDiffPage` — the RENDERED DIFF
  as data. Changed fields are built through the SAME adapter registry +
  enrichment the viewer renders with (`buildAgentAdapterRegistry` is exported
  from `AgentDiffViewer` for exactly this), so each field carries the label
  and summary line the user reads; the stats strip is the page KPI and rides
  in body + attributes everywhere; variants mirror the page's own view modes
  (Changes / Changes + review prompt / Summary / History / Everything) and the
  review-prompt variant answers the question the user actually has ("what
  changed and is it safe?"). `features/agents/components/widgets/AgentWidgetsPage`
  — LIVE form state; the launch-options builder was extracted to
  `build-widget-launch.ts` so the click handler and the payload share ONE
  extractor, and a JSON-box parse failure copies as `status:"blocked"` with
  the red-banner text verbatim.
  `features/agents/components/shortcuts/AgentShortcutsPanel` — rendered row
  projection (surface first), count cards mirrored into every payload, error
  banner captured verbatim with its own control; fat raw records demoted to
  "Everything". Shared shapes in `features/agents/format.ts` +
  `features/agent-shortcuts/format.ts`.
- **`features/marketing/content-plan` — the whole module (2026-08-15).** Wired
  AFTER the MISSION section, so these are what-I-see payloads, not raw dumps:
  node record (`NodePanel`, live draft state + `unsaved_changes` + blockers
  verbatim), both tables' per-row copy turned on with graded view variants,
  `PlanTree` (+ toolbar `trailing` slot) and `PillarMap` projections,
  `EntityManager`'s two lists, the `PlanDriftBar` KPI strip and
  `PlanDriftSheet` worklist, `PlanAiRunsView`, `NodeRealityCard`, the
  form-heavy `BriefEditor` (payload from live `lines`, never the fetched row),
  and the workbench's page-level pair with its six-section Groomer inside the
  Copy-for-AI menu. Shared
  summaries + the KPI mirror: `features/marketing/content-plan/format.ts`
  (`contentPlanKpis` — the module's `auditPageKpis`). Fixed while there:
  `PlanSitesList`'s `.slice(0, 4)` status chips now say "+N more".
  Deliberately skipped: both route headers (their data is fully covered by the
  body one level down — a second page-level AI button beside the first is the
  anti-pattern), the input composers/toolbars, and `PlanRealityBar`, which is
  **dead code** (declared, imported nowhere; `PlanDriftBar` superseded it).
- Feature components: `features/ai-models` (AiModelTable + filter bar),
  `features/tool-registry/mcp-admin` + `mcp-tools` (incl. aiCustom export
  dialog; sanitized formatters), `feedback` (all four tabs + detail dialog,
  shared `feedback/format.ts`), `system-agents/*` (roster, shortcuts, apps,
  content blocks, lineage; shared `features/agents/format.ts` +
  `features/agent-shortcuts/format.ts`), `agent-apps/*` (grid, overview,
  versions, admin aiCustom, executions, rate-limits, analytics, categories,
  dashboard, settings form, admin edit form + its metadata dialog and
  rate-limit editor; shared `features/agent-apps/format.ts`),
  `tool-call-visualization/admin/mcp-tools` (view page + editor/create forms;
  shared `mcp-tools/format.ts`).

**Law-compliant FORM surfaces (audited/wired 2026-08-15 — the form sweep):**
These are verified against THE WHAT-I-SEE LAW: payload built inside the click
handler from LIVE inputs, explicit `unsaved_changes` diff vs the saved record,
rendered validation/error text captured verbatim, and the page's leading strip
carried in the body AND envelope `attributes`.

- `agent-apps/route/AgentAppSettingsContent` — six staged fields + dirty diff,
  rate-limit validation verbatim, commit-on-change controls reported as saved,
  tabs made controlled so the payload names the open tab.
- `administration/agents/agent-apps/edit/[id]` — header pair carrying the
  Analytics card KPIs verbatim; flags when a draft-holding dialog is open.
- `agent-apps/components/UpdateAgentAppModal` — live drafts + the rendered
  `text-destructive` error.
- `agent-apps/components/AgentAppAdminActions` — rate-limit editor drafts.
- `feedback/components/FeedbackDetailDialog` — **was the worst offender**: it
  dumped the fetched `item` while nine live controls and four unsent composers
  sat on screen. Now sends live form values, the unsaved diff (mirroring
  `handleSaveDecision`'s own predicates), and the unsent drafts; the raw dump
  is demoted to an "Everything" variant that states it excludes unsaved edits.
  Header chips now ride on the per-comment/per-message section payloads too.
- `tool-call-visualization/admin/mcp-tools` `ToolEditPage` / `ToolCreatePage` —
  live draft, the red `JSON Error: …` text verbatim, and all three save
  blockers with their toast copy.
- Shared builders live in `features/agent-apps/format.ts`,
  `administration/users/feedback/format.ts`, and the mcp-tools `format.ts` —
  never at the callsites.

Two things the 2026-08-15 pass found that the brief had wrong, worth knowing:
the agent-apps edit page is under `app/(admin)/administration/agents/…`, not
`app/(core)/…`; and in `tool-call-visualization/admin/mcp-tools` only
`ToolViewPage` was ever wired — the two editors were unwired, not
raw-dumping. (The rollout list's "mcp-tools" refers to the separate
`features/tool-registry` tree.)

**Known debt (still outstanding):** surfaces wired BEFORE the MISSION section
existed carry raw-dump payloads that fail the what-I-see test — auditing them
is step 4 of the module-audit protocol. Any you touch is boy-scout territory:
upgrade the payload while you're there. The 2026-08-15 pass paid down the
FORM surfaces only; **known remaining offenders**, all raw `data: record`
dumps with no page KPIs in `attributes`:

- `agent-apps/route/AgentAppOverviewContent` — `data: { app, agent, variables,
contextSlots }`; the page renders a six-chip stat strip that no payload
  carries. Its per-variable and per-context-slot section pairs also lack
  parent context.
- `mcp-tools/ToolViewPage` — `data: tool` (read-only, so the record largely IS
  the view, but it carries no chips in `attributes` and mixes the live
  `isActive` toggle with saved `tool` fields in one payload).
- The rest of the pre-2026-08-12 list above is unaudited.

**Open per-item gaps on the version-diff page:** its two lists render in
files outside that page — the History tab's rows in
`features/agents/components/diff/VersionHistoryTimeline.tsx`, and the
per-field diff rows in the shared `components/diff/views/*` (used by other
features). Both lists are covered today at whole-list granularity from the
page toolbar (a "Version history" variant + all-versions CSV, and the
changed-field list + CSV), but neither has a per-row pair yet. Wiring those
means editing the timeline and the shared diff views — do it deliberately,
and keep the shared views generic (take an optional copy config, don't
hard-code agent payloads into `components/diff/`).
