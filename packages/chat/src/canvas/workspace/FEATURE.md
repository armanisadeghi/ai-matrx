# FEATURE.md — `canvas workspace` (chat beside a canvas)

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-09-27`

> Build map: `/Users/armanisadeghi/code/common-docs/systems/chat/conversations/projects/ai-matrx-composer/MAP.md`. Ruling: Amendment 1, A5
> (`composer-spec-amendment-1.md`). The composer inside it: [`../../agents/components/inputs/smart-input/composer/FEATURE.md`](../../agents/components/inputs/smart-input/composer/FEATURE.md).

---

## Purpose

The ONE "chat beside a canvas" layout: **chat panel · canvas · properties panel**, beside the app shell's
OWN sidebar (owner, 2026-09-30: one sidebar and header a person can always count on), with three
switches — chat (docked / floating, and open / closed), properties (open / closed), input (grows to a knob
share of the panel). Navigation is the shell sidebar: its main menu is in front, and its **Chats** side (the
same `ChatSidebarMenu` as /chat, registered `defaultView: "main"` for these pages) opens conversations IN this
page's chat panel through `in-place-chat-host`. Every side panel is a `DockedSidePanel`
(`components/official/side-panel`): it slides open and closed and the person drags its edge to any width
between its min and max — chat 440 (340–760), properties 250 (220–420) — remembered per
person across canvas pages; dragging a panel past its minimum closes it. A MODULE can be hosted too: its layout
renders the workspace with the module's pages as the canvas (education does, for signed-in people), and every
`<PageHeader>` / `<RouteHeader>` inside portals into the workspace header — the module's own menu sits in the
canvas header, the app's menu is the shell sidebar. Generic: any canvas (a Board, a document, a Matrx UI) is a host. There must be only one
such layout in the app.

---

## Entry points

- **`ChatCanvasWorkspace`** (`ChatCanvasWorkspace.tsx`) — props: `id` (cookies + chat surface key),
  `canvas`, `title`, `titleMenu?`, `byline?`, `record?` (Share + comments; absent = those controls absent),
  `properties?` (tabs; absent = no panel), `getCanvasContext?`, `contextChip?`, `initialLayout?`
  (`readCanvasWorkspaceLayout(id, { defaultChatOpen })` — chat, properties, the two widths),
  `defaultChatOpen?` (default true; many pages start with the chat closed), `initialMode?`, `onClose?`. `title` is optional (a hosted module brings its
  own header).
- **`CanvasChatColumn`** — the platform's ONE chat column (`AgentConversationColumn`) with the COMPACT
  composer; `buildCanvasSmartInputProps` is the single place its composer props are built.
- **`useCanvasWorkspaceConversation(surfaceKey, { enabled, start, surfaceName })`** — the surface-owned
  conversation: `startNew`, `openExisting(id, agentId?)` (in place, through the canonical resume sequence
  `resumeConversation` — hydrate, re-surface an unanswered client tool prompt, reattach to a turn the server
  is still running; never `loadConversation` alone), `startWith(agentId, via?)`. `surfaceName: null` = the
  conversation IS its host's own chat (a board chat tile): launches adopt no mounted surface, like /chat's. Waits for an active
  organization and offers the ONE org gate (`ensureOrganizationContext`) — never picks one. With
  `enabled: false` nothing launches: a chat that starts closed launches when it is first opened.
- **`ChatPanelTitleMenu` / `useChatPanelTitle`** — the chat's name ▾ (New chat · Rename · Open in full chat),
  shared by every chat panel.
- **`CanvasPropertiesPanel`** — tabs; lists scroll with a bottom fade, scrollbar on hover.
- **Cookies** — `workspace-cookies.ts` (chat `side` · `floating` · `…:closed`, properties open/closed, sizes,
  panel ids) + `next/server/workspace-cookies.server.ts` (`readCanvasWorkspaceLayout`, the Next binding).
- **Navigation** — the shell sidebar + account rail (never a page-local nav). The page registers itself with
  `registerInPlaceChatHost` (`packages/chat/src/agents/components/chat/in-place-chat-host.ts`) so the sidebar's Chats
  side opens history and New chat in this panel; on a phone the header's menu button opens the shell drawer
  (`openShellMobileMenu`). Full screen hides the sidebar too (`useShellCanvasFullScreen`).
- **Shell mode** — `ShellChromeMode` / `ShellChromeRouteSync` (`features/shell/components/ShellChromeMode.tsx`)
  + `CANVAS_CHROME_ROUTES` (`features/shell/constants/canvas-chrome-routes.ts`) + `styles/shell.css` §13c.
- **Floating chat** — `MatrxFloatingFrame` with its `container` prop (bounded to the canvas region);
  size from the `agents.chat_composer.floating_panel_size` knob.
- **Demos** — `/demos/canvas-workspace` (the demo board as host) and
  `/demos/canvas-workspace/properties` (a real Properties tab).

---

## Key flows

**Canvas context → agent.** `getCanvasContext()` returns ONE `{key, value, type, label}` entry; the column
writes it with `setContextEntries` when the conversation exists and again in the CAPTURE phase of
pointerdown / Enter / focus inside the chat's own DOM (never from a portaled layer it opened — the page-chip
popover, the value panel), so every request carries the canvas as it is NOW. An unchanged snapshot is a
no-op in the slice, so the rail never re-renders for it. It never
rides `user_input` (THE USER-INPUT LAW). A `contextChip` with `contextKey` equal to the entry's key
REPLACES the rail's generic pill for it — one input, one pill.

**Canvas chrome.** The app shell stays mounted (Providers, overlays, windows, tray, org gate, error
capture, header portal targets) and `.shell-root[data-shell-chrome="canvas"]` hides its header, sidebar,
user block and dock. The attribute is stamped at SSR for listed routes and kept in sync on soft
navigation; a mounted `<ShellChromeMode/>` sets it on unlisted routes after hydration.

**Chat open / closed.** The chat panel header has Pop out and Hide; the floating window has Dock and ×
(hide). A hidden chat is reopened by the **Chat** button at the LEFT of the canvas header — where the chat opens
— or ⌘\ (which shows / hides it). The
chat column lives in exactly ONE place: the docked panel while docked (the panel stays mounted while hidden,
so the conversation keeps its place), the floating window while floating, the drawer below 1024px. The nav's
"+" and a history row open the chat if it is hidden.

**Agent switch.** The composer's agent pill calls `startWith`; Custom passes `via.mandateKey` so the chat
relaunches through `chat.default_new_chat` (the person's own default model applies).

---

## Invariants & gotchas

- **The page header slot:** the canvas header renders `[data-page-header-target="workspace"]` (center) and
  `[data-page-header-right-target="workspace"]`; `PageHeaderPortal` / `PageHeaderRightPortal` prefer them over
  the (hidden) shell header slots.
- **Hosted modules for signed-in people only** are listed in `SIGNED_IN_CANVAS_CHROME_ROUTES` (education): a
  guest keeps the ordinary shell (the chat needs an account). `AppShell` stamps `data-signed-in`.
- **List a route in `CANVAS_CHROME_ROUTES` only once its page renders `ChatCanvasWorkspace`** — listing it
  earlier hides the shell header with nothing to replace it.
- **The Agents menu and Inbox live in the canvas header** on canvas pages (agent disclosure: a surface's
  jobs stay reachable from the Agents menu).
- **The workspace owns ⌘\\ here** (show / hide the chat); the global canvas side sheet stands down while
  `data-shell-chrome="canvas"` is present.
- **Below 1024px it is one pane** — the canvas; chat, nav and properties are sheets.
- **A canvas that publishes its OWN surface passes no `getCanvasContext`.** The Board is the
  `matrx-user/board` surface (values `board_title` / `board_tiles` / `selected_tile` + the `board_*`
  agent tools, `features/board/components/SpatialBoardSurface.tsx`); a page-level snapshot of it would send
  the board twice. `getCanvasContext` is for canvases with no surface of their own.
- **Board contract** (`features/board` is owned by another session): the board draws its own
  ToolBar + ZoomMenu inside its canvas and its own surface; it still owes — once it exposes its store outside
  its viewport — its LayersPanel as a Properties tab and an insets callback so fit-to-view avoids the
  floating chat. `/demos/spatial` and `/board` render the workspace; the interim `features/board/chat/`
  split was deleted 2026-09-27.
- **Open:** Share/comments are unexercised (no demo has a record); at 390px the board's own ToolBar and
  ZoomMenu overlap (Board-owned); the Error Inspector badge sits over the nav's user row bottom-left.

---

> The Board (`/board`) is owned by [`features/board/FEATURE.md`](../../../../../features/board/FEATURE.md); this doc owns the workspace host only.

## Change Log

- **2026-10-01** — **A reload returns to the conversation.** The workspace chat lives at `?chat=<id>`
  (`useCanvasWorkspaceConversation` option `addressParam`): read once on mount (nothing launches before it is read),
  written once the server has the conversation, removed by New chat. Board chat tiles leave the address alone.
  Guard: `__tests__/workspace-chat-survives-reload.test.tsx` (3 red on the old hook).

- **2026-09-30** — The canvas re-read fires only for events inside the column's own DOM (React events bubble
  through portals, so the page-chip popover and value panel used to trigger it), and `setContextEntries`
  keeps the conversation's entries identical when the snapshot is unchanged.

- **2026-09-30** — **One sidebar.** The canvas nav (`CanvasNav`, `CanvasUserRow`, its cookie and hover
  preview) is deleted: these pages show the shell sidebar and account rail, main menu in front, and its Chats
  side (`ChatSidebarMenu`, `defaultView: "main"`) opens conversations in the page's chat panel via
  `in-place-chat-host`. Canvas chrome now hides only the shell header and dock.

- **2026-09-28** — Reopening a conversation (history row, a saved board chat tile) runs `resumeConversation`
  instead of `loadConversation` alone, so a turn that was mid-run at reload reattaches and an unanswered
  client tool prompt comes back. `openExisting` takes the row's agent; options gain `surfaceName: null`.

- **2026-09-27** — `PageContextRow` and its cookie removed: the page on/off lives in the composer's page chip
  (`ConversationContextChip`, turning it back on re-reads the page). Every panel/header border line removed.
- **2026-09-27** — Built: workspace, canvas nav + user row + org drop-up, shell canvas chrome, floating
  chat, properties panel, demos; the chat panel is the compact composer with agent switching;
  `contextKey` dedupes the canvas pill; `/demos/spatial` unlisted until it hosts the workspace.
- **2026-09-27** — `/demos/spatial` hosts the workspace (listed in `CANVAS_CHROME_ROUTES` again); the Board
  host passes no snapshot — the board's own surface carries it; `matrx-user/board` registered in
  `ui.ui_surface` (it was unregistered, so every send beside a board failed 422).
- **2026-09-27** — `useCanvasWorkspaceConversation(surfaceKey, start?)`: an optional mount request (`new` /
  `agent` / `open`), so a host owning several conversations — one per Board chat tile
  (`features/board/items/work-items.tsx`) — reuses this hook and `CanvasChatColumn` instead of a copy.
- **2026-09-27** — Every side panel is a `DockedSidePanel` (slide + drag-resize + remembered width); the chat
  can be hidden completely (Chat button / ⌘\ reopens it) and starts closed where the host says
  (`defaultChatOpen`), launching only on first open; properties can be hidden; hosts pass `initialLayout`.
- **2026-09-27** — Education hosted in the workspace (signed in); page headers portal into the canvas header;
  `followPageSurface`; the Chat reopen button moved to the left; drag past the minimum closes a panel; 600ms slide;
  click-collapse no longer re-opens on hover; More shows every sub-destination.
