# Admin & Utility — Window Panel Inventory

> Chunk of [`PANEL_INVENTORY.md`](../../PANEL_INVENTORY.md). Covers the admin/debug inspectors, the modal-replacement quick-execute dialogs, the reusable utility primitives, the iframe browsers, and the WhatsApp demo windows.
> Legend: ✓ present · ◑ partial · ✗ missing · — n/a. Priority P0/P1/P2 · Effort S/M/L.

**Canonical overlayId map (the chunk-spec names differ from the real IDs):**

| Chunk-spec name | Real overlayId(s) | Component |
|---|---|---|
| stateViewerWindow | `adminStateAnalyzerWindow` (window) + `adminStateAnalyzer` (overlay/widget) | `components/admin/state-analyzer/StateViewerWindow.tsx` / `StateViewerOverlay.tsx` |
| instanceUIStateWindow | `instanceUIStateWindow` | `windows/admin/InstanceUIStateWindow.tsx` |
| feedbackWindow | `feedbackDialog` | `windows/FeedbackWindow.tsx` |
| emailDialogWindow | `emailDialogWindow` (window) **+ `emailDialog`** (legacy modal bridge) | `windows/EmailDialogWindow.tsx` |
| shareModalWindow | `shareModalWindow` (window) **+ `shareModal`** (legacy modal bridge) | `windows/ShareModalWindow.tsx` |
| curatedIconPickerWindow | `curatedIconPickerWindow` | `windows/icons/CuratedIconPickerWindow.tsx` |
| diffViewerWindow | `diffViewerWindow` | `windows/DiffViewerWindow.tsx` |
| browserFrameWindow | `browserFrameWindow` | `windows/iframe/BrowserFrameWindow.tsx` |
| browserWorkbenchWindow | `browserWorkbenchWindow` | `windows/iframe/BrowserWorkbenchWindow.tsx` |
| whatsApp* | `whatsappShellWindow`, `whatsappSettings`, `whatsappMedia` | `features/whatsapp-clone/windows/*` |

---

## Table A — Functionality, Coverage & Composition

