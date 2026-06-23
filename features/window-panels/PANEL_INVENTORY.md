# Window Panel Inventory — Source of Truth

> Purpose of THIS doc: a complete, structured inventory of every window panel and the current state of each, so we can see gaps and assign parallel work. Three linked tables (A/B/C) share one panel-identity key. Per-category row files live in [`docs/inventory/`](./docs/inventory/); this file holds the model, the column contracts, the system-level build list, and the cross-cutting findings.
>
> Status: STRUCTURE AGREED (2026-06-22). Row fill-in across ~120 registered panels in progress.

---

## 1. Why window panels exist (shared mental model)

AI Matrx is a workspace where someone is always deep in **one** thing (building an agent, shaping a workflow, focusing on PDF→knowledge flow) but constantly needs **other** things without losing that focus or its state. Browser tabs don't share state and can't be seen together. **A window panel is the "anywhere, secondary-context" form of a feature, sharing one Redux state with that feature's full route.** While building an agent you pull PDF sample data, jot notes, grab files, run a quick query, capture a voice memo — and when you pivot to a *different* primary task, the panels follow you and the agent itself becomes a panel you can run/test in place. Secondary purpose: a **non-blocking replacement for modals** (settings, dialogs) so the user is never screen-blocked.

The system only pays off when, for every feature: (a) it has a well-built panel form, (b) it's invokable from *anywhere*, (c) it's *surfaced* where users need it, and (d) it covers the *functional modes* that feature requires. The three tables measure exactly these.

## 2. The full capability set a panel can maximize

| Group | Capabilities |
|---|---|
| **Chrome slots** | header (`title`/`titleNode`/`actionsLeft`/`actionsRight`), footer (`footer`/`footerLeft/Center/Right`, `footerVariant: bar\|rich`), left **sidebar** (collapsible/resizable), **secondary right panel**, content-only body |
| **Tabs** | ⚠️ No built-in WindowPanel tab system yet (reserved fields only); tabs are per-feature → the gap behind the Phase-5 tab API |
| **Persistence** | `overlayId` (key), `onCollectData`, `urlSync` (`?panels=`), `window_sessions` DB, `heavySnapshot`, autosave-on-blur, `ephemeral`, close→delete, hydrate-on-load, instance GC |
| **Geometry/interaction** | width/height/position/min/max, `fitContent`, drag, 8-way resize, focus/z-order, minimize, maximize, snap (L/R/T/B/centre), arrange-all, off-screen rescue, hide-all |
| **Pop-out** | detach to native OS window (Document-PiP/popup); **state survives** via portal; dock-back; reload-recovery toast |
| **Tray** | minimize chips, snapshots / `renderTrayPreview`, drag-reorder, minimize-all/restore-all |
| **Instance mode** | `singleton` vs `multi` (concurrent instances by id) |
| **Mobile** | `mobilePresentation` (fullscreen/drawer/card/hidden) + `mobileSidebarAs` |
| **Close binding** | compile-enforced `overlayId` XOR `onClose` |
| **"Ref system" (portability)** | **Openers** (`useOpenX` → render globally, not route-bound) · **popout registry** (`registerPopoutOpener`/`usePopoutControl` — control a live window anywhere) · **callback registry** (`callbackManager` + `callbacks.ts` — typed events back to the caller; only an opaque id through Redux) |
| **Universal menu** | the **Tools Grid** (`tools-grid/toolsGridTiles.ts`, shell sidebar) |
| **Surfaces & agents** | each panel SHOULD be a registered **surface** so users/system can assign custom agents + agentic capabilities to it |
| **Diagnostics** | silent-render watchdog, debug strip, deprecation marker (red ring + banner) |

**Functional modes** a panel should cover: **Create** (manual/import/AI) · **Create-from-seed** (Quick-Create) · **Edit** · **Manage** (deep/multi-tab) · **Create relationships** · **Quick-execute** (fire an API / get work done).

