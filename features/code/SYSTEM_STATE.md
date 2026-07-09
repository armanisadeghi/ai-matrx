# `/code` Workspace — System State & Gap Audit

**Last updated:** 2026‑07‑09 (shell Large-Route sidebar for `/code` — see Change log in [`FEATURE.md`](./FEATURE.md))
**Scope:** Everything under `features/code/`, plus its hooks, adapters, and the slices it consumes from elsewhere in the app.

> **2026‑07‑09 — activity icons → app shell.** On `/code`, the 48px ActivityBar icon rail injects into the main shell sidebar via `CodeSidebarMenu` + `route-menu-registry` (same Large-Route pattern as `/chat`). The resizable/collapsible side panel (Library / Explorer / …) stays in `WorkspaceLayout`. Floating `CodeWorkspaceWindow` and `/agent-apps/[id]/code` keep `showActivityBar` (embedded rail).

This doc is the single source of truth for the `/code` (VSCode‑style) workspace. It captures (1) what is shipped, (2) what is wired but incomplete, (3) what is intentionally deferred, and (4) the wire format / mechanics of the editor→agent context bridge and the Monaco type environment system.

> **2026‑04‑25 verification:** Probed both orchestrators directly via `GET /api-surface`. **Both EC2 and hosted are live at v0.2.0 with identical route surfaces** — the earlier "EC2 stale, deploy disk‑full" remark in §3 is no longer accurate. Capability discovery should always go through `/api-surface`, never `/openapi.json` (which omits catchall proxy routes). See §3 below.

> **2026‑04‑26 incident — EC2 sandbox creation 502.** The orchestrator team redeployed EC2 with new code that writes a `tier` column to `sandbox_instances`, but the companion DB migration (`002_add_tier_template_columns.sql`) was never applied to Supabase (`txzxabzwovsujtloxrus`). Every `POST /sandboxes` against EC2 500'd with `column "tier" of relation "sandbox_instances" does not exist`, which the matrx-admin route surfaced as a 502. **Fix applied 2026‑04‑26:** the migration was applied directly via the Supabase MCP, adding `tier` (`CHECK ec2|hosted`), `template`, `template_version`, `labels`, and supporting indexes. End‑to‑end create→delete verified against `54.144.86.132:8000` with `tier:"ec2"`. See §2.1 row "Orchestrator deploy pipeline does not run DB migrations" for the cross‑team follow‑up so this doesn't recur.

> **2026‑04‑26 editor → agent context bridge fix.** During post-clone QA the user reported that agents weren't receiving any of the open editor tabs even though the bridge was mounted. Two compounding bugs in `instanceContext.slice.ts` and `ChatPanelSlot.tsx`: (1) `setContextEntry` / `setContextEntries` short-circuited when the per-conversation slot wasn't pre-initialised — and `initInstanceContext` is only dispatched by `load-conversation.thunk` when the loaded conversation has saved `metadata.context`, so brand-new chats and conversations without prior context never had a slot to write to; every editor push was silently dropped. (2) `ChatPanelSlot` read the `conversationId` from `searchParams`, which lags behind by the duration of the runner's `pendingNavigation → router.replace` round-trip — the **first** message of a fresh chat went out without any editor context at all. **Fix applied 2026‑04‑26:** (a) both reducers now auto-init the per-conversation map on first write, with a comment pinning the rationale. (b) `ChatPanelSlot` now reads from the redux focus registry (`agent-runner:${agentId}` surface) first and falls back to the URL — so the bridge starts publishing the moment `useAgentLauncher` creates the instance, well before the URL catches up.

> **2026‑04‑26 terminal env defaults.** Buffered/streamed exec doesn't allocate a real PTY, so commands like `clear`, `git push` (when prompting), `tput`, etc. were dying with `TERM environment variable not set` and reading garbage from `tput cols`. **Fix applied 2026‑04‑26:** every `runCommand` invocation now passes `TERM=xterm-256color`, plus `COLUMNS` / `LINES` derived from the live xterm dimensions, into both `adapter.stream({ env })` and the buffered fallback's `adapter.exec({ env })`. Tools that need a TTY proper still need the WS PTY path, but the common 90% (`clear`, ANSI-aware diff/log, build tools) now work in the streaming terminal.

> **2026‑04‑26 Monaco AI context menu.** Right-clicking inside Monaco previously showed only the stock "Cut/Copy/Paste/Format" items — no AI affordances. New hook `useEditorContextMenuActions` (in `features/code/agent-context/`) registers three actions on every editor mount: **Send selection to AI chat**, **Send file to AI chat**, and **Ask AI in floating window…**. The first two push to the same `instanceContext` slice the bridge writes to (so they show up under the same `editor.selection.<id>` / `editor.tab.<id>` keys the agent already knows how to read). The third opens the existing `agentRunWindow` overlay seeded with the workspace's active `agentId`. Disposables are cleaned up on unmount and on tab/conversation/editor changes. The `MonacoEditor` `StandaloneCodeEditor` shape was extended with `addAction` to keep the local Monaco type narrowing honest.

> **2026‑04‑26 git push without prompts.** The orchestrator `/credentials` endpoint already supports a `{ kind: "github", token }` shape, but users were hitting `fatal: could not read Username for 'https://github.com'` because (a) the credentials modal required pasting a PAT into the browser, and (b) we already store a workspace-administrator PAT server-side as `MATRX_SANDBOX_GH_TOKEN` (used by the deploy route) — so making the user paste it again was both an annoyance and a security regression. **Fix applied 2026‑04‑26:** new `POST /api/sandbox/[id]/credentials/workspace` route reads the env var server-side and forwards a synthetic `{ kind: "github", token, scope }` body to the orchestrator without ever exposing the secret to the client. `SandboxGitAdapter.useWorkspaceToken(scope)` plus a "Use Matrx workspace token" button at the top of the GitHub PAT pane in `CredentialsModal` make this a one-click action. 412 from the route surfaces a friendly "ask an admin to set MATRX_SANDBOX_GH_TOKEN" message in the modal — never a silent failure.