| Panel | Domain | Purpose | Maturity | Create(M/I/AI) | Seed | Edit | Manage | Rel | Exec | Fidelity gap | Family | Consolidation verdict | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **adminStateAnalyzerWindow** (State Analyzer) | Admin/Debug | Inspect the entire Redux tree, per-slice, search slices | Solid | — | — | ✗ (read-only) | ◑ per-slice tabs + index + search | ✗ | — | read-only inspector; no copy-slice or diff-against-snapshot | StateViewerOverlay (modal twin), InstanceUIState, ExecutionInspector, StreamDebug, ChatDebug | **merge-to-modes** — overlay+window are the same UI in two chromes (collapse to one, present as window) | unify overlay/window (P2·M) |
| **adminStateAnalyzer** (State Analyzer overlay) | Admin/Debug | Same content as above, rendered as a `widget` overlay not a draggable window | Partial | — | — | ✗ | ◑ | ✗ | — | duplicate of the window with 0 bespoke callers | (above) | **merge-to-modes** — redundant second chrome; delete or fold into the window | retire overlay twin (P2·S) |
| **instanceUIStateWindow** | Admin/Debug | Inspect `instanceUIState` slice — per-conversation UI state, document-style closeable tabs + full-slice JSON | Solid | — | — | ✗ (read-only) | ◑ instance tree (sidebar) + tab strip + full-slice toggle + copy | ✗ | — | read-only; no live-edit/patch of instance state | StateAnalyzer, ExecutionInspector | keep-separate-justified (slice-specific deep inspector) | — |
| **feedbackDialog** (Feedback) | Utility / quick-execute | Submit bug/feature/suggestion + screenshot/attachments + voice; admin can assign | **Gold** | ✓/—/— (capture intent) | — | ◑ (own past items list) | ✗ | ✗ | ✓ submits to feedback DB + builds agent prompt | EmailDialog, ShareModal (modal-replacement family) | keep-separate-justified — **exemplar minimal quick-execute panel, NOT CRUD** | — |
| **emailDialogWindow** (Email) | Utility / quick-execute | "Email this to yourself" — single email field, validate, send | Solid | ✓/—/— | — | ✗ | ✗ | ✗ | ◑ (current root validates only; `emailDialog` bridge does real send) | `emailDialog` (legacy modal that actually sends content) | **merge-to-modes** — window variant duplicates the bridge; the window's submit is a stub vs the bridge's real send | unify email variants (P1·M) |
| **emailDialog** (legacy modal bridge) | Utility / quick-execute | Same field, but wired to real content export/send (used by message + rich-doc export actions) | Solid | ✓/—/— | — | ✗ | ✗ | ✗ | ✓ real send | emailDialogWindow | **merge-to-modes** (see above) | unify email variants (P1·M) |
| **shareModalWindow** (Share) | Permissions/Sharing | Manage resource access — users/orgs/public tabs + email-link | Solid | ✓ grant/—/— | ✓ `{resourceType:"note"}` | ◑ (revoke/update level) | ◑ 3 access tabs | ✓ **core job is creating relationships (grants)** | ✓ share/revoke/email-link | tab content is canonical `features/sharing/*`; window is thin chrome | `shareModal` (legacy modal bridge) | **merge-to-modes** — window + bridge share the same sharing core in two chromes | unify share variants (P1·M) |
| **shareModal** (legacy modal bridge) | Permissions/Sharing | Same sharing core, modal chrome, multi-instance; used in public-chat + conversation actions | Solid | ✓/—/— | — | ◑ | ◑ | ✓ | ✓ | — | shareModalWindow | **merge-to-modes** (see above) | unify share variants (P1·M) |
| **curatedIconPickerWindow** | Utility primitive | Floating gallery → pick an icon id (Lucide / Matrx SVG / AI-brand / AI-action) + embedded Lucide site frame | Solid | — (picker, not creator) | — | ✗ | ✗ | ✗ | ✓ returns picked id via callback | reused by 3 features | keep-separate-justified — **callback-driven reusable primitive** | distribute wider (P2·S) |
| **diffViewerWindow** | Utility primitive | Movable diff of two strings; thin chrome over canonical `components/diff/DiffViewer` | Solid | — | — | ✗ | ✗ | ✗ | ✓ renders diff (split/inline, auto engine) | reused by 2 features + 2 demos | keep-separate-justified — **chrome over canonical headless core** | distribute wider (P2·S) |
| **browserFrameWindow** (Site Frame) | Utility / iframe | Single embedded site in an iframe with an address bar | Solid | — | ✓ `{url, windowTitle}` | ✗ | ✗ | ✗ | ✓ loads URL | browserWorkbenchWindow | **merge-to-modes** — single-tab is workbench with tabs hidden | consolidate to one browser (P2·M) |
| **browserWorkbenchWindow** (Site Workbench) | Utility / iframe | Multi-tab embedded browser + bookmarks sidebar | Solid | — | — | ✗ | ◑ tabs + bookmarks | ✗ | ✓ loads URLs | browserFrameWindow | **merge-to-modes** — superset of Site Frame; one component with a `tabs` mode | consolidate to one browser (P2·M) |
| **whatsappShellWindow** | Demo | Full WhatsApp clone (conversation list + chat) in one WindowPanel | **Stub/Demo** | ✗ | — | ✗ | ✗ | ✗ | ✗ (mock data) | demo only; not a product surface | settings + media siblings | keep-separate-justified (cohesive demo) — **but should NOT live in the production registry** | gate out of prod registry (P1·S) |
| **whatsappSettings** | Demo | WhatsApp settings two-pane push-nav (uses `ModalShell` template) | Stub/Demo | ✗ | — | ✗ | ◑ (nav stack) | ✗ | ✗ | demo only | shell + media | keep-separate-justified (demo) | gate out of prod registry (P1·S) |
| **whatsappMedia** | Demo | WhatsApp Media/Links/Docs tabbed gallery (uses `TabbedGalleryModal` template) | Stub/Demo | ✗ | — | ✗ | ◑ tabs | ✗ | ✗ | demo only | shell + settings | keep-separate-justified (demo) | gate out of prod registry (P1·S) |

**Modal-replacement exemplars (the core finding):** `feedbackDialog`, `emailDialogWindow`, and `shareModalWindow` are the platform's proof that the non-blocking modal-replacement doctrine works. All three are **thin composition roots over canonical cores**: the body holds ONLY content; Cancel/Send live in WindowPanel `footerLeft`/`footerRight` slots (Email, Feedback) or `actionsRight` (Share); state hoists into a `useXForm` hook so footer + body share it. They are correctly minimal quick-execute panels — none pretends to be a CRUD/manage surface. `feedbackDialog` is the most mature (screenshots, voice, attachments, agent-prompt builder, admin assignment) and is the **single best template** for any future "quick action" panel.

---

## Table B — Utility, Surface & Construction