## 3. Platform principles being built into the system (evaluate every panel against these)

1. **Help Assistant everywhere.** Help icons across the app open an assistant that has **full knowledge of what the user is working on**. A panel manages its state as **key-value context** + **page-level awareness** (held or referenced) and passes it to the help assistant + agents. The help UI is the standard chat interface dropped into a **right help side-panel** (separate from the main `secondaryPanel`).
2. **Every panel is a registered surface.** That registration is what lets users/system assign custom agents + agentic capabilities to the window.
3. **Two NEW standard header controls** (right side, joining the existing 3 traffic-lights + sidebar toggle): **(a) Agents** — lists agents assigned to the surface (pro-text-area style) + allows manually specifying agent IDs in code; **(b) Help** — renders the right help side-panel (double duty: help assistant AND launch-agent-by-id).
4. **Canonical core components.** Always ask: is this built from canonical core pieces shared across everything (the agent build/run model — 2 components used everywhere)? Track each panel's position on that spectrum **and what competes with it** (duplicates → rewrite-core / merge).
5. **End-to-end shared, persistent state from the core.** DB → Redux slice (thunks/selectors) → canonical core UIs. Where a panel forks/locals its state instead, that's a fix.
6. **Mode-consolidation.** If a domain has 5-7 panel variations (view agent / edit agent / browse-with-tabs / quick-update-in-builder), prefer **one component driven by modes + props** (single-item mode; tab mode reveals the hidden sidebar; etc.) — unless genuinely too different to combine. Track the family + verdict per panel.

## 4. The three tables — column contracts

### Table A — Functionality, Coverage & Composition (*what it does vs should*)
`Panel | Domain | Purpose | Maturity (Missing/Stub/Partial/Solid/Gold) | Create (M/I/AI) | Seed | Edit | Manage | Relationships | Quick-execute | Fidelity gap | Domain family (sibling panels) | Consolidation verdict (already-one / merge-to-modes / keep-separate-justified) | Action (Priority·Effort)`

### Table B — Utility, Surface & Construction (*is it using the platform's power + built canonically*)
`Panel | Header actions | Footer (+variant) | Sidebar | Secondary panel | Tabs | Persistence (collect/urlSync/heavy/autosave) | Pop-out ready | Tray (snapshot/preview) | Ref/callback | Surface registered | Std header controls (agents/help) | Help-assistant context wiring (KV state + page awareness) | Canonical core (built-from-shared / competing duplicates) | End-to-end state (DB→Redux→selectors→core / local/forked) | Underused utilities | Action (Priority·Effort)`

### Table C — Availability & Placement (*reachable + actually used*)
`Panel | Opener? | Ref wired (popout/callback) | Portable vs route-locked | Tools Grid (tile/category) | Placement issue | Bespoke call sites (count + surfaces) | Usage gap | Action (Priority·Effort)`

Legend: ✓ present · ◑ partial · ✗ missing · — n/a. Action `Priority` = P0/P1/P2; `Effort` = S/M/L.

## 5. System-level build list (cross-cutting — not per-panel)

| # | Capability | Status | Where |
|---|---|---|---|
| S1 | **Std header controls**: Agents icon (surface agents, pro-text-area style + code-level IDs) + Help icon (right help side-panel; double-duty launch-agent-by-id) | TO BUILD (primitive) | `WindowPanel.tsx` header |
| S2 | **Help Assistant + panel context**: KV-state + page-awareness held/referenced by the panel, passed to help + agents; chat UI in a right help side-panel | TO BUILD | primitive + surfaces |
| S3 | **Surface registration for every panel** | ROLL OUT | surfaces system |
| S4 | **First-class tab API** synced with the sidebar (active + open indicators) | Phase-5 (notated) | primitive |
| S5 | **Popout / pop-in positioning fix** (center + "drag me" hint / land-at-cursor, no off-page) | Phase-5 (notated) | `popout/` + rect clamp |
| S6 | **`footerVariant: rich`** (rich footers, e.g. agent composer) | IN FLIGHT (footer agent) | `WindowPanel.tsx` footer |
| S7 | **Per-domain canonical-core consolidation** (driven by Table A verdicts + Table B canonical-core column) | ONGOING | per domain |