> **2026‑04‑26 terminal live‑streaming fix.** During the post‑clone smoke test, `git clone` showed a single line of output and then sat for 5 minutes with no further updates, even though the clone itself succeeded inside the container. Three issues compounded: (1) `TerminalTab.runCommand` always called the buffered `/exec` endpoint and never the SSE `/exec/stream` one — output was held until end‑of‑command and the buffered path's 60s default timeout was killing the visible request before `git clone` finished; (2) the streaming route had no `maxDuration`, so on Vercel Pro it would have died at 60s anyway; (3) `SandboxProcessAdapter.openPty` resolved its Promise synchronously instead of waiting for `WebSocket.onopen`, so on Vercel — where Next route handlers cannot complete the 101 upgrade — the buffered keystroke listener was disposed before the WS failed, dropping pasted commands. **Fix applied 2026‑04‑26:** (a) `runCommand` now prefers `adapter.stream()` when available and writes stdout/stderr to xterm chunk‑by‑chunk; Ctrl‑C while running aborts the SSE which propagates a SIGTERM through the proxy. (b) `app/api/sandbox/[id]/exec/stream/route.ts` now exports `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, and `maxDuration = 300` (Vercel Pro hard cap — see correction below). (c) `openPty` now returns a Promise that only resolves on `socket.onopen`, with a 4 s connect timeout that rejects so the caller stays on the buffered fallback when the upgrade isn't possible. (d) Multi‑line paste in buffered mode now queues lines rather than dropping them — every command in a paste runs sequentially. End result: `git clone`, `pnpm install`, and similar long commands now stream output live up to 300 s.

> **2026‑04‑26 sandbox UX truth pass.** Two independent sandbox surfaces (`/sandbox` list page and `/code` `SandboxesPanel`) had drifted: the list page applied a client-side `getEffectiveStatus` override that flipped a still-`ready` row to `expired` once `expires_at` was past, while the panel showed the raw DB status verbatim — same row, different label. The list page also ticked its time-remaining display every 30s while the detail page ticked every 1s; the panel did not tick at all and only refreshed on the 4s status poll (or never, once the row stopped polling). The "+1h Debug Time" admin button on the detail page sent `{ action: 'extend', seconds: 3600 }` to the legacy DB-only `PUT /api/sandbox/[id]` route, but the route expects `ttl_seconds` — so the button silently no-op'd and the orchestrator's authoritative TTL never moved. Finally, the History pane on the list page invited a recovery action that does not exist (the container is destroyed; nothing to restart), and the delete dialog claimed "deleted sandboxes are retained temporarily for recovery" which is not true today. **Fix applied 2026‑04‑26:** (a) extracted shared `getEffectiveStatus`, `STATUS_LABELS`, `STATUS_BADGE_VARIANT`, `LIST_ACTIVE_STATUSES`, `statusPillClasses`, and `ACTIVE_EFFECTIVE_STATUSES` into [`lib/sandbox/status.ts`](../../lib/sandbox/status.ts) — every consumer (`/sandbox` list, `/sandbox/[id]` detail, `SandboxesPanel`) now reads through the same helper, so they cannot disagree about whether a sandbox is alive. (b) Added [`hooks/sandbox/use-time-remaining.ts`](../../hooks/sandbox/use-time-remaining.ts) — a `useTimeRemaining(expiresAt, granularity)` hook with `'second'` (detail page) and `'minute'` (list/panel) granularities. The detail page card now reads `Ends in: 1h 5m 23s` over `Initial allotment: 2h 0m` instead of the previous confusing `Time Remaining` over `TTL: 2h 0m` pairing. (c) Both the user-facing `+1h` button and the admin `+1h Debug Time` button now hit `POST /api/sandbox/[id]/extend` with `ttl_seconds`, matching what `SandboxesPanel` already does — the legacy `PUT ?action=extend` path is dead from the UI. (d) `useSandboxInstances.createInstance` now forwards `tier`, `template`, `template_version`, `resources`, and `labels` instead of dropping them — the `/sandbox` page's create dialog grew tier and template pickers (mirroring `CreateSandboxModal`) plus user-pref persistence in `userPreferences.coding.lastSandboxTier` / `lastSandboxTemplate`, so both surfaces produce the same kind of sandbox. (e) The list page's History block now reads "History — read-only record" with an explicit "containers have been destroyed and the data inside them is gone — they cannot be restarted" caption; both delete dialogs replaced the false "retained temporarily for recovery" copy with "anything inside the container that wasn't pushed to git is gone for good." This pass is intentionally surgical — once the Python team finishes persistent-volume / snapshot work (see [`SANDBOX_DIRECT_ENDPOINTS.md`](./SANDBOX_DIRECT_ENDPOINTS.md) and the `/python-team` notes thread), the History block becomes the place to surface "Restore previous environment" actions and the data-loss caption gets replaced with the actual persistent-folder summary.