| Panel | Header | Footer (+variant) | Sidebar | 2nd | Tabs | Persist (collect/url/heavy/auto) | Popout | Tray | Ref/callback | Surface | Std ctrls (agents/help) | Help ctx | Canonical core | E2E state | Underused | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **adminStateAnalyzerWindow** | titleNode + actionsLeft(back) | ✗ | ✓ slice search list | ✗ | per-feat (slice tabs) | ✗/✓/✗/✗ | default | default | ✗ | ✗ | ✗ | ✗ | ◑ reads store via `useAppStore().getState()` (snapshot, not reactive) | reads RootState directly (no selectors) | footer (slice metadata), surface, copy-slice | **bug: WindowPanel gets NO `overlayId`** — only `urlSyncKey`; not bound to the manager by id (P1·S) |
| **adminStateAnalyzer** (overlay) | — | — | — | — | — | ✗/✗/✗/✗ | — | — | ✗ | ✗ | ✗ | ✗ | duplicate of window | — | the whole panel (redundant) | retire (P2·S) |
| **instanceUIStateWindow** | actionsRight (view toggle) | ✓ count + "Copy slice" | ✓ instance tree | ✗ | per-feat (doc tabs in body) | ✗/✗/✗/✗ | default | default | ✗ | ✗ | ✗ | ✗ | ✓ canonical (`InstanceUIStateCore` + selectors) | ✓ DB→Redux→selectors→core | surface, popout-ready snapshot | add surface (P2·S) |
| **feedbackDialog** | title | ✓ rich (FooterLeft hint / FooterRight Cancel·Submit) | ✗ | ✗ | per-feat (type chips, not a tab API) | ✗/✓/✗/✗ | default | default | opener ✓ (no callback) | ✗ | ✗ | ✗ (but **richest page-context candidate** — already captures route) | ✓ canonical form; uses `InlineMediaRef`, `VoiceTextarea`, `FileUploadWithStorage` | ◑ writes to feedback DB via actions; reads own items | **surface+help+agents** (it already knows the route → ideal help-context donor) | add surface+std-ctrls (P1·M) |
| **emailDialogWindow** | title | ✓ rich (FooterLeft error / FooterRight Cancel·Send) | ✗ | ✗ | ✗ | ✓/✓/✗/✗ | default | default | opener ✓ | ✗ | ✗ | ✗ | ◑ form is canonical but **send is a stub** (clears + closes) | local form state | real send (delegate to `emailDialog` bridge), surface | unify w/ bridge (P1·M) |
| **emailDialog** (bridge) | (modal) | (modal) | ✗ | ✗ | ✗ | —/—/—/— | — | — | opener ✓ multi-instance | ✗ | ✗ | ✗ | ✓ real send path | passes content payload | window+bridge duplication | unify (P1·M) |
| **shareModalWindow** | titleNode (name+sub) + actionsRight (Email link) | ✗ (actions in tabs) | ✗ | ✗ | ✓ users/orgs/public (in body) | ✓/✓/✗/✗ | default | default | opener ✓ | ✗ | ✗ | ✗ | ✓ canonical sharing tabs (`features/sharing/*`) + `useSharing` | ✓ DB→hook→tabs | std-ctrls, popout | unify w/ bridge + add surface (P1·M) |
| **shareModal** (bridge) | (modal) | (modal) | ✗ | ✗ | ✓ | —/—/—/— | — | — | opener ✓ multi-instance | ✗ | ✗ | ✗ | ✓ same core | ✓ | duplication | unify (P1·M) |
| **curatedIconPickerWindow** | title | footerLeft (hint) | ✗ | ✗ | per-feat (icon-source tabs) | ✗/✗/✗/✗ (ephemeral) | default | default | **opener+callback ✓ (gold)** — `callbackManager` group, `picked`/`window-close` events, `useOpenCuratedIconPickerWindow` returns `{close,dispose}` | ✗ | ✗ | ✗ | ✓ canonical (`IconResolver`, `TapTargetButton`, curated-entries) | local + callback channel (no Redux selection state by design) | wider distribution; surface n/a (transient picker) | distribute (P2·S) |
| **diffViewerWindow** | title | ✗ | ✗ | ✗ | per-feat (split/inline in core) | ✗/✗/✗/✗ (ephemeral) | default | default | **opener ✓; explicit `overlayId` + multi-instance keyed in OverlayController** | ✗ | ✗ | ✗ | ✓ thin chrome over canonical `DiffViewer` headless core | props-only (stateless) | wider distribution | distribute (P2·S) |
| **browserFrameWindow** | title (derived from URL) | ✓ (address bar) | ✗ | ✗ | ✗ | ✓/✗/✗/✗ | default | default | opener ✓ | ✗ | ✗ | ✗ | ✓ shared `EmbedSiteFrame` + url utils | local | merge with workbench | consolidate (P2·M) |
| **browserWorkbenchWindow** | title | ✓ (address bar + New tab) | ✓ bookmarks | ✗ | ✓ own tab strip (in body) | ✓/✗/✗/✗ | default | default | opener ✓ | ✗ | ✗ | ✗ | ✓ same `EmbedSiteFrame` core | local | first-class tab API (S4) when it lands | consolidate (P2·M) |
| **whatsappShellWindow** | titleNode | ✗ | ✗ | ✗ | per-feat (internal) | ✗/✗/✗/✗ (ephemeral) | default | default | opener ✓ | ✗ | ✗ | ✗ | mock-data demo; reusable `ModalShell`/`TabbedGalleryModal` templates inside | mock branch (live wired to `dm_*` behind a flag) | n/a — demo | gate out of prod (P1·S) |
| **whatsappSettings** | actionsLeft/Right (push-nav) | ✗ | ✓ nav list | ✗ | ✗ | ✗/✗/✗/✗ (ephemeral) | default | default | opener ✓ (opened from shell) | ✗ | ✗ | ✗ | reusable `ModalShell` template | mock | n/a — demo | gate out of prod (P1·S) |
| **whatsappMedia** | title | ✗ | ✗ | ✗ | ✓ media/links/docs | ✗/✗/✗/✗ (ephemeral) | default | default | opener ✓ (opened from shell) | ✗ | ✗ | ✗ | reusable `TabbedGalleryModal` template | mock | n/a — demo | gate out of prod (P1·S) |

