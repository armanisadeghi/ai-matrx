# FEATURE.md — `canvas workspace` (chat beside a canvas)

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-09-27`

> Build map: `/Users/armanisadeghi/code/common-docs/projects/ai-matrx-composer/MAP.md`. Ruling: Amendment 1, A5
> (`composer-spec-amendment-1.md`). The composer inside it: [`../../agents/components/inputs/smart-input/composer/FEATURE.md`](../../agents/components/inputs/smart-input/composer/FEATURE.md).

---

## Purpose

The ONE "chat beside a canvas" layout: **left nav · chat panel · canvas · properties panel**, with three
switches — nav (collapsed / hover / open), chat (side / floating), input (grows to a knob share of the
panel). Generic: any canvas (a spatial board, a document, a Matrx UI) is a host. There must be only one
such layout in the app.

---

## Entry points

- **`ChatCanvasWorkspace`** (`ChatCanvasWorkspace.tsx`) — props: `id` (cookies + chat surface key),
  `canvas`, `title`, `titleMenu?`, `byline?`, `record?` (Share + comments; absent = those controls absent),
  `properties?` (tabs; absent = no panel), `getCanvasContext?`, `contextChip?`, `initialNav?`,
  `initialChat?`, `initialMode?` (server-read cookies), `onClose?`.
- **`CanvasChatColumn`** — the platform's ONE chat column (`AgentConversationColumn`) with the COMPACT
  composer; `buildCanvasSmartInputProps` is the single place its composer props are built.
- **`useCanvasWorkspaceConversation(surfaceKey)`** — the surface-owned conversation: `startNew`,
  `openExisting` (in place, `loadConversation`), `startWith(agentId, via?)`. Waits for an active
  organization and offers the ONE org gate (`ensureOrganizationContext`) — never picks one.
- **`CanvasPropertiesPanel`** — 250px, tabs; lists scroll with a bottom fade, scrollbar on hover.
- **Canvas chrome** (`features/shell/canvas-chrome/`): `CanvasNav` (rows sourced from `primaryNavItems`;
  history = `ConversationHistorySidebar` with `openInPlace`), `CanvasUserRow` (user menu = the shell's
  `UserMenuPanel` via `ShellUserMenu`; org drop-up = `useActiveOrganizationPicker`).
- **Shell mode** — `ShellChromeMode` / `ShellChromeRouteSync` (`features/shell/components/ShellChromeMode.tsx`)
  + `CANVAS_CHROME_ROUTES` (`features/shell/constants/canvas-chrome-routes.ts`) + `styles/shell.css` §13c.
- **Floating chat** — `MatrxFloatingFrame` with its `container` prop (bounded to the canvas region);
  size from the `agents.chat_composer.floating_panel_size` knob.
- **Demos** — `/demos/canvas-workspace` (the spatial demo board as host) and
  `/demos/canvas-workspace/properties` (a real Properties tab).

---

## Key flows

**Canvas context → agent.** `getCanvasContext()` returns ONE `{key, value, type, label}` entry; the column
writes it with `setContextEntries` when the conversation exists and again in the CAPTURE phase of
pointerdown / Enter / focus inside the chat, so every request carries the canvas as it is NOW. It never
rides `user_input` (THE USER-INPUT LAW). A `contextChip` with `contextKey` equal to the entry's key
REPLACES the rail's generic pill for it — one input, one pill.

**Canvas chrome.** The app shell stays mounted (Providers, overlays, windows, tray, org gate, error
capture, header portal targets) and `.shell-root[data-shell-chrome="canvas"]` hides its header, sidebar,
user block and dock. The attribute is stamped at SSR for listed routes and kept in sync on soft
navigation; a mounted `<ShellChromeMode/>` sets it on unlisted routes after hydration.

**Agent switch.** The composer's agent pill calls `startWith`; Custom passes `via.mandateKey` so the chat
relaunches through `chat.default_new_chat` (the person's own default model applies).

---

## Invariants & gotchas

- **List a route in `CANVAS_CHROME_ROUTES` only once its page renders `ChatCanvasWorkspace`** — listing it
  earlier hides the shell's nav with nothing to replace it.
- **The Agents menu and Inbox live in the canvas header** on canvas pages (agent disclosure: a surface's
  jobs stay reachable from the Agents menu).
- **The workspace owns ⌘\\ here** (dock/undock chat); the global canvas side sheet stands down while
  `data-shell-chrome="canvas"` is present.
- **Below 1024px it is one pane** — the canvas; chat, nav and properties are sheets.
- **A canvas that publishes its OWN surface passes no `getCanvasContext`.** The spatial board is the
  `matrx-user/spatial-board` surface (values `board_title` / `board_tiles` / `selected_tile` + the `board_*`
  agent tools, `features/spatial/components/SpatialBoardSurface.tsx`); a page-level snapshot of it would send
  the board twice. `getCanvasContext` is for canvases with no surface of their own.
- **Spatial board contract** (`features/spatial` is owned by another session): the board draws its own
  ToolBar + ZoomMenu inside its canvas and its own surface; it still owes — once it exposes its store outside
  its viewport — its LayersPanel as a Properties tab and an insets callback so fit-to-view avoids the
  floating chat. `/demos/spatial` renders the workspace; the interim `features/spatial/chat/`
  `BoardWithChat` / `BoardChatPanel` / `SpatialDemoBoardWithChat` are now unused (theirs to delete).
- **Open:** Share/comments are unexercised (no demo has a record); at 390px the board's own ToolBar and
  ZoomMenu overlap (spatial-owned); the Error Inspector badge sits over the nav's user row bottom-left.

---

## Change Log

- **2026-09-27** — Built: workspace, canvas nav + user row + org drop-up, shell canvas chrome, floating
  chat, properties panel, demos; the chat panel is the compact composer with agent switching;
  `contextKey` dedupes the canvas pill; `/demos/spatial` unlisted until it hosts the workspace.
- **2026-09-27** — `/demos/spatial` hosts the workspace (listed in `CANVAS_CHROME_ROUTES` again); the spatial
  host passes no snapshot — the board's own surface carries it; `matrx-user/spatial-board` registered in
  `ui.ui_surface` (it was unregistered, so every send beside a board failed 422).
