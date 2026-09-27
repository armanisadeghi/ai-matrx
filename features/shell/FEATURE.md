# Shell — the application chrome (sidebar, header, user block, mobile)

**Purpose:** the one frame around every authenticated route (`AppShell`, used
by `(core)` and `(admin)`; the `(dev)` layout mirrors it). Sub-features carry
their own docs: sidebar `components/sidebar/FEATURE.md`, route headers
`components/header/variants/USAGE.md` + the `core-route-headers` skill. This
file holds the two laws that span them.

**Canvas chrome** — a page that hosts `ChatCanvasWorkspace` flips this shell to
`data-shell-chrome="canvas"` (header, sidebar, user block and dock step aside; every
island stays mounted) and draws its own nav + headers: read
[`../canvas/workspace/FEATURE.md`](../canvas/workspace/FEATURE.md) before touching
`ShellChromeMode`, `canvas-chrome-routes.ts`, `canvas-chrome/` or `shell.css` §13c.

## THE HEADER RIGHT SET (owner, 2026-09-19)

> *"we need to create a consistent set of things for that top-right section so
> that desktop has a consistent feel and so does mobile. One critical part of
> consistency is never hiding things and only disabling when inactive."*

`components/header/Header.tsx` mounts, at every breakpoint and in every auth
state, in this order:

```
[ route-injected actions (#shell-header-right) ] [ Search ] [ Agents ] [ Chat ] [ Canvas ] [ Inbox ]
```

| Control | File | Inactive state |
|---|---|---|
| Agents | `features/surfaces/components/chrome/SurfaceAgentsHeaderButton.tsx` | Guest → the same button opens the auth gate. |
| Chat | `features/shell/chat-dock/ChatDockHeaderButton.tsx` (via `ChatDockHeaderSlot`) | Guest → auth gate. `/chat` and canvas pages → `disabled`, tooltip says why. Open → pressed; hides the dock. The chat dock itself: [`chat-dock/FEATURE.md`](./chat-dock/FEATURE.md). |
| Canvas | `features/canvas/core/CanvasHeaderToggle.tsx` | Empty → `disabled`, tooltip says why. Open → pressed, puts the canvas away. The 44px slot never unmounts (`canvas-header-slot-reserved.test.tsx`). |
| Inbox | `features/notifications/components/InboxHeaderButton.tsx` | Guest → auth gate. Badge absent at 0; a partially-unknown count says so. |

**On a phone (below 640px) the five fold into ONE control** —
`components/header/HeaderPhoneOverflow.tsx`, a bottom sheet holding Search,
Agents (its panel opens in the sheet), Chat (the chat dock's bottom sheet; a
page that is its own chat is a disabled row that says why), Canvas (same three
states; empty is a disabled row that says why) and Inbox (its panel in the sheet; the unread count
rides the button). The four stay mounted in `.shell-header-secondary`; the swap
is CSS (`styles/shell.css`), so the server-rendered row never shifts, and the
phone always shows that one button — consistent per device, nothing removed.
Why: at 375px the set took the page title down to "C." / "Fla…" (page-pass
shared defects, 2026-09-27). Guard: `components/header/HeaderPhoneOverflow.test.tsx`.

Rules: a control is never unmounted on state — that is what shifted the row
(owner, 2026-09-16: *"causes a shift in the top header buttons"*). A control
with nothing to do is `disabled` **with a tooltip naming the reason and the
way out**; a control a guest cannot use opens the auth gate naming the
feature. The one conditional element is the "Choose org" nudge, which exists
only while no organization is chosen — tinted primary as a call to action,
never alarm red (no organization is a routine state; page-pass core 5). Guards:
`features/shell/__tests__/header-right-set.test.ts` (source),
`features/canvas/__tests__/canvas-header-slot-reserved.test.tsx` (rendered),
`features/shell/layout-gate/canvas-one-presentation.spec.ts` (laid out).

## THE USER BLOCK — the person is bottom-left (2026-09-19)

The profile/avatar menu lives where the sidebar ends
(`components/user-block/ShellUserBlock.tsx`), as Claude, ChatGPT, Notion,
Slack and Cursor place it. One copy: the header, canvas-pane and glass-layer
copies (and every CSS rule that hid one to show another) are gone.

- **Desktop:** a fixed, rail-width block (`.shell-user-block`, height
  `--shell-user-block-h`) that widens with the sidebar and shows name + email
  when expanded; the menu panel opens to its right, bottom-aligned. A route
  that hides the sidebar keeps the rail-width block. `.shell-sidebar-footer`
  reserves the block's height so Settings never sits under it.
- **Mobile:** no rail; the navigation drawer ends in `MobileDrawerUserRow`,
  which closes the drawer and opens the same menu (bottom-anchored panel).