**Surface / std-controls / help-context (the cross-cutting gap):** **None of these 15 panels is a registered surface, and none wires the help-assistant context or the agents/help std header controls (S1–S3).** Per-panel highlights:
- `feedbackDialog` is the strongest help-context donor in the whole chunk — it already captures `route` (page awareness) and content intent; making it a surface + feeding its KV state to the help assistant is the cheapest high-value win.
- `shareModalWindow` / `instanceUIStateWindow` hold rich KV state (resource identity; per-conversation UI state) and would benefit from surface registration.
- The transient utility pickers (`curatedIconPickerWindow`, `diffViewerWindow`) and the demos are reasonably **exempt** from surface/agents — they are stateless or throwaway, so std-controls add cost without value. Mark them "n/a" rather than "missing."

**Construction note — the `overlayId`-not-passed defect:** `StateViewerWindow` (and the singleton modal-replacement roots, e.g. `EmailDialogWindow`, `ShareModalWindow` DO pass it) render WITHOUT handing the WindowPanel an `overlayId` prop in some cases. The OverlayController wires `onClose` to the right id, but the **component** must also pass `overlayId` so the WindowPanel binds to the runtime manager / persistence by id. `StateViewerWindow.tsx` passes only `urlSyncKey` — confirmed gap. (Email/Share/Feedback/Diff/IconPicker DO pass `overlayId` correctly.)

---

## Table C — Availability & Placement