## 6. Cross-cutting findings (known, pre-fill-in)

- **Orphan:** `resourcePickerWindow` is registered with a component but has NO opener and NO open path — literally unreachable. Add opener OR delete (`remove-window-panel`).
- **Surfacing gap:** utility panels (Tasks, Voice/VoicePad, PDF Extractor, Scraper, Cloud Files) are **Tools-Grid-only** with ~0 bespoke call sites — under-surfaced where users actually need them.
- **Gold standard to replicate:** `agentRunWindow` (run-custom-agent-by-id via `useOpenAgentRunWindow({initialAgentId})`) is fired from 5+ surfaces (agent headers, agent item cards, code-editor context menu) — the model for distributing a panel.
- **Tools Grid hygiene:** several "(new)" tiles point at **deprecated stub** windows; a block of agent interface-variation **demos are parked in the `admin` category** as if first-class; genuine missing tiles: `picklistManagerV1/V2`, `projectsWindow`, `quickChatWindow`.
- **Openers:** 121 opener files / 120 registered panels — near-total coverage (the 3 content-editor windows share one variant-dispatched opener).

## 7. Method for the fill-in (Phase 2)

~120 registered panels (`registry/windowRegistryMetadata.ts` `STATIC_REGISTRY`). Chunk by domain; one subagent per chunk **deep-reads each panel** and writes its A/B/C rows to `docs/inventory/<chunk>.md`. This master doc indexes the chunks (below) and carries the synthesis. Subagents do NOT edit `WindowPanel.tsx`/FEATURE.md/SKILL.md (the footer + docs agents own those).

### Chunk index (fill-in status)
| Chunk | Panels (approx) | Row file | Status |
|---|---|---|---|
| Code | CodeWorkspace, CodeEditor, CodeFileManager, MultiFileSmartCodeEditor, SmartCodeEditor | `docs/inventory/code.md` | ⬜ |
| Notes & Tasks | Notes, NoteInfo, QuickNoteSave, QuickTasks, TaskEditor, TaskQuickCreate | `docs/inventory/notes-tasks.md` | ⬜ |
| Agents | AgentRun, AgentSettings, AgentContent(+Sidebar), AgentConnections, AgentRunHistory, AgentDebug, AgentFindUsages(+Admin), AgentImport, AgentConvertSystem, AgentCreateApp, AgentShortcutQuickCreate, ChatHistory, ObservationalMemory, MessageAnalysis, AgentAssistantMarkdownDebug, AgentPlaceholders | `docs/inventory/agents.md` | ⬜ |
| Files & Media | CloudFiles, FilePreview, Gallery, ImageUploader, ImageViewer, CropStudio/Preview/InitialCrop, PdfExtractor | `docs/inventory/files-media.md` | ⬜ |
| Content & Data | ContentEditor(+List+Workspace), MarkdownEditor, QuickData, ListManager, Workbook/DocumentEditor, Picklist V1/V2 | `docs/inventory/content-data.md` | ⬜ |
| Context, Scopes & Projects | ContextSwitcher, ScopeEdit, HierarchyCreation, ContextAssignment, Projects, CreateProject, CreatorHub, ResourcePicker, ItemDetail | `docs/inventory/context-scopes.md` | ⬜ |
| Comms & Studio | Messages, SingleMessage, QuickChat, TranscriptStudio, VoicePad(+Advanced), AiVoice, Scraper, News, Dictionary | `docs/inventory/comms-studio.md` | ⬜ |
| Admin/Debug & Utility | StateViewer, InstanceUIState, ChatDebug, ExecutionInspector, StreamDebugHistory, Feedback, EmailDialog, ShareModal, CuratedIconPicker, DiffViewer, BrowserFrame/Workbench, WhatsApp* | `docs/inventory/admin-utility.md` | ⬜ |

