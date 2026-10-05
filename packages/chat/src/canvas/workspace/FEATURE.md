# FEATURE.md — `canvas workspace` (the one chat, and the canvas beside it)

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-10-05`

> Build map: `/Users/armanisadeghi/code/common-docs/systems/chat/conversations/projects/ai-matrx-composer/MAP.md`. Ruling: Amendment 1, A5
> (`composer-spec-amendment-1.md`). The composer inside it: [`../../agents/components/inputs/smart-input/composer/FEATURE.md`](../../agents/components/inputs/smart-input/composer/FEATURE.md).

---

## Purpose

**ONE chat, on every page** (owner, 2026-10-01 "the new menu MUST offer the chat on ALL pages"; 2026-10-05
"one copy of everything"). The chat is `ShellChatDock`, mounted once by the app shell beside its sidebar and
kept across navigation. It stands aside only on `/chat` (the chat itself) and `/code` (its own coding agent).
A canvas page — the Board, signed-in Education, the canvas demos — no longer draws a chat: it renders
`ChatCanvasWorkspace` (**canvas · properties panel** + its own header) beside the shell chat and hands the chat
its context with `useShellChatContext`. Navigation is the shell sidebar; its **Chats** side opens conversations
IN the shell chat through `in-place-chat-host`. Every side panel is a `DockedSidePanel`
(`components/official/side-panel`): slides, drags to any width between min and max — chat 440 (340–760),
properties 250 (220–420) — remembered per person; dragging past the minimum closes it.

**Homes** (`shellChatHome(pathname, signedIn)`): which conversation the shell chat shows and where its
open / closed + docked / floating choice is remembered. Each board (`/board/<id>`) has its own conversation
(`canvas-workspace:board-<id>`, `?chat=`, open by default); signed-in Education has one
(`canvas-workspace:education`, `?chat=`, closed by default); every other page shares one conversation that
follows the person (`canvas-workspace:shell`, `?pageChat=`), remembered per page family, open by default only
at ≥ 1440px. These are the exact ids, params and defaults the Board and Education used when they drew their own
chat, so cookies, `?chat=` links and this device's remembered conversation carried over with no migration.

---

## Entry points

- **`ShellChatDock`** (`ShellChatDock.tsx`) — THE chat. Docked (fixed beside the sidebar, publishes
  `--shell-chat-w`), popped out (`MatrxFloatingFrame` over the page; size from the
  `agents.chat_composer.floating_panel_size` knob), or a sheet on a phone. Owns ⌘\, the in-place chat host,
  the remark sink, the domain-panel fold. AppShell reads its home's cookie on the server (first paint) and
  stamps `data-shell-chat-available`.
- **`ShellChatToggle`** (`features/shell/components/header/`) — the one chat button, fixed at the chat column's
  left edge on every page (canvas pages too: the shell header hides by `visibility`, the button stays visible).
  On a phone a canvas page's own header has a Chat button that fires the same `SHELL_CHAT_TOGGLE_EVENT`.
- **`useShellChatContext({ getCanvasContext?, contextChip? })`** (`shell-chat-page-context.ts`) — how a page
  hands the shell chat what it shows: ONE `{key, value, type, label}` entry + its composer pill. Released on
  unmount; the column drops the entry from the conversation when the page goes away.
- **`ChatCanvasWorkspace`** — props: `id` (the properties cookie), `canvas`, `title`, `titleMenu?`,
  `byline?`, `record?` (Share + comments), `properties?` (tabs), `getCanvasContext?`, `contextChip?` (both
  forwarded to `useShellChatContext`), `initialLayout?` (`readCanvasWorkspaceLayout(id)` — properties open +
  width), `onClose?`.
- **`CanvasChatColumn`** — the platform's ONE chat column (`AgentConversationColumn`) with the COMPACT
  composer; `buildCanvasSmartInputProps` is the single place its composer props are built. Hosts: the shell
  chat and a board chat TILE only (guard: `__tests__/one-chat-panel.test.ts`).
- **`useCanvasWorkspaceConversation(surfaceKey, { enabled, start, surfaceName, addressParam })`** — the
  conversation: `startNew`, `openExisting(id, agentId?)` (in place, through `resumeConversation`),
  `startWith(agentId, via?)`. A changed `surfaceKey` starts over for the new home (address, memory, launch)
  without remounting. `surfaceName: null` = the conversation IS its host's own chat (a board chat tile).
  Waits for an active organization and offers the ONE org gate — never picks one. `enabled: false` launches
  nothing (a closed chat costs nothing).
- **`ChatPanelTitleMenu` / `useChatPanelTitle`** — the chat's name ▾ (New chat · Rename · Open in full chat).
- **`CanvasPropertiesPanel`** — tabs; lists scroll with a bottom fade, scrollbar on hover.
- **Cookies** — `workspace-cookies.ts`: the shell chat per home (`canvas-workspace:<layoutId>:chat` =
  `side` · `floating` · `…:closed`), the workspace's properties open/closed, shared widths;
  `next/server/workspace-cookies.server.ts` (`readCanvasWorkspaceLayout`).
- **Shell mode** — `ShellChromeMode` / `ShellChromeRouteSync` + `CANVAS_CHROME_ROUTES` + `styles/shell.css` §13c.
- **Demos** — `/demos/canvas-workspace` (the demo board) and `/demos/canvas-workspace/properties` (a real
  Properties tab + a `getCanvasContext` entry and its pill).

---

## Key flows

**Page context → agent.** Every conversation already follows the page SURFACE (`useConversationFollowsPage`).
A canvas with no surface of its own hands ONE entry via `useShellChatContext`; the column writes it with
`setContextEntries` when the conversation exists, again in the CAPTURE phase of pointerdown / Enter / focus
inside the chat's own DOM, and removes it (`removeContextEntry`) when the page releases it. It never rides
`user_input` (THE USER-INPUT LAW). A `contextChip` with `contextKey` equal to the entry's key REPLACES the
rail's generic pill for it.

**Canvas chrome.** The app shell stays mounted; `.shell-root[data-shell-chrome="canvas"]` hides the shell
header (by visibility — its chat button stays), the phone trigger and the phone dock; the shell chat, sidebar
and account rail stay. Full screen (`data-canvas-fullscreen`) hides sidebar, rail, chat and chat button;
anything that opens the chat fires `SHELL_CHAT_REVEAL_EVENT` and the workspace leaves full screen.

**Chat open / closed.** The chat button (or ⌘\) shows / hides it; the docked header has Pop out, the floating
window has Dock and × (hide). The column lives in ONE place: the docked panel (stays mounted while hidden), the
floating window, or the phone sheet. History rows, "New chat", a pinned agent and a comment riding along
(remark sink) all open the chat if hidden.

---

## Invariants & gotchas

- **The page header slot:** the canvas header renders `[data-page-header-target="workspace"]` (center) and
  `[data-page-header-right-target="workspace"]`; `PageHeaderPortal` / `PageHeaderRightPortal` prefer them.
- **Hosted modules for signed-in people only** are listed in `SIGNED_IN_CANVAS_CHROME_ROUTES` (education).
- **List a route in `CANVAS_CHROME_ROUTES` only once its page renders `ChatCanvasWorkspace`.**
- **A page with a conversation of its own is a `shellChatHome` entry**, never a second chat panel.
- **A canvas that publishes its OWN surface passes no `getCanvasContext`** (the Board: `matrx-user/board`).
- **The remark sink is the shell chat on every page** (it used to exist only on canvas pages), so a comment's
  "With next message" switch shows wherever the chat does.
- **Below 1024px** the canvas is one pane; chat and properties are sheets; navigation is the shell drawer.
- **Open:** Share/comments unexercised in the demos; at 390px the board's ToolBar and ZoomMenu overlap
  (Board-owned).

---

> The Board (`/board`) is owned by [`features/board/FEATURE.md`](../../../../../features/board/FEATURE.md); this doc owns the workspace host only.

## Change Log

- **2026-10-05** — **One chat.** `ChatCanvasWorkspace` no longer draws a chat (docked panel, floating window,
  phone chat sheet, ⌘\, in-place host, remark sink and its conversation all deleted from it): the Board,
  Education and the demos show the shell's `ShellChatDock`, which gained pop-out, the remark sink, full-screen
  handling and per-page homes (`shellChatHome`) keeping each board's and Education's own conversation, `?chat=`
  and cookies. Pages hand context with `useShellChatContext`. `readCanvasWorkspaceLayout` lost its chat fields
  (and `defaultChatOpen`); `initialMode` / `defaultChatOpen` props removed. Guards:
  `__tests__/one-chat-panel.test.ts`, `shell-chat-route.test.ts`, `shell-chat-page-context.test.tsx`, the
  "moves between homes" case in `workspace-chat-survives-reload.test.tsx` (red on the old hook).

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
  `contextKey` dedupes the canvas pill; `/demos/board` unlisted until it hosts the workspace.
- **2026-09-27** — `/demos/board` hosts the workspace (listed in `CANVAS_CHROME_ROUTES` again); the Board
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