| Panel | Opener | Ref wired | Portable vs route-locked | Tools Grid (tile/category) | Placement issue | Bespoke call sites (count + surfaces) | Usage gap | Action |
|---|---|---|---|---|---|---|---|---|
| **adminStateAnalyzerWindow** | ✓ `useOpenStateViewerWindow` | — | portable | ✓ "State Analyzer" / **admin (gated)** | overlay twin competes | 1 (url-hydration only) | grid-only; fine for an admin tool | — |
| **adminStateAnalyzer** (overlay) | ✓ `useOpenStateViewerOverlay` | — | portable | ✗ no tile | redundant twin, 0 callers | 0 | unreachable from UI | retire (P2·S) |
| **instanceUIStateWindow** | ✓ `useOpenInstanceUIStateWindow` | — | portable | ✓ "Instance UI State" / **admin (gated)** | ok | 0 (grid-only) | grid-only; fine for admin | — |
| **feedbackDialog** | ✓ `useOpenFeedbackWindow` | — | portable | ✓ "Feedback" / general | ok — **best-distributed panel in the chunk** | **9** (cx-chat + agents messageActionRegistry, shell user menu, applet NavigationMenu, FeedbackButton, AudioRecoveryModal, rich-document app handler, MobileUnifiedMenu, content-actions registry) | none — model distribution | — |
| **emailDialogWindow** | ✓ `useOpenEmailDialogWindow` | — | portable | ✓ "Email" / general | window variant only reachable via grid; real senders use the bridge | 1 (internal close only) | window variant under-surfaced; bridge does the real work | unify (P1·M) |
| **emailDialog** (bridge) | ✓ `useOpenEmailDialogBridge` | callback (instanceId) | portable | ✗ no tile | two doors to one feature | 4 (cx-chat + agents messageActionRegistry, rich-document export, content-actions) | — | unify (P1·M) |
| **shareModalWindow** | ✓ `useOpenShareModalWindow` | — | portable | ✓ "Share Modal" / general (seed note) | window variant grid-only; real shares use the bridge | 0 (grid-only) | under-surfaced vs the bridge | unify (P1·M) |
| **shareModal** (bridge) | ✓ `useOpenShareModal` | callback (instanceId) | portable | ✗ no tile | two doors to one feature | 3 (public-chat ChatContainer + SidebarChats, conversation actions) | — | unify (P1·M) |
| **curatedIconPickerWindow** | ✓ `useOpenCuratedIconPickerWindow` | **popout n/a; callback ✓** | portable | ✗ no tile (correct — it's a field picker) | ok | **3** (udt-picklist `PicklistManagerV2`, `IconInputWithValidation`, `UnifiedAgentContextMenu`) | could back every icon-input in the app | distribute to all icon fields (P2·S) |
| **diffViewerWindow** | ✓ `useOpenDiffViewerWindow` | **multi-instance keyed ✓** | portable | ✗ no tile (could add one) | ok | **4** (agents `EditHistoryDialog`, `UnifiedAgentContextMenu`, + 2 demos) | could back every "compare versions" action (notes, code, agents) | distribute + maybe a tile (P2·S) |
| **browserFrameWindow** | ✓ `useOpenBrowserFrameWindow` | — | portable | ✓ "Site Frame" / files-web (seed Lucide) | competes with workbench | 0 (grid-only) | grid-only | consolidate (P2·M) |
| **browserWorkbenchWindow** | ✓ `useOpenBrowserWorkbenchWindow` | — | portable | ✓ "Site Workbench" / files-web | competes with frame | 0 (grid-only) | grid-only | consolidate (P2·M) |
| **whatsappShellWindow** | ✓ `useOpenWhatsAppShellWindow` | — | portable | ✗ no tile | **DEMO in the production `STATIC_REGISTRY` + `OVERLAY_IDS` union** | 0 (demo route only) | only reachable from `/demos/whatsapp-window-demo` | gate out of prod registry (P1·S) |
| **whatsappSettings** | ✓ `useOpenWhatsAppSettingsWindow` | — | route-locked to demo shell | ✗ no tile | demo in prod registry | 1 (`WhatsAppShellInner`) | demo only | gate out of prod registry (P1·S) |
| **whatsappMedia** | ✓ `useOpenWhatsAppMediaWindow` | — | route-locked to demo shell | ✗ no tile | demo in prod registry | 1 (`WhatsAppShellInner`) | demo only | gate out of prod registry (P1·S) |

**Demo route:** WhatsApp windows are reached only from `app/(dev)/demos/whatsapp-window-demo/` (the `*Window` overlay variant) and `app/(dev)/demos/whatsapp-demo/` (the fullscreen non-window `WhatsAppShell`). Both are `(dev)`-gated.

---

## Chunk-level findings

1. **Modal-replacement exemplars are real and consistent.** `feedbackDialog` (Gold), `emailDialogWindow`, and `shareModalWindow` all follow the same composition-root pattern (hoisted `useXForm`, footer-slot actions, body = content only) and are correctly **minimal quick-execute panels, not CRUD**. `feedbackDialog` is the template to clone for future quick-action panels.

2. **Email + Share each ship as a window AND a legacy modal bridge** (`emailDialogWindow`/`emailDialog`, `shareModalWindow`/`shareModal`). The window variants are tools-grid entry points; the bridges carry the **real** wiring (email send / public-chat share) and the bespoke callers. This is a `merge-to-modes` duplication — the window's email submit is even a stub while the bridge sends for real. **Highest-value cleanup in this chunk (P1·M ×2).**

3. **WhatsApp demo windows are in the production registry.** `whatsappShellWindow` / `whatsappSettings` / `whatsappMedia` sit in `STATIC_REGISTRY` and the `OVERLAY_IDS` union (so they compile into `core`), yet they are mock-data demos reachable only from `(dev)/demos/*`. They should be gated out of the production registry (or moved behind the `full` profile) so the canonical overlay set isn't padded with a demo app (P1·S).

4. **Utility primitives are under-distributed but well-built.** `curatedIconPickerWindow` (callback-registry, 3 callers) and `diffViewerWindow` (multi-instance keyed, thin chrome over canonical `DiffViewer`, 4 callers) are exactly the "reusable primitive invoked via callbacks" shape the system wants — both could back many more sites (every icon field; every compare-versions action) and neither needs surface/agents wiring (transient).

5. **Two iframe browsers are one feature.** `browserFrameWindow` (single iframe) is a strict subset of `browserWorkbenchWindow` (tabs + bookmarks). Consolidate to one mode-driven embedded browser; "Site Frame" = workbench with tabs hidden (P2·M).

6. **State Analyzer ships twice** (`adminStateAnalyzerWindow` + `adminStateAnalyzer` overlay/widget); the overlay twin has 0 callers and no tile — retire it. The window also fails to pass `overlayId` to its WindowPanel (manager-binding gap, P1·S).

7. **Zero surface registration, zero help/agents std-controls** across all 15 (S1–S3 untouched). `feedbackDialog` (already route-aware) and `shareModalWindow`/`instanceUIStateWindow` (rich KV state) are the worthwhile donors; the transient pickers + demos are legitimately exempt.

---

## Remaining system / ephemeral overlays (lighter pass)

Overlays in `OVERLAY_IDS` / `STATIC_REGISTRY` that no domain chunk claims — acknowledged here so the inventory covers all ~120 registered ids. These are system/ephemeral plumbing (mostly `kind: "modal" | "widget"`, ephemeral, opener-driven), not feature panels:

| overlayId | One-line state |
|---|---|
| `saveToNotes` / `saveToNotesFullscreen` | Quick "save this content → a note" modal + its fullscreen twin; rich-document/content-action driven, ephemeral. Solid system overlay. |
| `saveToCode` | Quick "save this content → a code file" modal; sibling of saveToNotes. Solid, opener-driven. |
| `htmlPreview` | Renders an HTML payload in a preview overlay (rich-document "HTML preview" action). Ephemeral, content-driven. |
| `fullScreenEditor` | Generic full-screen rich/markdown editor overlay; callback-aware (see MEMORY D7 severed-callback note). Heavily reused; not a single-feature panel. |
| `markdownEditor` (modal) | Modal markdown editor — distinct from the `markdownEditorWindow` panel (content-data chunk). System overlay variant. |
| `toolCallWindow` | Inline tool-call detail overlay opened from tool-call visualization. Ephemeral; belongs to the tool-viz subsystem. |
| `userPreferences` (modal) | Settings as a modal — the modal twin of `userPreferencesWindow` (settings feature). Legacy door. |
| `imageViewer` | Multi-instance image lightbox; covered as a media panel but is also a pervasive system overlay (used by FeedbackWindow attachments, galleries, etc.). |
| `imagePeekHost` / `adminIndicator` / `announcements` | Floating singletons (image hover-peek host; admin size-cycler chip self-gated on super-admin; announcement banner). Widgets, always-mounted, not panels. |
| `authGate` / `agentGateWindow` | Auth/agent gate overlays (block until signed in / agent selected). Ephemeral system gates. |
| `jsonTruncator` | Tiny modal that truncates pasted JSON; has a tools-grid tile (general). Utility modal. |
| `brokerState` / `socketAccordion` / `streamDebug` / `undoHistory` / `quickChatHistory` / `kgSuggestionsDrawer` | Debug/history/drawer widgets — ephemeral inspectors and side-drawers, opener- or hotkey-driven, not feature panels. |

These are intentionally NOT given full A/B/C rows: they are stateless or single-purpose system overlays whose "panel form / surfacing / functional modes" evaluation is n/a. Listing them here closes the coverage gap against the 120 registered `overlayId`s.

---

## Change Log
- 2026-06-23 — Created. Admin & Utility chunk filled (15 panels across A/B/C): state inspectors, the feedback/email/share modal-replacement exemplars, curated-icon-picker + diff-viewer utility primitives, the two iframe browsers, and the WhatsApp demo trio. Recorded the email/share window-vs-bridge duplication, the WhatsApp-demo-in-prod-registry issue, the StateViewer `overlayId` manager-binding gap, and the chunk-wide surface/std-controls gap. Added the remaining-system-overlays coverage note.
