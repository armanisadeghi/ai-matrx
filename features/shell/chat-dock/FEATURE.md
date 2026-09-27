# FEATURE.md — `chat-dock` (chat beside any page)

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-09-27`

> The composer build map: `/Users/armanisadeghi/code/common-docs/projects/ai-matrx-composer/MAP.md`.
> The chat inside is the composer's compact size: [`../../agents/components/inputs/smart-input/composer/FEATURE.md`](../../agents/components/inputs/smart-input/composer/FEATURE.md).

---

## Purpose

A chat docked on the RIGHT of every ordinary app page — the app's own header and sidebar untouched — that sees
the page the person is on. Closed by default everywhere; one header control opens it. Pages with fully custom
chrome use the canvas workspace instead (`features/canvas/workspace/`).

It is ONE shell-level presentation, not a per-route wrapper: the owner rejected a per-route docked column on
2026-09-16 (*"adds an unnecessary layer, causes a shift in the top header buttons"*). Every `(core)` and
`(admin)` page gets it with no page code.

---

## Entry points

- `ChatDockSlots.tsx` — server slots: `ShellChatDockSlot` (in `AppShell`, right after `<main>`, signed-in only)
  and `ChatDockHeaderSlot` (in THE HEADER RIGHT SET). Each reads the dock's cookies where it renders.
- `ShellChatDock.tsx` — the dock: `DockedSidePanel` (right edge, 420px default, 340–720 drag, remembered) →
  header (`ChatPanelTitleMenu`, `ComposerModeSwitch`, Hide) → the "Sees <page>" row → `CanvasChatColumn`.
  Below 1024px the same chat is a bottom sheet.
- `useChatDock.ts` — THE controller (dock open, sheet open, availability, toggle), shared by the dock, the
  header control and the phone overflow row.
- `ChatDockHeaderButton.tsx` — the header control (`MessageTapButton`): pressed while open; disabled with the
  reason where the dock is unavailable; the auth gate for a guest.
- `chat-dock-cookie.ts` / `chat-dock.server.ts` — cookies `shell:chat-dock` (open), `shell:chat-dock:page`
  (page context on/off), width via `side-panel:shell-chat-dock:width`; `chatDockUnavailableReason(pathname)`.
- State: `lib/redux/slices/layoutSlice.ts` — `chatDockOpen` (`null` until toggled in this tab → readers use
  the server-read value), `chatDockSheetOpen`.

---

## Key flows

**Layout.** `styles/shell.css` §7: `.shell-root` columns `sidebar 1fr auto`, areas
`"sidebar header header" / "sidebar main chatdock"`. The dock is the `auto` column (its own animated width; 0
closed); the HEADER spans above it, so opening the dock never moves a header button (verified: identical x
positions open vs closed). Rules that list two tracks get the third as an implicit `auto`. Below 1024px, in
canvas chrome, and with no session the dock is absent.

**The conversation.** `useCanvasWorkspaceConversation("shell-chat-dock", { enabled: shown })` — the
`chat.default_new_chat` job, organization-gated, launched only when the chat is first shown. A closed dock costs
nothing on page load. `shown` is false until the viewport is KNOWN (`useMediaQueryState`, `hooks/use-media-query.ts`
— `null` on the server and during hydration): a phone that inherits a desktop "open" cookie starts no chat
(verified: zero launch requests at 390px).

**Page context.** `useConversationFollowsPage` (features/surfaces/runtime) keeps the conversation's surface
stamp equal to `useActivePageSurface()` while "Sees" is on, so every turn's `refresh-surface-scope` reads the
page the person is on NOW — it follows them across pages. Off clears the stamp and the values already handed
over. On by default: this is the explicit, visible, switchable helper-context choice
(common-docs/systems/mandates/STATE.md), not ambient inheritance. Quick Chat uses the same hook.

**Viewport-pinned page UI.** `--shell-chat-dock-w` on `.shell-root` (0 when closed; server-painted when open on
an available route, kept current by `DockedSidePanel publishWidthAs`) — anything pinned to the viewport that must clear the dock reads it
(`.ambient-assistant-dock` centres left of it).

---

## Invariants & gotchas

- **Unavailable routes:** `/chat` and `/chat/*` (the page is a chat), canvas-chrome routes (their own chat).
  The control stays in the header, disabled with the reason — never hidden (THE HEADER RIGHT SET).
- **One chat column at a time:** the panel renders it only on a wide screen, the sheet only below 1024px.
- **Open:** Quick Chat (an overlay) and this dock are two presentations of a beside-the-page chat; folding
  Quick Chat into the dock is the next step, not a second path to grow.

---

## Change Log

- **2026-09-27** — Review fixes: no launch before the viewport is known; the dock takes at most half the window;
  a guest's control is never pressed; no width variable on unavailable routes.
- **2026-09-27** — Created: dock, header control (Search · Agents · Chat · Canvas · Inbox), phone row, page
  context that follows navigation, `--shell-chat-dock-w`. Verified on `/education/overview` → `/education/planner`.
