# Window Panel Inventory — Chunk: Agents-core

> Subset of the Agents chunk: the 12 load-bearing/distribution panels. Companion chunks (`agentDebugWindow`, `agentFindUsages*`, `messageAnalysisWindow`, `agentAssistantMarkdownDebugWindow`, `agentPlaceholders`) live in `docs/inventory/agents.md`.
> Column contracts: see [`PANEL_INVENTORY.md`](../../PANEL_INVENTORY.md) §4. Legend ✓ present · ◑ partial · ✗ missing · — n/a. Priority P0/P1/P2 · Effort S/M/L.

**Name map (logical → real overlayId / file):**
| Chunk name | overlayId | File |
|---|---|---|
| agentRunWindow | `agentRunWindow` | `AgentRunWindow.tsx` |
| agentSettingsWindow | `agentSettingsWindow` | `AgentSettingsWindow.tsx` |
| agentContentWindow | `agentAdvancedEditorWindow` | `AgentContentWindow.tsx` |
| agentContentSidebarWindow | — (NOT a window) | `AgentContentHistoryPanel.tsx` — embeddable panel, `contentHistory` is a different overlay |
| agentConnectionsWindow | `agentConnectionsWindow` | `AgentConnectionsWindow.tsx` |
| agentRunHistoryWindow | `agentRunHistoryWindow` | `AgentRunHistoryWindow.tsx` |
| agentImportWindow | `agentImportWindow` | `AgentImportWindow.tsx` |
| agentConvertSystemWindow | `agentConvertSystemWindow` | `AgentConvertSystemWindow.tsx` |
| agentCreateAppWindow | `agentCreateAppWindow` | `AgentCreateAppWindow.tsx` |
| agentShortcutQuickCreateWindow | `agentAdminShortcutWindow` | `AgentShortcutQuickCreateWindow.tsx` |
| chatHistoryWindow | `quickChatHistory` | `ChatHistoryWindow.tsx` (label "AI Results"/"Chat History") |
| observationalMemoryWindow | `observationalMemoryWindow` | `ObservationalMemoryWindow.tsx` |

---

## Table A — Functionality, Coverage & Composition