## 8. Worked example rows (the columns against panels already inspected)

**Table A**
| Panel | Domain | Purpose | Maturity | Create(M/I/AI) | Seed | Edit | Manage | Rel | Exec | Fidelity gap | Family | Consolidation verdict | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Notes | Notes | Capture/organize notes anywhere | Gold | ✓/✗/◑ | ✓ QuickSave | ✓ | ✓ folders/tags/versions/split | ◑ scope/task | — | tabs per-feature | NoteInfo, QuickNoteSave | keep-separate-justified (distinct jobs) | tab API (P2·L) |
| CodeEditorWindow | Code | Edit code anywhere | Solid | ◑ | ✗ | ✓ | ◑ (CodeFileManager sibling) | ✗ | ◑ run/agent-ctx | manage is a sibling | SmartCodeEditor, MultiFile, CodeFileManager, CodeWorkspace | **merge-to-modes?** (5 code panels — evaluate one mode-driven editor) | consolidation review (P1·L) |

**Table B**
| Panel | Header | Footer | Sidebar | 2nd | Tabs | Persist | Popout | Tray | Ref | Surface | Std ctrls | Help ctx | Canonical core | E2E state | Underused | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Notes | ✓ | ✓ | ✓ | ✓ | per-feat | ✓/✓/✗ | ✓ | default | opener ✓ | ✗ not a surface | ✗ none | ✗ none | ◑ (leaf units canonical; shell was not) | ✓ DB→Redux→selectors | heavy, tray preview, **surface+help+agents** | add surface+std-ctrls (P1·M) |
| CodeEditorWindow | ✓ | ◑ | ✗ | ✗ | per-feat | ✓/✗/✗ | ✓ | default | opener+cb ✓ | ✗ | ✗ | ✗ | ◑ | ◑ | secondaryPanel(diff/tree), surface+help+agents | add surface+std-ctrls (P1·M) |

**Table C**
| Panel | Opener | Ref | Portable | Tools Grid | Placement | Bespoke calls | Usage gap | Action |
|---|---|---|---|---|---|---|---|---|
| Notes | ✓ | popout ✓ | portable | ✓ (notes) | ok | 3 (tool-viz, openNoteInWindow) | ok | — |
| CodeEditorWindow | ✓ | popout+cb ✓ | portable | ✓ (general) | ok | grid + code ctx-menu | add "edit in panel" buttons | wire bespoke call sites (P2·M) |
| ResourcePickerWindow | ✗ ORPHAN | none | unreachable | ✗ | — | 0 | **cannot be opened** | add opener or delete (P1·S) |

---

## 9. Cross-cutting synthesis & prioritized backlog — FILL-IN COMPLETE (all 8 chunks, 2026-06-22)

Per-panel rows live in [`docs/inventory/`](./docs/inventory/) (code · notes-tasks · agents-core · agents-debug · files-media · content-data · context-scopes · comms-studio · admin-utility). Every item below is sized to become a discrete subagent task.

### Systemic platform gaps (build once, roll out — biggest leverage)
- **[S1/S2/S3 · P1] Surfaces + Agents/Help header controls + help-context = 0% across the ENTIRE fleet.** Build the two standard header controls (Agents list / Help side-panel) into `WindowPanel`, register every panel as a surface, wire KV-context + page-awareness. First adopters (already agent-bound): agent panels, scraperWindow (the only existing surface), workingDocumentWindow, notesWindow.

### Orphans / unreachable — delete or wire (`remove-window-panel`)
resourcePickerWindow (DELETE — latent-crash open path) · codeWorkspaceWindow window-form (wire/retire) · quickNoteSaveWindow (retire — opener 0 consumers) · **projectsWindow (P1 — unreachable: no tile + no callers + read-only body)** · agentOptimizerWindow + agentDataStorageWindow (DELETE — empty stubs) · adminStateAnalyzer (retire — twin, 0 callers).