- **Guest:** the block shows Sign In / Sign Up; the drawer row is "Sign in".
- **Mechanism:** unchanged — the shell root's `#shell-user-menu` checkbox;
  every menu item sits in `MenuItemCloseLabel` (`menuCheckboxId.tsx`), a
  `<label htmlFor>` that also closes on a click on its button/link — label
  activation skips interactive descendants, so a bare label left the menu open
  over the window a button item opened (guard: `menuCheckboxId.test.ts`). The
  portable `ShellUserMenu` (transitional `ResponsiveLayout`) still drops down
  from its header (`.shell-user-menu-portable-root` override).

The menu's "things for you" rows (Messages, Notifications, Waiting on you)
moved to the Inbox — the menu is identity, org, quick access, settings, admin,
sign out.

## Change log

- **2026-09-27** — The header right set gains Chat (the chat dock, `chat-dock/`); the shell grid gains the `chatdock` column the header spans.
- `2026-09-27` — **The phone header keeps the title**: below 640px Search / Agents / Canvas / Inbox fold into `HeaderPhoneOverflow` (one button → bottom sheet with the same four). `AGENTS_AUTH_GATE`, `INBOX_AUTH_GATE`, `useOpenBarOrGate`, `useCanvasHeaderToggle`, `SurfaceAgentsPanelImpl` are exported so the sheet reuses each control's own copy and state.

- `2026-09-27` — **"Choose org" is a call to action, not an alarm** (page-pass shared defects): the header nudge, the avatar ring and the account menu's Organization icon move from red to primary. Guards: `HeaderChooseOrgButton.test.tsx`, `UserMenuOrgSection.test.tsx`.

- `2026-09-27` — **Menu items close the menu** (page-pass, Feedback window): `MenuItemCloseLabel` replaces the bare `<label htmlFor>` wrapper in every item; button items (Submit Feedback, Announcements, Approvals, Error Inspector, Copy short link…) used to leave the user menu open.
- `2026-09-27` — **Canvas chrome**: `ShellChromeMode` / `ShellChromeRouteSync`, `CANVAS_CHROME_ROUTES`, `shell.css` §13c, and `features/shell/canvas-chrome/` (the canvas nav + user row) for the chat-beside-a-canvas layout (`../canvas/workspace/FEATURE.md`).

- `2026-09-26` — **The layout gate now loads the CSS the app SHIPS.** `layout-gate/shipped-css-region-triggers.spec.ts` derives every `@ai-matrx/*` stylesheet the app imports (from the repo's own `import "…css"` / `@import` lines, resolved through Node, nested `@import`s inlined) plus `styles/shell.css`, and measures a sidebar row, the composer textarea, a message region and a nested `.matrx-tap-icon` with vs without `CONTEXT_REGION_TRIGGER_ATTRS`. RED on design-system 0.44.1 (`MATRX_LAYOUT_GATE_CSS_OVERRIDE=@ai-matrx/design-system=<dist dir>`: row 32px vs 240px, composer 32px vs 665px, icon 18px vs 14px), GREEN on 0.44.3. `pnpm check:shell-layout` (`scripts/check-shell-layout-gate.mjs`) runs the whole gate as a release after-phase SIGNAL row; missing Chromium is `[FAIL] UNMEASURED` with the install remedy.

- `2026-09-25` — Removed the retired top-right elevated profile menu from both shells and floating panels; `ShellUserBlock` remains the profile control.

- **2026-09-21** — The account menu's collapsed groups are now HIDDEN, not just
  clipped. `MenuGroup`'s `grid-rows-[0fr]` disclosure kept every collapsed row
  in the hit-test tree and the tab order, so a group low in the panel parked
  live buttons below the panel and below the window: cold walk 16's defect E
  measured the theme row at `top 878, bottom 906` in a 900px window, answering
  `elementFromPoint` with `LABEL.shell-user-menu-backdrop`, unscrollable (a
  clipped child adds nothing to `scrollHeight`) and unclickable (three real
  mouse clicks timed out). Fixed with `invisible peer-checked:visible` on the
  disclosure; `.shell-user-menu-panel` subtracts the safe-area insets from its
  viewport bound. Gate:
  `features/shell/layout-gate/user-menu-reachability.spec.ts`, which runs at
  1280x720, **1440x900** (added to `playwright.shell-layout.config.ts` for
  this defect) and 390x844.

- **2026-09-19** — Created with the header right set and the bottom-left user
  block. Deleted: `CanvasPaneHeaderChrome.tsx`, `CanvasReopenChip.tsx`,
  `ElevatedShellUserMenu.tsx` + store, the canvas/elevated menu CSS, the
  `:root[data-canvas-open]` avatar hide, `NotificationsMenuItem.tsx`,
  `MessagesMenuItem.tsx`, `ApprovalsMenuItem.tsx`.