| Panel | Domain | Purpose | Maturity | Create(M/I/AI) | Seed | Edit | Manage | Rel | Exec | Fidelity gap | Family | Consolidation verdict | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| agentRunWindow | Agents | Run/chat an agent anywhere (route `/agents/[id]/run` as a window) | Gold | — | ✓ initialAgentId/conv | — | ◑ conv sidebar (rename/fav/archive) | ✗ | ✓ live run via AgentConversationColumn | no new-run mode controller (route has more); single-agent only | Content(run tab), RunHistory, ChatHistory | **merge-to-modes** — IS the `run` tab of agentContentWindow; keep distinct only as the lightweight distribution entry | distribution gold std — keep, dedupe vs Content run-tab (P2·M) |
| agentSettingsWindow | Agents | Edit agent "info" fields (name/desc/avatar/meta) w/ multi-agent tabs | Solid | — | ✓ initialAgentId | ✓ AgentSettingsForm | ◑ multi-agent tabs+sidebar | ✗ | ✗ | strict SUBSET of Content "overview"/"settings" tabs; own tab/sidebar shell duped | **Content, RunHistory, Run** | **merge-to-modes (collapse)** — = Content limited to overview/settings; redundant shell | fold into agentContentWindow `tabs=['overview','settings']` (P1·M) |
| agentContentWindow | Agents | Full agent build/edit workspace — 12 tabs incl. run/versions/history/share/json | Gold | — | ✓ initialAgentId+initialTab+tabs | ✓ all builder cores | ✓ multi-agent tabs, dirty-guard, picker fallback | ◑ tools/context/variables slots | ✓ `run` tab (AgentRunWrapper) | none (it's the superset) | **THE family head** — Settings, RunHistory, Run, ChatHistory are tab-subsets | **already-one (canonical)** — make others `tabs=[…]` presets of THIS | canonicalize as the one agent panel; props-drive subsets (P1·L) |
| agentContentSidebarWindow | Agents | Version-grouped conv history sidebar EMBEDDED in Content "history" tab | Solid | — | — | — | ◑ browse conv by version | ✗ | — read-only | NOT a window (no WindowPanel/overlayId); dup of RunHistory sidebar logic | RunHistory, Content history-tab | **keep-separate-justified** (it's a leaf unit, not a panel) — but dedupe vs RunHistory | extract shared version-grouped-conv sidebar primitive (P2·M) |
| agentConnectionsWindow | Agents | Manage agent customizations/connections by scope (user/org/scope) | Solid | ◑ via sections | ✓ section/scope/itemId | ✓ in body | ✓ section sidebar + ScopePicker | ✓ scope-bound assignments | ✗ | none notable; well-built | standalone | keep-separate-justified (distinct domain) | add std ctrls + surface (P2·S) |
| agentRunHistoryWindow | Agents | Browse one agent's runs grouped by version, read-only display | Solid | — | ✓ agentId+convId | — | ◑ version groups | ✗ | ✗ (read-only) | overlaps Content `history` tab + ChatHistory; own sidebar dup'd | **Content history-tab, ChatHistory, RunSidebar** | **merge-to-modes** — = Content `tabs=['history']` scoped to one agent | fold into Content history preset OR shared sidebar (P1·M) |
| agentImportWindow | Agents | Convert external agent JSON/system/playground/framework → new agent | Solid | ✓ I (import) | ✓ source+text | — | ◑ source category sidebar | ✗ | ✓ creates agent | local state machine (not Redux); converterRegistry good | standalone (create path) | keep-separate-justified (import wizard) | — (healthy) |
| agentConvertSystemWindow | Agents | Link/sync user agent ↔ system twin (pull/push/copy/convert) | Solid | ◑ create twin | ✓ agentId | — | — | ✓ user↔system link | ✓ push/pull | admin-ish; no-agent empty state ok | standalone | keep-separate-justified | — (healthy) |
| agentCreateAppWindow | Agents | Publish an agent as a public app | Solid | ✓ M (publish) | ✓ agentId | — | — | ✓ app↔agent | ✓ POST /api/agent-apps | local useState; success screen ok | standalone | keep-separate-justified | — (healthy) |
| agentShortcutQuickCreateWindow | Agents | Create/link an agent shortcut (essentials/vars/details/adv/link/json tabs) | Solid | ✓ M | ✓ agentId+tab | ✓ via hook | ◑ tab sidebar | ✓ shortcut→agent link | ✓ save/link | logic in `useShortcutQuickCreate` hook (good) | standalone | keep-separate-justified | — (healthy) |
| chatHistoryWindow | Agents | Cross-agent conversation browser (every accessible agent) | Solid | — | ✓ convId+groupBy | — | ◑ source-filter/date/agent grouping | ✗ | ◑ workspace variant has input | window is read-only; data layer shared w/ Utilities-Hub workspace (good) | **RunHistory, Content history-tab** | **merge-to-modes** — cross-agent variant of the same conv-history engine | unify conv-history surfaces (P1·M) |
| observationalMemoryWindow | Agents | Admin inspector for conversation observational memory (metadata/cost/live) | Solid | — | ✓ convId | — | ◑ conv sidebar | ✗ | ✗ (read-only monitor) | admin/debug-flavored; persisted not ephemeral | standalone (diagnostics) | keep-separate-justified | — (healthy) |

---

## Table B — Utility, Surface & Construction

| Panel | Header actions | Footer(+variant) | Sidebar | 2nd panel | Tabs | Persist (collect/url/heavy/autosave) | Pop-out | Tray (snap/preview) | Ref/cb | Surface reg | Std ctrls (agents/help) | Help-ctx wiring | Canonical core | E2E state | Underused | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| agentRunWindow | titleNode AgentListDropdown + body strip (new-run/save/options) | ✗ | ✓ conv list | ✗ | per-feat (none) | ✓/✓ `agent`/✗/◑ live-conv | ✓ (primitive) | default/✗ | opener ✓ (no cb) | ◑ registers **execution** surface (surfaces.slice, fork-routing) — NOT panel-surface | ✗ none | ✗ none | **built-from-shared** (AgentConversationColumn = same as `/agents/[id]/run`; AgentSaveStatus/OptionsMenu/ModeController shared) | ✓ DB→Redux→selectors (agent-definition, conversation-list, execution-system) | secondaryPanel, tray preview, **panel-surface + std-ctrls + help** | add panel-surface+std-ctrls (P1·M) |
| agentSettingsWindow | ✗ | ✗ | ✓ AgentSidebar (shared) | ✗ | per-feat (AgentTabs, shared) | ✓/✓ `agent-settings`(m=as)/✗/✗ | ✓ | default/✗ | opener ✓ | ✗ | ✗ | ✗ | **built-from-shared** (AgentSettingsForm + AgentSidebar/AgentTabs = same units Content uses) | ✓ fetchFullAgent→selectors | whole panel is a dup shell | fold into Content (P1·M) |
| agentContentWindow | actionsRight (refresh/unsaved) | footerLeft FooterControls (name/copy-id/save-cancel) | ✓ AgentSidebar (shared) | ✗ | **bespoke CompactTabStrip + AgentTabs** (12 tabs) | ✓/✓ `agent-advanced-editor`(m=ac)/✗/✗ | ✓ | default/✗ | opener ✓ (`useOpenAgentContentWindow`) + Controller | ✗ | ✗ | ✗ | **built-from-shared** (every tab = a canonical agents core: Messages, SystemMessage, AgentVariablesPanel, AgentToolsManager, AgentContextSlotsManager, AgentSettingsCore/Form, AgentSharePanel, AgentVersionDiffPage, AgentRunWrapper, JsonInspector) | ✓ full agent-definition slice | secondaryPanel, first-class tab API (S4), surface+std-ctrls+help | canonicalize + tab-API (P1·L) |
| agentContentSidebarWindow | — | — | self (Resizable) | — | — | — (host owns) | — | — | — embedded | ✗ | ✗ | ✗ | built-from-shared (AgentConversationDisplay, AgentListDropdown) | ✓ conversation-list selectors | — | extract shared conv sidebar (P2·M) |
| agentConnectionsWindow | actionsRight ScopePicker | ✗ | ✓ AgentConnectionsSidebar | ✗ | per-feat (sections) | ✓/✗/✗/✗ (hydrate+collect via UI slice) | ✓ | default/✗ | opener ✓ | ✗ | ✗ | ✗ | built-from-shared (agent-connections feature components) | ✓ **exemplary** — hydrateUi + selectors + collect from store.getState() | urlSync, surface, std-ctrls | add surface+std-ctrls (P2·S) |
| agentRunHistoryWindow | ✗ | ✗ | ✓ bespoke version-group sidebar | ✗ | per-feat | ✓/✗/✗/✗ | ✓ | default/✗ | opener ✓ | ✗ | ✗ | ✗ | ◑ (AgentConversationDisplay + AgentListDropdown shared; sidebar forked vs Content/ChatHistory) | ✓ conversation-list selectors | dup sidebar; urlSync; surface | fold/dedupe sidebar (P1·M) |
| agentImportWindow | ✗ | ✗ | ✓ source category list | ✗ | per-feat | ✓/✗/✗/✗ | ✓ | default/✗ | opener ✓ | ✗ | ✗ | ✗ | built-from-shared (converterRegistry, ImportQuickFixes) + createAgent thunk | ◑ local state machine; createAgent is Redux | surface | — |
| agentConvertSystemWindow | ✗ | ✗ | ✗ | ✗ | none | ✗/✗/✗/✗ (ephemeral) | ✓ | default/✗ | opener ✓ | ✗ | ✗ | ✗ | built-from-shared (AgentSyncBody, AgentComingSoonContent) | ✓ (body owns) | surface | — |
| agentCreateAppWindow | actionsLeft (system-app badge) | ✗ | ✗ | ✗ | none | ✗/✗/✗/✗ (ephemeral) | ✓ | default/✗ | opener ✓ | ✗ | ✗ | ✗ | built-from-shared (CreateAgentAppForm) + thunks | ◑ local submit state; createAgent Redux | surface | — |
| agentShortcutQuickCreateWindow | actionsRight Reset | footerLeft scope+errors / footerRight cancel/save | ✓ tab nav | ✗ | bespoke tab sidebar (6) | ✓/✗/✗/✗ (ephemeral) | ✓ | default/✗ | opener ✓ | ✗ | ✗ | ✗ | built-from-shared (ShortcutQuickCreateBody + useShortcutQuickCreate) | ✓ hook→Redux | surface | — |
| chatHistoryWindow | ✗ (title suffix only) | ✗ | ✓ ConversationHistorySidebar (canonical) | ✗ | per-feat | ✓/✗/✗/✗ | ✓ | default/✗ | opener ✓ | ✗ | ✗ | ✗ | **built-from-shared** (ConversationHistorySidebar, AgentConversationDisplay/Column; same data layer as ChatHistoryWorkspace) | ✓ conversation-history scoped slice | surface, std-ctrls | unify conv-history (P1·M) |
| observationalMemoryWindow | ✗ | ✗ | ✓ bespoke conv sidebar | ✗ | per-feat | ✓/✗/✗/✗ | ✓ | default/✗ | opener ✓ | ✗ | ✗ | ✗ | built-from-shared (ObservationalMemoryCore) | ✓ observational-memory slice/selectors | surface | — |

---

## Table C — Availability & Placement

| Panel | Opener? | Ref wired (popout/cb) | Portable vs route-locked | Tools Grid (tile/category) | Placement issue | Bespoke call sites (count + surfaces) | Usage gap | Action |
|---|---|---|---|---|---|---|---|---|
| agentRunWindow | ✓ `useOpenAgentRunWindow` + Controller | popout ✓ (default) / cb ✗ | **portable** (distribution gold std) | ✓ `tile.agent-run` / agents | ok | **5+ surfaces:** (1) AgentOptionsMenu (the hub — itself rendered in AgentRunHeader, AgentHeader, AgentHeaderMobile, AgentWidgetsPage, AgentAdminFindUsagesWindow) · (2) item-presentation `useOpenItemPresentation` (`initialAgentId`) · (3) code-editor `useEditorContextMenuActions` (raw `openOverlay`) | none — exemplary | **keep as distribution model**; migrate code-editor raw dispatch → opener hook (P2·S) |
| agentSettingsWindow | ✓ | popout ✓ / cb ✗ | portable | ✓ `tile.agent-settings` / agents | redundant tile (subset of Content) | 1 — AgentOptionsMenu | low standalone value | retire tile when folded (P1·S) |
| agentContentWindow | ✓ `useOpenAgentContentWindow` + Controller | popout ✓ / cb ✗ | portable | ✓ `tile.agent-advanced-editor` (seedInitialAgentId) / agents | ok | 1 — AgentOptionsMenu (`openAdvancedEditor`) | **under-distributed** for the superset panel — should be reachable from agent cards/build route header directly | add bespoke openers from agent list/build header (P1·M) |
| agentContentSidebarWindow | ✗ (embedded only) | — | embedded in Content history tab | ✗ | not a window (correct) | embedded by AgentContentWindow | n/a | — |
| agentConnectionsWindow | ✓ | popout ✓ / cb ✗ | portable | ✓ `tile.agent-connections` / agents | ok | 0 bespoke (Tools-Grid + ?) | under-surfaced — should hang off agent context/tools UIs | add bespoke call sites (P2·M) |
| agentRunHistoryWindow | ✓ | popout ✓ / cb ✗ | portable | ✓ `tile.agent-run-history` / agents | overlaps ChatHistory + Content | 1 — AgentOptionsMenu | redundant w/ Content history-tab | retire/fold (P1·S) |
| agentImportWindow | ✓ | popout ✓ / cb ✗ | portable | ✓ `tile.agent-import` / agents | ok | 1 — AgentOptionsMenu | could surface on `/agents` New menu | add to agents list "New" (P2·S) |
| agentConvertSystemWindow | ✓ | popout ✓ / cb ✗ | portable | ✓ `tile.agent-convert-system (new)` / agents | "(new)" tag on a real panel — Tools-Grid hygiene | 1 — AgentOptionsMenu | ok | drop "(new)" label (P2·S) |
| agentCreateAppWindow | ✓ | popout ✓ / cb ✗ | portable | ✓ `tile.agent-create-app (new)` / agents | "(new)" tag on a real panel | 1 — AgentOptionsMenu | ok | drop "(new)" label (P2·S) |
| agentShortcutQuickCreateWindow | ✓ `useOpenAgentShortcutQuickCreateWindow` (→ `agentAdminShortcutWindow`) | popout ✓ / cb ✗ | portable | ✓ `tile.agent-admin-shortcut`? (see agents.md) | name drift (file/opener "ShortcutQuickCreate" vs overlay "agentAdminShortcut") | 1 — AgentOptionsMenu | ok | — |
| chatHistoryWindow | ✓ `useOpenQuickChatHistory` (0 hook sites) | popout ✓ / cb ✗ | portable | ✓ `tile.ai-results` "Chat History" / agents | label/slug drift (`quickChatHistory` / "AI Results" / "Chat History") | Tools-Grid + Utilities-Hub workspace embed | reachable but naming confusing | normalize naming (P2·S) |
| observationalMemoryWindow | ✓ | popout ✓ / cb ✗ | portable | ✓ `tile.observational-memory`? (admin) | admin/diagnostics — fine in agents cat | low bespoke | ok (admin tool) | — |

---

## Synthesis — key findings for this chunk

1. **The consolidation verdict (THE app-wide question): agentContentWindow is the family head; Settings + RunHistory + Run are tab-subsets of it.** `AgentContentWindow` (`agentAdvancedEditorWindow`) already exposes all of these as tabs — `overview`/`settings` (= agentSettingsWindow), `run` (= agentRunWindow, via `AgentRunWrapper`), `history` (= agentRunHistoryWindow + uses the same `AgentContentHistoryPanel`). It even shares the SAME shell pieces (`AgentSidebar`/`AgentTabs` from `AgentSettingsWorkspace`). The correct end state: **one mode/props-driven agent panel** where the others become `tabs=[…]` presets. agentSettingsWindow and agentRunHistoryWindow are the strongest **collapse** candidates (pure subsets with forked shells). agentRunWindow stays distinct ONLY as the lightweight, widely-distributed run entry (different default geometry + sidebar = conv list, not agent picker), and chatHistoryWindow stays distinct as the *cross-agent* (vs single-agent) variant of the conv-history engine.

2. **Canonical-core reuse is genuinely strong here — this chunk IS the gold standard the principle points at.** Every tab in agentContentWindow renders a shared agents-core component (Messages, SystemMessage, AgentVariablesPanel, AgentToolsManager, AgentContextSlotsManager, AgentSettingsCore/Form, AgentSharePanel, AgentVersionDiffPage, AgentRunWrapper, JsonInspector). agentRunWindow's body is the SAME `AgentConversationColumn` the real `/agents/[id]/run` route (`AgentRunnerPage`) uses. agentConnectionsWindow is the exemplary E2E-state panel (`hydrateUi` + selectors + `collectData` reading `store.getState()`). **The only forks are at the SHELL level, not the leaf level:** three windows each re-implement a conversation/version sidebar (agentRunWindow, agentRunHistoryWindow, agentContentSidebarWindow, partially chatHistoryWindow) — extract one shared conv-history sidebar primitive.

3. **agentRunWindow is the distribution gold standard, but its 5+ surfaces flow through ONE hub.** Real bespoke call sites: (a) `AgentOptionsMenu` (the agent-actions menu — itself rendered in `AgentRunHeader`, `AgentHeader`, `AgentHeaderMobile`, `AgentWidgetsPage`, `AgentAdminFindUsagesWindow`), (b) `features/item-presentation/useOpenItemPresentation.ts` via `useOpenAgentRunWindow({initialAgentId})`, (c) `features/code/agent-context/useEditorContextMenuActions.ts` (raw `openOverlay({overlayId:"agentRunWindow"})` — should use the opener hook for type-safety). The opener (`useOpenAgentRunWindow` + `AgentRunWindowController`) is the model to replicate. **By contrast, the superset panel agentContentWindow has only ONE call site (AgentOptionsMenu) — under-distributed for the most capable panel.**

4. **Platform principles #2/#3/#1 (surface registration + std header controls + help-assistant) are 0% across the entire chunk.** NO agent panel is registered as an assignable surface in `features/surfaces/` (the `registerSurface` in agentRunWindow is the *execution* surface for fork-outcome routing — a different system, not the panel-as-assignable-surface from principle #2). NO panel has the Agents/Help header controls (S1) or help-assistant KV-context wiring (S2) — confirmed unbuilt in `WindowPanel.tsx`. This is the biggest cross-cutting gap; it's a system primitive (S1–S3), so the per-panel action is "adopt once shipped," but agent panels are the natural first adopters (every one already holds a clean `agentId` as its KV context).

5. **Secondary panel + tray previews are universally unused.** No agent panel uses `secondaryPanel` (WindowPanel supports it) or `renderTrayPreview` (all default tray). agentContentWindow (versions/diff, json) and agentRunWindow (run + a reference/context side) are the obvious `secondaryPanel` candidates.

6. **Tools-Grid hygiene + naming drift.** Real, working panels carry "(new)" stub-style labels (`agentConvertSystemWindow`, `agentCreateAppWindow`) — drop the tag. Three identity drifts: chatHistoryWindow = file `ChatHistoryWindow` / overlay `quickChatHistory` / tile "Chat History" / window title "AI Results"; agentShortcutQuickCreateWindow = file/opener "ShortcutQuickCreate" / overlay `agentAdminShortcutWindow`; agentContentWindow = file "Content" / overlay `agentAdvancedEditorWindow` / opener `useOpenAgentContentWindow`. Normalize names so search/find-usages and future maintainers aren't misled.

7. **agentContentSidebarWindow is a misnomer in the chunk spec — it is NOT a window.** `AgentContentHistoryPanel.tsx` is an embeddable resizable panel (no `WindowPanel`/`overlayId`), rendered inside agentContentWindow's `history` tab. The registry's `contentHistory` overlayId is a *different* (content-editor) panel. Treat this as a leaf unit, and dedupe its version-grouped conversation list against agentRunHistoryWindow's near-identical sidebar.

---

## Change Log
- 2026-06-23 — Created. Agents-core chunk (12 panels) filled (Tables A/B/C). Verdict: agentContentWindow is the canonical family head; agentSettingsWindow/agentRunHistoryWindow collapse into it as tab presets; agentRunWindow kept as distribution entry; chatHistoryWindow kept as cross-agent variant. Canonical-core leaf reuse strong, shell-level conv-sidebar forked ×3-4. Surface/std-ctrls/help wiring 0% across chunk (system gap S1–S3). Distribution flows through AgentOptionsMenu hub + item-presentation + code-editor.