### Stale/incorrect registry — P0 (user-visible)
- **agentFindUsagesWindow + agentAdminFindUsagesWindow** carry a stale `deprecated` block → SHIPPED features show a red "deprecated" ring/banner + destructive tile. Delete the 2 blocks. **(P0·S)**
- WhatsApp demo windows are in the prod `STATIC_REGISTRY`/`OVERLAY_IDS` (compile into core) → gate out. (P1·S) · StateViewerWindow passes no `overlayId` (unbound from manager). (P1·S) · emailDialogWindow submit is a STUB; the legacy modal sends. (P1·M)

### Canonical-core consolidations (merge-to-modes / kill duplicate cores)
| Family | Verdict | Pri |
|---|---|---|
| **Picklists V1/V2/V3 + ListManager** | **P0 4-way duplicate over the same tables** — owner picks the canonical core; delete the others + `/lists/v*` + windows; re-point ListManager | P0·L |
| **Agent panels** (Content/Settings/RunHistory/Run) | agentContentWindow is the head → fold Settings+RunHistory into tab presets; extract ONE shared conversation-history sidebar (3-4 forks) | P1·L |
| **Code editors** | merge CodeEditor↔MultiFile (same Monaco; `agentId?` flips agent); reconcile SmartCodeEditor + CodeWorkspace (2 competing IDE shells) | P1·L |
| **Content-editor windows** (editor/list/workspace) | already one opener+core → one mode-driven window | P1·M |
| **voicePad / voicePadAdvanced** | merge (Advanced's deltas are WindowPanel slots) → makes the FULL pad ubiquitous | P1·M |
| **Crop windows** (studio/preview/initialCrop) | merge to one mode-driven crop | P2·M |
| **Inspectors** (agentDebug/executionInspector/streamDebugHistory/messageAnalysis/instanceUIState) | one mode-driven inspector keyed by {agentId, conversationId, requestId} | P2·L |
| **Chrome-only pairs** (quickData win/sheet; markdown win/widget; email & share win/modal) | collapse each to one + presentation prop | P2·S |

### End-to-end-state violations (lift to DB→Redux→selectors→core)
quickData, listManager, all picklists (useState + direct Supabase; ListManager polls 5s), gallery favorites (localStorage), pdfExtractor history (local), hierarchyCreation (react-query, no slice), itemDetail (direct Supabase), newsWindow (local).

### fileHandler violations
pdfExtractorWindow (forks upload — raw FormData/fetch) · imageViewer (raw `<img>` — durability defect, chip filed).

### Surfacing gaps — grid-only, ~0 bespoke call sites
PDF Extractor · Cloud Files · Scraper · Crop · Gallery · QuickTasks · taskQuickCreate · agentConnections. Replicate the distribution **gold standards**: agentRunWindow (5+), taskEditor (7), notes (6), imageUploader/imageViewer/filePreview (5-6), voicePad (7), createProject (3). Highest value: fire PDF Extractor + Scraper from the agent builder / RAG.

### Tools-Grid hygiene
"(new)" tiles → empty stubs · ~10 agent interface-variation DEMOS parked in `admin` as first-class · missing tiles: projectsWindow, quickChatWindow, picklist V1/V2 (gated on the canonical decision).

### Naming/identity drift
agentContentSidebarWindow (not a window — `AgentContentHistoryPanel`) · quickTasksWindow (mislocated under `windows/context-scopes/`) · markdownEditorWindow (misnamed debug harness) · several file↔overlayId↔tile↔title drifts.

## Change Log
- 2026-06-22 — Created + FILLED IN. Structure agreed (3 linked tables); columns extended with Help-Assistant/surface/std-controls, canonical-core, end-to-end-state (Table B) and domain-family/consolidation (Table A). All ~120 registered overlayIds inventoried across 8 chunk files; cross-cutting synthesis + prioritized backlog added (§9).