> **2026‑04‑26 persistence Phase 4 frontend.** The Python team shipped Phases 1+2+3 of the persistence plan: per-user Docker volume mounted at `/home/agent` on the hosted tier (matrx-user-`<uid>`), 5-minute background session manifests at `~/.matrx/session.json`, git auto-stash on graceful shutdown (`matrx/auto-stash/<ts>` branches pushed to origin when creds work), session reports rendered to `~/.matrx/session-report.md`, and two new orchestrator endpoints (`GET /users/{user_id}/persistence`, `DELETE /users/{user_id}/volume`). Phase 4 frontend now consumes all of it: (a) **API proxy** — [`app/api/sandbox/persistence/route.ts`](../../app/api/sandbox/persistence/route.ts) fans out to every configured tier, aggregates totals, and exposes a `partial` flag so the UI can render `—` (not `0 B`) when an orchestrator is unreachable. The `DELETE` half forwards `?tier=…` (or wipes every tier when omitted) and surfaces the orchestrator's 4xx-when-still-mounted refusal verbatim. (b) **Hook + helpers** — [`hooks/sandbox/use-user-persistence.ts`](../../hooks/sandbox/use-user-persistence.ts) exposes `{ info, loading, error, refresh, deleteVolume }` plus `formatPersistenceSize(bytes)` and `findTierInfo(info, tier)`. Race-guarded with a `reqIdRef` so fast tier toggles don't paint stale data; deletion is reflected optimistically before the next refresh returns. (c) **Storage badge** — [`features/code/views/sandboxes/CreateSandboxModal.tsx`](./views/sandboxes/CreateSandboxModal.tsx) and [`app/(authenticated)/sandbox/page.tsx`](../../app/(authenticated)/sandbox/page.tsx) both render "Your saved data: 1.3 GB" beneath the tier picker so users see what's already persisted before they pick a tier. The list page also got per-tier guidance copy lifted from the Python team's "tier purposes" table. (d) **Truthful history + delete copy** — `/sandbox` page and `/sandbox/[id]` page both updated: the History block now says "the container was destroyed but your `/home/agent` volume persists — create a new sandbox on the same tier to pick up where you left off" instead of the old "data is gone" line, and the delete dialog points users at `/settings/sandbox-storage` for full wipes. (e) **Auto-open session report** — [`features/code/runtime/openSessionReport.ts`](./runtime/openSessionReport.ts) reads `~/.matrx/session-report.md` on connect (with retry backoff for daemon warmup) and dispatches `openTab` so the report shows up as a Markdown tab the moment the workspace mounts. Wired into `SandboxesPanel`'s `connect` callback. (f) **Source Control auto-stash** — [`features/code/views/source-control/SourceControlPanel.tsx`](./views/source-control/SourceControlPanel.tsx) discovers `matrx/auto-stash/*` branches via `git for-each-ref --format=…` (run through `SandboxProcessAdapter.exec`, since `SandboxGitAdapter.branch` doesn't expose list-with-metadata), and renders an "Auto-saved from previous session" section with **Apply** (`git checkout <branch> -- .`), **View diff** (opens a `git-diff:auto-stash:<ts>` tab), and **Discard** (`git branch -D` + `git push origin :<branch>`). (g) **Settings page** — [`app/(authenticated)/settings/sandbox-storage/page.tsx`](../../app/(authenticated)/settings/sandbox-storage/page.tsx) is registered in `SettingsLayoutClient` and shows per-tier size, sandbox count, volume name, S3 prefix, last sync; per-tier and global wipe buttons gated through a confirm dialog that surfaces the orchestrator's "still mounted" 409 if a sandbox is alive. **Phase 5** (per-user quotas, admin panel surfacing) and **Phase 6** (cross-tier S3-as-truth + cloud_sync) remain on the Python roadmap and are blocked on AWS creds being attached to the hosted server.

