# Shell — the application chrome (sidebar, header, user block, mobile)

**Purpose:** the one frame around every authenticated route (`AppShell`, used
by `(core)` and `(admin)`; the `(dev)` layout mirrors it). Sub-features carry
their own docs: sidebar `components/sidebar/FEATURE.md`, route headers
`components/header/variants/USAGE.md` + the `core-route-headers` skill. This
file holds the two laws that span them.

## THE HEADER RIGHT SET (owner, 2026-09-19)

> *"we need to create a consistent set of things for that top-right section so
> that desktop has a consistent feel and so does mobile. One critical part of
> consistency is never hiding things and only disabling when inactive."*

`components/header/Header.tsx` mounts, at every breakpoint and in every auth
state, in this order:

```
[ route-injected actions (#shell-header-right) ] [ Agents ] [ Canvas ] [ Inbox ]
```

| Control | File | Inactive state |
|---|---|---|
| Agents | `features/surfaces/components/chrome/SurfaceAgentsHeaderButton.tsx` | Guest → the same button opens the auth gate. |
| Canvas | `features/canvas/core/CanvasHeaderToggle.tsx` | Empty → `disabled`, tooltip says why. Open → pressed, puts the canvas away. The 44px slot never unmounts (`canvas-header-slot-reserved.test.tsx`). |
| Inbox | `features/notifications/components/InboxHeaderButton.tsx` | Guest → auth gate. Badge absent at 0; a partially-unknown count says so. |

Rules: a control is never unmounted on state — that is what shifted the row
(owner, 2026-09-16: *"causes a shift in the top header buttons"*). A control
with nothing to do is `disabled` **with a tooltip naming the reason and the
way out**; a control a guest cannot use opens the auth gate naming the
feature. The one conditional element is the red "Choose org" nudge, a warning
that exists only while no organization is chosen. Guards:
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
  every menu item closes via `<label htmlFor="shell-user-menu">`. The
  portable `ShellUserMenu` (transitional `ResponsiveLayout`) still drops down
  from its header (`.shell-user-menu-portable-root` override).

The menu's "things for you" rows (Messages, Notifications, Waiting on you)
moved to the Inbox — the menu is identity, org, quick access, settings, admin,
sign out.

## Change log

- **2026-09-21** — The account menu's collapsed groups are now HIDDEN, not just
  clipped. `MenuGroup`'s `grid-rows-[0fr]` disclosure kept every collapsed row
  in the hit-test tree and the tab order, so a group low in the panel parked
  live buttons below the panel and below the window: cold walk 16's defect E
  measured the theme row at `top 878, bottom 906` in a 900px window, answering
  `elementFromPoint` with `LABEL.shell-user-menu-backdrop`, unscrollable (a
  clipped child adds nothing to `scrollHeight`) and unclickable (three real
  mouse clicks timed out). Fixed with `invisible peer-checked:visible` on the
  disclosure; `.shell-user-menu-panel` / `.elevated-shell-user-menu-panel` now
  also subtract the safe-area insets from their viewport bound. Gate:
  `features/shell/layout-gate/user-menu-reachability.spec.ts`, which runs at
  1280x720, **1440x900** (added to `playwright.shell-layout.config.ts` for
  this defect) and 390x844.

- **2026-09-19** — Created with the header right set and the bottom-left user
  block. Deleted: `CanvasPaneHeaderChrome.tsx`, `CanvasReopenChip.tsx`,
  `ElevatedShellUserMenu.tsx` + store, the canvas/elevated menu CSS, the
  `:root[data-canvas-open]` avatar hide, `NotificationsMenuItem.tsx`,
  `MessagesMenuItem.tsx`, `ApprovalsMenuItem.tsx`.