> **2026‑04‑26 Vercel `maxDuration` correction.** The previous note claimed Vercel Pro Fluid Compute allows `maxDuration = 800`. That is **wrong** — the build broke with `Builder returned invalid maxDuration value … must have a maxDuration between 1 and 300 for plan pro` (https://vercel.com/docs/limits). The platform caps Pro Serverless Functions at **300s** regardless of Fluid Compute. Hobby is 60s; Enterprise is 900s. **Fix applied 2026‑04‑26:** dropped to `maxDuration = 300` on `app/api/sandbox/[id]/exec/stream/route.ts` (the only sandbox route that exceeded the default). 5 minutes is enough for `git clone` of any repo we ship and most `pnpm install` runs, but it is **not** enough for cold `next build` or large test matrices. Anything that needs to outlive 5 minutes — and we want every long-running terminal/exec/PTY path eventually to do so — must connect to the orchestrator directly without going through Vercel. The contract for that is specified in [`SANDBOX_DIRECT_ENDPOINTS.md`](./SANDBOX_DIRECT_ENDPOINTS.md) (Python‑team requirements doc).

> **End-to-end verification:** The 10-step smoke test in [`QA_CHECKLIST.md`](./QA_CHECKLIST.md) is the gate for "fully done". Run it against the hosted tier after any meaningful workspace change.

---

## 0. Executive snapshot

| Area | Status | Comment |
|------|--------|---------|
| Workspace shell, panels, activity bar | ✅ Shipped | `WorkspaceLayout`, `react-resizable-panels`, all six activity views render (added `source-control`). |
| Monaco editor, tabs, dirty state, `Cmd/Ctrl+S` | ✅ Shipped | Save dispatches to the right backend by tab id. |
| Filesystem adapter (Sandbox, structured FS API) | ✅ Shipped | `SandboxFilesystemAdapter` consumes `/fs/*` directly — no shell synthesis. Bulk read / upload / download / drag‑and‑drop wired. |
| Terminal — real PTY over WebSocket | ✅ Shipped | xterm attaches to `/api/sandbox/[id]/pty` (WS proxy). Buffered fallback retained for `MockProcessAdapter`. |
| Code Library: `code_files`/`code_folders` browser | ✅ Shipped | Backed by the existing `code-files` Redux slice. |
| Library Source Adapters (`prompt_apps`, `aga_apps`, `tool_ui_components`) | ✅ Shipped | Direct‑edit source rows with optimistic concurrency, source-of-truth badge, conflict toast (Reload/Overwrite), Realtime softening. |
| Universal "save & open in code editor" flow | ✅ Shipped | Wired into `HtmlPreviewModal` and chat code blocks. |
| Conversation history / agent filter / favorites | ✅ Shipped | Lives next to the chat panel; filter by tags; date/agent grouping. |
| Per‑adapter Monaco type environments | ✅ Shipped | Refcounted registry, six environments (`prompt-app`, `aga-app`, `tool-ui`, `library`, `sandbox-fs`, `html`), status‑bar indicator, settings toggle. |
| Sandbox API surface (FS / exec / PTY / git / search / watch / processes / ports / templates / extend / heartbeat) | ✅ Shipped on both tiers | Verified via `GET /api-surface`. See §3 for the live capability matrix. |
| Editor → agent context‑bag bridge | ✅ Shipped | `features/code/agent-context/`, auto‑mounted in `ChatPanelSlot`. ctx_get keys: `editor.tabs`, `editor.tab.<id>`, `editor.selection.<id>`. See §4. |
| Source Control activity view | ✅ Shipped | `features/code/views/source-control/` over `SandboxGitAdapter`. Status panel, diff tab (`git-diff:` prefix), commit/push, credentials modal. |
| Server‑side search (ripgrep) + fuzzy path search | ✅ Shipped | `SearchPanel` consumes `searchContent` / `searchPaths`; falls back to client walker when adapter lacks them. |
| File watcher → live tree | ✅ Shipped | `FileTree` subscribes to `filesystem.watch()`; node tree updates in Redux on `created` / `modified` / `deleted` / `moved`. |
| Tier + template picker | ✅ Shipped | "New sandbox" modal pulls `GET /api/templates?tier=…`; last tier persisted in `userPreferences.coding.lastSandboxTier`. |
| Ports bottom panel | ✅ Shipped | Polls `/api/sandbox/[id]/ports` every 5s; click‑to‑copy host:port. |
| Heartbeat + extend | ✅ Shipped | `useSandboxHeartbeat` mounted in `CodeWorkspace` gated on `activeSandboxId`; `extendSandbox` switched to `POST /api/sandbox/[id]/extend`. |
| Per-user persistence — frontend | ✅ Shipped | Storage badge on create dialogs, session report auto-opens on connect, auto-stash branches in Source Control, `/settings/sandbox-storage` page. Backed by Python‑team Phases 1+2+3. See §8. |
| Persistence quotas + admin panel surfacing | ⏳ Backend pending | Phase 5 — `user_persistence` table + cap enforcement in `hot-sync.sh`. Owner: Python team. |
| Cross-tier S3-as-truth + cloud_sync integration | ⏳ Blocked on AWS creds | Phase 6 — needs AWS creds attached to the hosted server. Owner: Python team. |
| LSP / multi‑user collab / public preview URLs | ❌ Out of scope | P2 sandbox‑team work — see §3 row "Snapshot / multi‑user / LSP / AI sockets". |

---

## 1. Architecture map

### 1.1 Entry points

| Path | What it is |
|------|-----------|
| `app/(a)/code/page.tsx` | Renders `<CodeWorkspaceRoute />` — only callsite from the App Router. |
| `app/(a)/code/layout.tsx` | Authenticated layout wrapper. |
| `app/(a)/code/loading.tsx` | Skeleton while the workspace boots. |

The previous `app/(authenticated)/code/page.tsx` was deleted when the route moved to `(a)/code`.

### 1.2 Workspace shell

```
features/code/
  CodeWorkspaceRoute.tsx          ← top‑level, mounts providers + layout
  CodeWorkspace.tsx               ← inner shell, holds activity bar + side panel + editor + bottom panel
  layout/WorkspaceLayout.tsx      ← <ResizablePanelGroup> orchestration; injects `rightmost` prop
  styles/tokens.ts                ← AVATAR_RESERVE = "pr-14", shared sizing tokens
```

`WorkspaceLayout` is responsible for:
- Imperatively expanding/collapsing panels via the `ImperativePanelHandle`s, then calling `setLayout(...)` inside `requestAnimationFrame`. This avoids the panel‑library footgun where layout fights collapse state.
- Cloning each slot child and injecting a `rightmost` boolean prop so whichever panel currently sits flush against the top‑right corner reserves space (`AVATAR_RESERVE`) for the floating user avatar.

### 1.3 Activity bar + side panels

```
features/code/activity-bar/
  ActivityBar.tsx
  activity-views.ts        ← descriptor list (icon, id, label)

features/code/views/
  SidePanelChrome.tsx      ← shared frame for every left panel
  SidePanelRouter.tsx      ← switches on activity id
  explorer/                ← filesystem tree (Mock + Sandbox)
  sandboxes/               ← list/create/connect sandboxes
  library/                 ← Code Library (My Files + source folders)
  chat/                    ← AgentRunnerPage host
  history/                 ← ConversationHistorySidebar host
```

The five views currently registered are: `explorer`, `sandboxes`, `library`, `chat`, `history`. Each renders inside `SidePanelChrome`, which provides the consistent header/scroll behavior.

### 1.4 Editor

```
features/code/editor/
  EditorArea.tsx           ← outer frame; subscribes to active tab; wires onSave
  EditorToolbar.tsx        ← Save button, dirty indicator, layout toggles
  EditorTabs.tsx           ← tab strip
  MonacoEditor.tsx         ← thin <Editor /> wrapper, `Cmd/Ctrl+S` keybinding
  monaco-config.ts         ← lazy global Monaco init (TS/JS/JSON only — no extraLibs)
  useMonacoTheme.ts        ← light/dark sync
```

### 1.5 Bottom panel

```
features/code/terminal/
  BottomPanel.tsx          ← persistent mount of TerminalTab (hidden by CSS when collapsed)
  TerminalTab.tsx          ← xterm.js + per‑command exec via SandboxProcessAdapter
```

`TerminalTab` is **always mounted** so the user never loses scrollback / cursor state when the panel collapses. We previously had a hydration warning when xterm tried to set the background colour during SSR — the fix is `bg-white dark:bg-[#1e1e1e]` in the wrapping `<div>`.

### 1.6 Adapters (the data plane)

```
features/code/adapters/
  FilesystemAdapter.ts            ← interface
  ProcessAdapter.ts               ← interface (with optional `stream?(...)` reserved for v2)
  MockFilesystemAdapter.ts        ← in‑memory tree for demos
  MockProcessAdapter.ts           ← canned outputs
  SandboxFilesystemAdapter.ts     ← shell‑synthesised `list`/`read`/`write`
  SandboxProcessAdapter.ts        ← one‑shot `POST /api/sandbox/[id]/exec`
```

These are the only seams between the editor UI and the outside world. The editor never knows whether it's talking to a mock, a sandbox, or (eventually) AWS. **All net‑new sandbox features (Git, search, PTY, watcher) will land as new methods on `FilesystemAdapter` / `ProcessAdapter` / future `GitAdapter` and a new `SandboxGitAdapter`.**

### 1.7 Library source adapter system

The "Code Library" view fuses **two** content sources behind one tree:

1. **My Files** — `code_files` + `code_folders` rows (the existing `code-files` slice with S3 offload).
2. **External tables** — registered `LibrarySourceAdapter`s. Each adapter binds the editor to a source‑of‑truth row in another table.

```
features/code/library-sources/
  types.ts                 ← LibrarySourceAdapter + RemoteConflictError
  registry.ts              ← register/getLibrarySource/getAdapterForTabId
  adapters/
    prompt-apps.ts         ← prompt_apps.component_code         (single field)
    aga-apps.ts            ← aga_apps.component_code            (single field)
    tool-ui-components.ts  ← tool_ui_components.* (multi‑field)
    html-pages.ts          ← html_pages.html_content (via /api/html-pages)
  registerBuiltinLibrarySources.ts
```

Tab id conventions:

| Adapter | Tab id |
|---------|--------|
| code_files (My Files) | `library:<codeFileId>` |
| prompt_apps | `prompt-app:<rowId>` |
| aga_apps | `aga-app:<rowId>` |
| tool_ui_components | `tool-ui:<rowId>:<fieldId>` (e.g. `tool-ui:abc:inline_code`) |
| html_pages | `html-page:<rowId>` |
| Mock/Sandbox FS | `fs:<adapterId>:<absPath>` |

**Render preview** (`features/code/preview/`): library sources may register a live previewer by `tabIdPrefix`. Eye icon on the tab opens a paired `kind: "render-preview"` tab. Registered today: `aga-app:` → `features/agent-apps/code-preview/`; `html-page:` → `features/html-pages/code-preview/` (imported from `CodeWorkspace.tsx`).

`useSaveActiveTab` routes the save by inspecting the tab id prefix — code_files → thunks; library adapter → `adapter.save`; otherwise `filesystem.writeFile`.

### 1.8 Optimistic concurrency for source‑backed tabs

When `useOpenSourceEntry` opens a row it captures `updated_at` into `EditorFile.remoteUpdatedAt`. On save, the adapter does `UPDATE … WHERE updated_at = <captured>` and returns a fresh `updated_at`; if 0 rows match, it throws `RemoteConflictError` and `useSaveActiveTab` returns `{ ok: false, conflict: true }`. The UI surfaces a toast with "Reload" / "Overwrite" actions. After a clean save, we dispatch `setTabRemoteUpdatedAt` so subsequent saves don't false‑positive. Realtime push of `updated_at` is **not** wired — see §2.5.

### 1.9 Slices touched

```
features/code/redux/
  codeWorkspaceSlice.ts        ← active view, panel sizes, explorerRootOverride
  tabsSlice.ts                 ← editor tabs, active tab, dirty bits, remoteUpdatedAt
  terminalSlice.ts             ← terminal session metadata

lib/redux/slices/userPreferencesSlice.ts
  └─ coding: CodingPreferences ← agent filter, history grouping, favorites

features/agents/redux/conversation-history/
  slice.ts, thunks.ts, selectors.ts ← conversation list with date/agent grouping

features/agents/redux/execution-system/
  instance-context/instance-context.{slice,selectors}.ts
                              ← ★ THIS IS WHERE EDITOR CONTEXT LANDS — see §4
  thunks/execute-instance.thunk.ts
                              ← assembleRequest() reads selectContextPayload(...)

features/code-files/redux/codeFilesSlice.ts ← My Files CRUD + S3
```

### 1.10 Hook surface (public API of the workspace)

```ts
useOpenLibraryFile(codeFileId)       // open a code_files row as a tab
useOpenSourceEntry(adapter, rowId, fieldId?)  // open any LibrarySourceAdapter row
useLibrarySource(adapter)            // lazy list of entries for one adapter (folder expand)
useSaveActiveTab()                   // dispatches the right save based on tab id
useOpenCodeFileFromUrl()             // ?open=<id> URL hydrator (mounted once in CodeWorkspace)
useSaveAndOpenInCodeEditor()         // universal: save arbitrary code → code_files → /code?open=<id>
```

`useSaveAndOpenInCodeEditor` is what `HtmlPreviewModal` and the chat code‑block toolbar call. It creates the `Chat Captures` folder on demand and routes the user to the editor with the file already opened.

---

## 2. Known gaps / things not set up yet

Most of the historic gaps have been closed. What remains is sandbox‑team P2 work and a small set of intentional matrx‑admin deferrals; everything else moved into §0/§3 as shipped.

### 2.1 Sandbox‑team P2 (out of scope here)

| Gap | Owner | Why deferred |
|---|---|---|
| Public preview URL exposure | sandbox team | Needs Caddy/CF reverse‑proxy plumbing on the orchestrator side. The Ports bottom panel already lists LISTEN ports; preview links plug in once the URL exposure ships. |
| Snapshot / restore | sandbox team | P2; not on the workspace's critical path. |
| Multi‑user collab on a single sandbox | sandbox team | P2; OT/CRDT layer would need to live in the orchestrator. |
| LSP server multiplex | sandbox team | P2; Monaco would need a WS bridge to a per‑container `tsserver`/`pyright`. |
| AI socket framing helpers | sandbox team | P2; tangential to the workspace. |
| **Orchestrator deploy pipeline does not run DB migrations** | sandbox team | P0 follow‑up. The 2026‑04‑26 EC2 outage was caused by code referencing a column that the orchestrator team's migration `002_add_tier_template_columns.sql` would have added had it been run. The deploy script needs to either (a) `psql $MATRX_DATABASE_URL -f migrations/*.sql` as part of `systemctl restart matrx-orchestrator`, or (b) hand off migrations through the matrx Supabase migration channel before code rollout. Until this is added, every schema change requires a coordinated handoff to matrx‑admin. |

### 2.2 matrx-admin deferrals

| Item | Why we're not doing it now |
|---|---|
| Generated ambient `.d.ts` for prompt-app / aga-app / tool-ui | The current envs are hand‑authored against curated subsets in [`features/code-editor/config/type-definitions.ts`](../code-editor/config/type-definitions.ts). Generating these from the live runtime types is a build‑step follow‑up; the hand‑authored versions catch the spurious squiggles (the original symptom) and are versioned in the env files. |
| `git rebase --interactive` and other interactive porcelain in the Source Control view | The view targets the 95% workflow (status / stage / commit / push / pull / branch / stash / diff / credentials). Rebases land via the terminal — xterm is now a real PTY, so it just works. |
| LSP-style cross-file rename / "find references" | Monaco can't do it without a real LSP and we don't have one. Out of scope until §2.1's LSP gap closes. |
| Public preview URL click-through in the Ports tab | Surfaces only host:port today; the click-to-copy is the workaround until preview URLs land. |
| In-process collaboration cursors on shared tabs | Out of scope; the source-of-truth flow + Realtime softening is enough for the single-user-at-a-time case, which is the entire current product surface. |

---

## 3. Sandbox API delivery audit (verified live 2026‑04‑25)

The orchestrator team shipped the full wishlist surface across both tiers. Earlier verdicts in this file (and in the 2026‑04‑26 commit) used `/openapi.json` for discovery, which omits any route registered with a `{path:path}` catchall (`/fs/*`, `/git/*`, `/search/*`). Use `GET /api-surface` instead — it returns the authoritative route list including catchalls, plus `tier` and `version`.

There are now **two orchestrators**:

| Tier | URL | Notes |
|---|---|---|
| `ec2` | `http://54.144.86.132:8000` | v0.2.0 live (verified `/api-surface` 2026‑04‑25). Earlier disk‑full deploy failure has been resolved. |
| `hosted` | `https://orchestrator.dev.codematrx.com` | v0.2.0 live (verified `/api-surface` 2026‑04‑25). Matrx dev server, Docker volumes, in‑memory store today. |

Sandboxes carry a `tier` field (persisted in `sandbox_instances.config.tier`) so the proxy routes can forward to the right orchestrator. See `lib/sandbox/orchestrator-routing.ts`.

### 3.1 Wishlist scoreboard

| Wishlist item | Priority | Backend | Frontend |
|---|---|---|---|
| §3.1.1 Structured FS API (list/stat/read/write/patch/delete/mkdir/rename/copy + binary) | P0 | ✅ both tiers | ✅ `SandboxFilesystemAdapter` (no shell synth) |
| §3.1.2 Streaming `exec` (SSE) with env/stdin/cancel | P0 | ✅ both tiers | ✅ `SandboxProcessAdapter.stream()` — used by `TerminalTab` buffered fallback path. |
| §3.1.3 Real PTY WebSocket (`/sandboxes/{id}/pty`) | P0 | ✅ both tiers | ✅ `app/api/sandbox/[id]/pty/route.ts` proxies the WS upgrade; xterm attaches directly. |
| §3.1.4 Git workflow primitives | P0 | ✅ both tiers | ✅ `SandboxGitAdapter` consumed by `features/code/views/source-control/`. |
| §3.1.5 Git credential model | P0 | ✅ both tiers | ✅ Credentials modal (`setGithubToken` / `setSshKey` / `revokeCredentials`) in the Source Control view. |
| §3.1.6 Template selection at create time | P0 | ✅ both tiers | ✅ Tier/template picker modal in `SandboxesPanel`; last tier persisted in `userPreferences.coding.lastSandboxTier`. |
| §3.1.7 TTL `extend` + heartbeat | P0 | ✅ both tiers | ✅ `useSandboxHeartbeat` mounted in `CodeWorkspace`; extend uses `POST /api/sandbox/[id]/extend`. |
| §3.2.1 File watcher (WebSocket) | P1 | ✅ both tiers | ✅ `FileTree` subscribes via `filesystem.watch()`; Redux node tree mutates on events. |
| §3.2.2 Server‑side search (ripgrep + fd) | P1 | ✅ both tiers | ✅ `SearchPanel` uses `searchContent()` (ripgrep) + `searchPaths()` (fd). Falls back to client walker on Mock adapter. |
| §3.2.3 Bulk fs / upload / download | P1 | ✅ daemon supports `batch`/`upload`/`download` | ✅ `FilesystemAdapter.upload` / `download` / `batchRead` shipped on the sandbox adapter; drag‑and‑drop wired in `FileTree`. |
| §3.2.4 Process listing + signal | P1 | ✅ both tiers (`/processes`, `/processes/{pid}/signal`) | ⏳ proxy routes shipped; no UI consumer yet — out of scope (no compelling need surfaced). |
| §3.2.5 Port listing | P1 | ✅ both tiers (`/ports`) | ✅ Ports bottom‑panel tab polls every 5s with click‑to‑copy. |
| §3.2.5 Public preview URL exposure | P1 | ❌ not implemented | Out of scope — sandbox team. |
| §3.3.* Snapshot / multi‑user / LSP / AI sockets | P2 | ❌ not implemented | Out of scope — sandbox team. |
| (new) `POST /sandboxes/{id}/complete` | n/a | ✅ | Agent‑self‑signal lifecycle; not consumed by the editor. |
| (new) `POST /sandboxes/{id}/error` | n/a | ✅ | Same as above. |
| (new) `GET /api-surface` | n/a | ✅ | Consumed by `lib/sandbox/api-surface.ts` capability cache (per‑tier route detection used for graceful tier‑rollback degradation). |

**Net delivery:** Every P0 wishlist item is live on both the backend and the frontend. Every P1 item except *public preview URLs* and *process listing UI* is shipped. The remaining sandbox‑team gaps (preview URLs, snapshot, multi‑user, LSP, AI sockets) are tracked in §2.1 as out‑of‑scope for this workspace.

### 3.2 Discovery — use `/api-surface`, not `/openapi.json`

Both orchestrators expose `GET /api-surface` (no auth). It returns the authoritative route list including the catchall proxy routes, plus `tier` and `version`. Always probe this when documenting capabilities, never `/openapi.json`. Sample (2026‑04‑25, both tiers identical):

```
GET /api-surface  →  {"service":"matrx-sandbox-orchestrator","version":"0.2.0","tier":"<ec2|hosted>","routes":[…26 routes…]}
```

### 3.3 Frontend status

All eight items from the previous "frontend gap" list have shipped. The capability cache (`lib/sandbox/api-surface.ts`) exists so any future tier rollback degrades gracefully. New consumers for the remaining sandbox endpoints (process list / signal, public preview URLs once they exist) can be added piecemeal without further architectural work.

---

## 4. Editor → agent context bridge — shipped (2026‑04‑25)

The bridge is live in `features/code/agent-context/`. It mirrors the open editor tabs into the active chat instance's `instanceContext`, so the Python agent can pull buffer content lazily via `ctx_get` instead of having every body inlined into every prompt.

### 4.1 ctx_get key list

| Key | Always emitted? | Value shape | Notes |
|---|---|---|---|
| `editor.tabs` | Yes (when bridge is mounted) | `EditorTabsSummary` — see below | Cheap manifest the agent reads first to discover what's open. **No buffer content** lives here. |
| `editor.tab.<tabId>` | One per non-disabled open tab | `EditorTabContextValue` — see below | Carries the buffer content. Agent fetches only the tabs it needs. Stale tabs (closed or disabled in the popover) are removed via `removeContextEntry`. |
| `editor.selection.<tabId>` | On‑demand | `SelectionContextValue` — see below | Created when the user fires the **Send selection as context** Monaco command (Cmd/Ctrl+Shift+L) or the toolbar button. Survives until the user fires it again or closes the tab. |

The `<tabId>` namespace follows the workspace‑wide tab id convention (§1.7) — e.g. `library:abc`, `prompt-app:abc`, `tool-ui:abc:inline_code`, `fs:sandbox:/home/agent/foo.ts`.

### 4.2 Wire format

All values are emitted with `type: "json"` so they round‑trip through `assembleRequest` → `AssembledAgentStartRequest.context` verbatim.

```ts
// editor.tabs
interface EditorTabsSummary {
  tabs: Array<{
    id: string;
    path: string;
    name: string;
    language: string;
    dirty: boolean;
  }>;
  activeId: string | null;
}

// editor.tab.<tabId>
interface EditorTabContextValue {
  id: string;
  path: string;
  name: string;
  language: string;
  content: string;
  pristineContent: string;
  dirty: boolean;
  remoteUpdatedAt?: string;
}

// editor.selection.<tabId>
interface SelectionContextValue {
  id: string;
  path: string;
  name: string;
  language: string;
  selection: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  text: string;
  capturedAt: string;
}
```

### 4.3 Bridge mechanics

- **Selector** — `selectEditorContextEntries(state)` (`features/code/agent-context/editorContextEntries.ts`) builds the canonical entry list from `tabsSlice`. Memoized via Reselect; only re‑runs when tab ids/content/language/dirty references change.
- **Per‑instance disable list** — `instanceUIState.byConversationId[id].editorContextDisabledTabs: string[]` holds tab ids the user has explicitly excluded. `filterDisabledTabs` strips them from the entry list **and** prunes them out of the `editor.tabs` summary's `tabs[]` so the agent never sees ghosts.
- **Sync hook** — `useSyncEditorContext(conversationId)` is mounted once in `ChatPanelSlot` (auto‑on whenever a workspace + conversation are both live). Debounce 250ms. On each push it dispatches `setContextEntries` with the live entries, then dispatches `removeContextEntry` for any keys present in the previous push but absent now (closed tabs / newly disabled tabs).
- **Selection capture** — `useSendSelectionAsContext({ conversationId, activeTab, editorRef })` exposes a `sendSelection()` callback. Wired to (a) the Monaco command `Cmd/Ctrl+Shift+L` (registered inside `MonacoEditor`), and (b) the new Brain icon in `EditorToolbar`. Empty selection → toast error; success → toast confirmation with the captured length.

### 4.4 UI surface

- **Chat header** — `<ContextChip>` next to the agent picker. Shows `<included>/<total>` with a brain glyph; clicking opens a popover with one row per open tab + All / None buttons. Toggles persist in `instanceUIState.editorContextDisabledTabs` so they survive conversation refreshes within the session.
- **Editor toolbar** — Brain icon next to Save. Disabled when there's no `conversationId` in the URL or no active tab. Tooltip surfaces the keybinding.

### 4.5 Why this shape

- **No prompt bloat.** The summary is tiny; the bodies live in `instanceContext` which the model only reads via `ctx_get` per‑turn. No buffer ever shows up in `cx_message.content`.
- **No surprise edits.** The bridge is one‑way (editor → context). Agent edits flow through normal MCP/tool calls; we never round‑trip via `instanceContext`.
- **Per‑conversation scoping.** Disable lists live on the conversation's `instanceUIState`, so the same workspace can serve multiple chat instances with different exposure settings.
- **Stable keys.** `editor.tab.<tabId>` reuses the workspace‑wide tab id convention (§1.7), so an agent can correlate a context entry with any other workspace event (save, conflict, etc.) by id alone.

---

## 5. Monaco type environments — shipped

The system in `features/code/editor/monaco-environments/` is live: a refcounted registry plus a hook that activates the right environment per active tab.

```
features/code/editor/monaco-environments/
  types.ts                 // MonacoEnvironment interface
  registry.ts              // refcounted activate/deactivate; disposes ITypingsExtraLib handles
  useEnvironmentForActiveTab.ts
  envs/
    prompt-app.ts          // React 19 + Lucide + ShadCN ambient .d.ts subset
    aga-app.ts             // shares the prompt-app baseline
    tool-ui.ts             // React baseline + tool-result typing utility
    library.ts             // minimal opt-in env for arbitrary code_files
    sandbox-fs.ts          // node typings only when the file extension warrants
    html.ts                // JSON schemas only (no TS)
  resolveEnvironmentForTab.ts // tab id + path → environment id
```

A status‑bar pill in `features/code/layout/StatusBar.tsx` shows the active env (or `env: off` when the global toggle is off). The Code Workspace settings tab exposes a `monacoEnvironmentsEnabled` switch; default is on. Activation is refcounted, so opening a second `prompt-app:*` tab does not re‑register libs and closing one of two does not tear down. Disposing on transitions is critical because Monaco's TS worker otherwise accumulates extra libs forever.

Diagnostics policy: structured envs (`prompt-app`, `aga-app`, `tool-ui`, `library`) keep `noSemanticValidation: false`. `sandbox-fs` keeps `noSemanticValidation: true` because we have no visibility into the surrounding repo's tsconfig.

---

## 6. Acceptance gate

The QA contract is in [`QA_CHECKLIST.md`](./QA_CHECKLIST.md). It runs the 10‑step end‑to‑end smoke (create hosted sandbox → connect → watcher → git clone → ripgrep search → streaming exec → real PTY (`vim`) → prompt‑app save with type env → forced conflict → 30‑min idle heartbeat → editor‑context `ctx_get`). Re‑run after any non‑trivial change to either the workspace or the orchestrator surface.

---

## 7. Reference index (selected)

| File | Why it matters |
|------|----------------|
| `features/code/CodeWorkspace.tsx` | Mounts the workspace + `UrlOpenFileBridge`. |
| `features/code/layout/WorkspaceLayout.tsx` | The panel orchestration + `rightmost` injection. |
| `features/code/redux/tabsSlice.ts` | `EditorFile` shape, `replaceTabContent`, `setTabRemoteUpdatedAt`. |
| `features/code/types.ts` | `EditorFile.remoteUpdatedAt`, `ActivityViewId`. |
| `features/code/library-sources/types.ts` | `LibrarySourceAdapter`, `RemoteConflictError`. |
| `features/code/library-sources/index.ts` | Side‑effect registration of every adapter. |
| `features/code/hooks/useSaveActiveTab.ts` | The save‑routing brain. |
| `features/code/hooks/useOpenSourceEntry.ts` | Loads + opens any source‑backed entry. |
| `features/code/hooks/useSaveAndOpenInCodeEditor.ts` | Public helper for "save anywhere → /code". |
| `features/code/SANDBOX_API_WISHLIST.md` | Retired — points back to §3 of this doc. |
| `features/code/QA_CHECKLIST.md` | 10‑step end‑to‑end smoke against the hosted tier. |
| `features/code/agent-context/` | Editor → agent context bridge (selector + sync hook + selection capture). |
| `features/code/editor/monaco-environments/` | Refcounted Monaco type‑environment registry. |
| `features/code/views/source-control/` | Git activity view (status / diff / commit / push / credentials). |
| `lib/sandbox/api-surface.ts` | Per‑tier capability cache fed by `GET /api-surface`. |
| `app/api/sandbox/[id]/pty/route.ts` | WebSocket‑upgrade proxy for the orchestrator PTY route. |
| `features/agents/redux/execution-system/instance-context/instance-context.slice.ts` | The slot the editor will write into. |
| `features/agents/redux/execution-system/thunks/execute-instance.thunk.ts` | `assembleRequest` packs `instanceContext` into the wire. |
| `features/agents/types/request.types.ts` | `AssembledAgentStartRequest.context`. |
| `app/api/sandbox/persistence/route.ts` | GET/DELETE proxy to every orchestrator's `/users/{user_id}/persistence` + `/users/{user_id}/volume`. |
| `hooks/sandbox/use-user-persistence.ts` | `useUserPersistence()` + `formatPersistenceSize` + `findTierInfo`. |
| `features/code/runtime/openSessionReport.ts` | Auto-opens `~/.matrx/session-report.md` as a tab on connect. |
| `app/(authenticated)/settings/sandbox-storage/page.tsx` | Settings UI for per-tier wipe of persistent storage. |

---

## 8. Persistent storage — frontend wiring (shipped 2026‑04‑26)

The Python team's persistence Phases 1+2+3 (per-user `/home/agent` Docker volume on hosted, S3 prefix on EC2, session manifest, git auto-stash, session report) are fully consumed by the workspace. This section documents the surfaces for future maintainers — the underlying behavior is owned by the orchestrator and is described in the Python‑team‑maintained `docs/PERSISTENCE_PLAN.md`.

### 8.1 Data flow

```
orchestrator                                     matrx-admin
─────────────────────────────                   ────────────────────────────────────
GET  /users/{uid}/persistence  ──proxy──▶  GET  /api/sandbox/persistence
DELETE /users/{uid}/volume     ──proxy──▶  DELETE /api/sandbox/persistence?tier=…
~/.matrx/session-report.md     ──read───▶  openSessionReportTab → openTab
git branch matrx/auto-stash/*  ──exec───▶  SourceControlPanel auto-stash section
```

The Next API route fans out to every tier configured on the deployment (`hosted` and/or `ec2`). The `partial` flag in the response lets the UI distinguish "tier missing data" from "tier reported `0 B`" so we never mislabel a never-fetched tier as empty.

### 8.2 Hook contract

`useUserPersistence({ skip?, tier? }) → { info, loading, error, refresh, deleteVolume }`

- `info: UserPersistenceResponse | null` — `{ user_id, total_size_bytes, partial, tiers: UserPersistenceInfo[] }`.
- `refresh(tier?)` — re-fetches; pass a tier to scope, omit to refresh all.
- `deleteVolume(tier?)` — fans out the DELETE; resolves to `{ ok, error? }`. Optimistically zeroes out the matching tier in `info` so the UI updates before the round-trip completes.
- `formatPersistenceSize(bytes | null | undefined)` — returns `"—"` for null/undefined, otherwise `"X.X GB | X.X MB | XXX KB | X B"`.
- `findTierInfo(info, tier)` — convenience for create dialogs that only care about one tier.

### 8.3 Auto-stash branches

Naming convention is fixed by the orchestrator: `matrx/auto-stash/<unix-timestamp>`. The Source Control panel discovers them with:

```bash
git for-each-ref --format='%(refname:short)|%(committerdate:iso-strict)|%(subject)' refs/heads/matrx/auto-stash/
```

run through `SandboxProcessAdapter.exec`. We deliberately bypass `SandboxGitAdapter.branch` because that method only handles create/delete/switch — there's no list-with-metadata endpoint on the orchestrator's `/git/branch` route. Apply uses `git checkout <branch> -- .` so the user's current `HEAD` stays put; discarding does both `git branch -D` *and* a force `git push origin :<branch>` so the cleanup propagates to the remote.

### 8.4 Session report

`features/code/runtime/openSessionReport.ts` retries reading `~/.matrx/session-report.md` with backoff (immediate / 500ms / 1500ms / 3000ms) so the tab opens once the in-container daemon finishes rendering it. A `not found` short-circuits early (first-ever connect — no prior session). The tab id is `session-report:<sandboxId>` so it can't accumulate duplicates if the user reconnects.

### 8.5 Settings page

`/settings/sandbox-storage` mirrors what the orchestrator reports on each tier. Wipe buttons are disabled when `current_size_bytes === 0`. The "Wipe everything" card only renders when at least one tier has data. The 409 response from the orchestrator (volume still mounted) is surfaced inline in the confirm dialog with a link back to `/sandbox`, where the user can stop the active sandbox first.

### 8.6 What's not wired (Phase 5+6)

| Item | Owner | Blocker |
|---|---|---|
| Quota override per user (`hot_quota_bytes` / `total_quota_bytes`) | Python team | Phase 5 — `user_persistence` table + `hot-sync.sh` cap enforcement. |
| Admin panel quota surfacing | matrx-admin | Waits on Phase 5 columns. |
| Cross-tier portability (S3 authoritative for both tiers) | Python team | Phase 6 — needs AWS creds attached to the hosted server. |
| Org-shared persistence | Python team | Deferred past v1 per user directive. |

---

*If a section here goes stale, fix it — this doc is meant to be authoritative, not historical.*
