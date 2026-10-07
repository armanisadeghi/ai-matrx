# Shell — the application chrome (sidebar, header, user block, mobile)

**Purpose:** the one frame around every authenticated route (`AppShell`, used
by `(core)` and `(admin)`; the `(dev)` layout mirrors it). Sub-features carry
their own docs: sidebar `components/sidebar/FEATURE.md`, route headers
`components/header/variants/USAGE.md` + the `core-route-headers` skill. This
file holds the two laws that span them.

**Canvas chrome** — a page that hosts `ChatCanvasWorkspace` flips this shell to
`data-shell-chrome="canvas"`: the shell header (by visibility — its chat button stays) and
the phone dock step aside for the page's own header; the SIDEBAR, account rail and THE
CHAT (`ShellChatDock`, the one chat on every page but /chat and /code) stay, and the
sidebar's Chats side opens conversations in it: read
[`../canvas/workspace/FEATURE.md`](../canvas/workspace/FEATURE.md) before touching
`ShellChromeMode`, `canvas-chrome-routes.ts`, `in-place-chat-host.ts` or `shell.css` §13c.

## THE HEADER CONTROL SET (owner, 2026-09-19; re-ruled 2026-09-30)

> *"we need to create a consistent set of things for that top-right section so
> that desktop has a consistent feel and so does mobile. One critical part of
> consistency is never hiding things and only disabling when inactive."*

`components/header/HeaderControlSet.tsx` is the ONE copy, mounted by the shell
`Header` and by the canvas workspace's header (`/board`). Left to right:

```
[ route-injected actions (#shell-header-right) ] [ Search ] [ Intelligence ] [ Canvas ] [ Messages ] [ Notifications ]
```

| Control | File | Inactive state |
|---|---|---|
| Search | `features/knowledge/command-bar/OpenCommandBarButtons.tsx` | Guest → auth gate. |
| Intelligence | `../aidream/apps/shared/chat/src/surfaces/components/chrome/SurfaceAgentsHeaderButton.tsx` | Guest → auth gate. |
| Canvas | `features/canvas/core/CanvasHeaderToggle.tsx` | Never disabled: empty → opens the canvas HOME (`CanvasHomeSheet`: saved items + Board). The 44px slot never unmounts. |
| Messages | `features/messaging/components/shell/MessagesHeaderButton.tsx` | Guest → auth gate. Own unread-conversation count; toggles the Messages canvas tab. |
| Notifications | `features/notifications/components/InboxHeaderButton.tsx` | Guest → auth gate. Never counts DMs. |

Each is a 44px tap target with its spacing built in: **no gap, padding or
margin between or around them** (guard asserts it). Nothing else is built into
the header — a route adds controls through `#shell-header-right`.

**On a phone (below 768px) the five fold into ONE control** —
`components/header/HeaderPhoneOverflow.tsx`, a bottom sheet holding the same
five with the same states. The swap is CSS (`styles/shell.css`), so the
server-rendered row never shifts. Guard: `HeaderPhoneOverflow.test.tsx`.

Rules: a control is never unmounted on state (owner, 2026-09-16: *"causes a
shift in the top header buttons"*). Guards:
`features/shell/__tests__/header-right-set.test.ts` (source),
`features/canvas/__tests__/canvas-header-slot-reserved.test.tsx` (rendered),
`features/shell/layout-gate/canvas-one-presentation.spec.ts` (laid out).

## THE ACCOUNT RAIL — Settings, Organization, You, bottom-left (2026-09-30)

`components/user-block/ShellUserBlock.tsx` ends the sidebar with three
always-visible rows, top to bottom: **Settings** (`account-rail/ShellSettingsMenu`
— Settings page, Preferences, light/dark, Media, Trash), **Organization**
(`account-rail/ShellOrgSwitcher`), **You** (the avatar → `UserMenuPanel`).
Each row is a `.shell-nav-item.shell-nav-stable`, so its icon sits in the nav
rail's icon column (x = 12px) — collapsed = icon, expanded = icon + name.
`--shell-user-block-h` reserves the rail's height on the sidebar column.

- **`ShellOrgSwitcher` is THE organization control of the chrome.** It draws
  the active organization's logo or 2–3 letter abbreviation
  (`organizations/components/OrganizationMark`), asks "Choose organization"
  with a primary ring while boot answered with none, and lights a dot + a
  one-click "Switch to …" when the page's object lives in another of the
  person's organizations (`pageObjectOrganization.ts`). It reads/writes through
  `useActiveOrganizationPicker` → `chooseActiveOrganization` (cookie + sync
  engine unchanged) and opens the canonical `OrganizationPickerPanel`. Variants:
  `rail`, `drawer` (phone navigation drawer), `inline` (a compact row).
  Replaced: the header chip, the avatar menu's Organization group, the canvas
  nav's hand-built drop-up.
- **Mobile:** no rail; the navigation drawer ends in the same three
  (Settings and the organization as drawer rows, then `MobileDrawerUserRow`).
- **The avatar menu** is identity, Intelligence, quick access, feedback,
  admin, copy short link, sign out. Open state is the shell root's
  `#shell-user-menu` checkbox; items sit in `MenuItemCloseLabel`.

## THE FLOATING CLEARANCE — every scrolling page ends clear of what floats (owner, 2026-10-04)

- `FloatingClearanceSync` (mounted once by `AppShell`) measures every visible bottom-anchored element matching `FLOATING_BOTTOM_SELECTOR` (`lib/layout/floating-chrome.ts`: `[data-matrx-floating-bottom]`, `.ambient-assistant-dock`, `.shell-dock`) and publishes `--matrx-floating-measured` on `<html>`; `styles/shell.css` derives `--matrx-floating-clearance` (measured or safe area, + 1.5rem).
- The runway is a final `::after` flow item, by DEFAULT, on `.shell-main` (natural-height routes), a scrolling `h-full` route body directly under it, and any `<main>` / `[data-matrx-page-scroll]` scroll owner. It adds to page spacing; `.scroll-page-end-space` (education's generous runway) is never shorter than it.
- New floating chrome carries `data-matrx-floating-bottom`. A page opts out only with `data-floating-clearance="off"` + `// ui-exception:`. Never hand-write `pb-safe` / big `pb-*` on a page scroller.
- Guards: `useFloatingClearanceGuard` (dev; `[floating-clearance]` console error + dashed outline when content is still in the floating band at scroll end; `window.__matrxFloatingClearanceProbe()` runs it on demand) and `pnpm check:floating-clearance` (`--self-test`).

## PAGE RHYTHM — one spacing scale for page structure, the bottom once (owner, 2026-10-05)

- Tokens on `:root` (`styles/shell.css`), numbers + rules in `lib/layout/page-rhythm.ts`, pinned by `lib/layout/page-rhythm.test.ts`: `--matrx-page-gutter` 12/16px, `--matrx-page-top` 16/24, `--matrx-page-block-gap` 24/32 (between BIG blocks only; control sets keep their dense gaps), `--matrx-page-end` = the gutter (phone / ≥640px).
- The runway is the page end ONCE: `--matrx-floating-clearance` = what floats + page end, and a scroller that takes the runway loses its own bottom padding. A non-scrolling page surface (`data-matrx-page-end`: the `EntityListPage` body) gets no runway; it pads its foot by page end + `--matrx-floating-fixed-measured` (chrome WITHOUT `data-matrx-floating-follows-page`, i.e. not the assists pill that already rests above the pager) — so a pager never sits under the page assistant.
- Guard: the same dev hook screams `[page-rhythm]` (amber outline) when a page ends with more than page end + 4px under its last element; `window.__matrxPageRhythmProbe()` runs it. Walk + screenshots: `scripts/page-rhythm-walk.mjs`.

## PAGE-TOP TEMPLATES — every page top is one of four (owner, 2026-10-05)

A page picks a template; it never hand-builds its top. Named options only — a need a template lacks is added to the template as a named option (`common-docs/policies/one-ui-system.md`).

| Template | Component | For | Options |
|---|---|---|---|
| Marketing | `PublicHeader` + `ModuleLanding` (`features/auth/components/module-landing/`) | signed-out pitch / front door | see `module-landing-pages` skill |
| Module home (list) | `EntityListPage` (`lib/entity-list/`) | "all" pages: lanes, org filter, search, New | see `lib/entity-list/FEATURE.md` |
| Internal record page | `RecordPageHeader` (`components/header/templates/RecordPageHeader.tsx`) | a record or sub-page | `backHref?` (omit on a top-level page), `parents: Crumb[]` (link + sibling menu each), `record: { name, siblings? }`, `status?: { label, tone }`, `modes?`, `activeModeHref?`, `onModeSelect?`, `actions?: { label, icon, href/onPress, primary/destructive/warning, showLabel, newTab, pinnedOnPhone, phoneOnly }[]` |
| Full-bleed | the workspace header (`data-page-header-target="workspace"`, ChatCanvasWorkspace) + glass only on a bar floating over the canvas | canvas, editors | (not yet a single component — open) |

**Internal record page is ONE line**: back chevron, parents, the record as the last crumb, modes centered, actions right. No second line of text, no sentence under it. Phone: back + record name + one `…` (modes and actions). Built on `EntityModeHeader` (its new `trail`), which is built on `RouteHeader` → `PageHeader`. Only `features/shell/components/header/**` may render `<PageHeader>` directly.

**Specimens render the real template.** `<HeaderSpecimen>` (`templates/HeaderSpecimen.tsx`) is a stand-in shell band: inside it `PageHeaderPortal` renders in place and the phone ⋮ host reads as absent (`header-specimen-context.ts`). The system page (`/demos/ui-unification/system`, Navigation) uses it — never a mock.

**Guard:** `pnpm check:page-top` (findings row `page-top`, `--self-test`): `raw-page-header` (a file outside the header module importing `PageHeader`) and `sentence-under-title` (the interface-text `page-description` scanner). Baseline `scripts/page-top/baseline.json` only shrinks (`--shrink`).

## A ROUTE CAN OWN CMD+K / CMD+P (2026-10-05)

Cmd/Ctrl+K opens the shell's global search (`CommandBarHotkey`); a route with its own quick-find claims the key
instead of racing it: `useClaimSearchKeys(["k", "p"], (key, e) => { ...open my palette... })` from
`features/shell/hooks/useClaimSearchKeys.ts`. While the route is mounted the global bar stays closed and the
browser's print dialog (Cmd+P) is suppressed; return `false` from the handler to decline a press (it then falls
through to the global handler). Claims are counted (`searchKeyClaim.ts`), released on unmount. Test:
`features/shell/hooks/__tests__/searchKeyClaim.test.tsx`.

## THE CHAT COLUMN CAN START CLOSED PER ROUTE (2026-10-05)

The shell chat opens by default at >= 1440px. A route whose own layout needs the width is listed in
`SHELL_CHAT_CLOSED_BY_DEFAULT_PAGES` (`../aidream/apps/shared/chat/src/canvas/workspace/shell-chat-route.ts`; `/spaces` is on it):
the chat starts closed, the person opens it by hand (header toggle, Cmd+\), and a remembered choice still wins.

## Change log

- `2026-10-05` — claude: **One chat.** The shell chat (`ShellChatDock`) now shows on the Board, signed-in Education and the canvas demos too — they no longer draw their own chat column; it stands aside only on /chat and /code. The shell header hides by `visibility` in canvas chrome so `ShellChatToggle` stays at its pixel (the canvas header pads for it, `.canvas-workspace-header`); full screen hides the chat button. AppShell reads the chat cookie for the page's HOME (`shellChatHome`: each board, Education, else the family) and stamps `data-shell-chat-available` at SSR. Mechanics: `../aidream/apps/shared/chat/src/canvas/workspace/FEATURE.md`.

- `2026-10-05` — claude: **`RecordPageHeader` has a top-level form.** `backHref` is optional (and on `EntityModeHeader`): omit it on a module-home, queue or inbox page that has no parent and the line is just the name (no back chevron, `parents` empty). A trailing action is a declarative `actions` entry (`primary: true`, `href`), never a free-form slot — `CasesListClient`'s New case moved onto it. A page's `MandateDoorLink` icon variant renders nothing and only registers the door, so it sits beside the header, not inside. ~85 raw `PageHeader` page tops (commerce, CRM, marketing, notifications, boards, maps, reports, HR, dashboard, launchpad…) moved onto the template; `check:page-top` baseline 495 → 433. Still on a raw `PageHeader` and named gaps: `AdminModuleHeader` (admin route-tree crumbs + module menu + injected items), `ScopesRouteHeader` / `ScopeBreadcrumb` (org-level drawer, "see all" links, confirm-delete actions), the header-variant family (`HeaderToggle`, `HeaderTabs`, `StudyDeckHeader`), and header-with-live-control pages (`ShapesListHeader`).
- `2026-10-05` — claude: **Page-top templates.** `RecordPageHeader` (internal record page, ONE line: back + parents + record + modes + actions; named options only), `EntityModeHeader` gains `trail`, `CrumbNode` exported, `HeaderSpecimen` + specimen context so the system page shows the real template (the old mock drew two lines under a back chevron — owner: "busy and sloppy"). Guard `check:page-top` + shrink-only baseline (593 → 583 after wave 1: 10 raw `PageHeader` pages moved onto `RecordPageHeader`).

- `2026-10-04` — claude: **The floating clearance is a shell primitive.** The education-overview sample lost its bottom room and the chat dock sat on its last row; instead of a page fix, `FloatingClearanceSync` + the `::after` runway in `shell.css` give every page scroll owner a live-measured end runway, with a runtime guard and a static check (section above). Tagged floating chrome: assists dock (desktop pill + phone FAB), window tray, `MobileActionBar`, `UnifiedActionBar`.
- `2026-10-04` — claude: **The mobile dock has no reserve of its own.** A `[data-show-dock]` route padded `.shell-main` by the dock height (86px) and the floating runway (which measures `.shell-dock`) stacked on top: 222px of blank at 375px on /user-settings and /research. The per-route reservation is deleted; the floating clearance is the only source. Guard: `styles/__tests__/no-overlay-layout-reservation.test.ts`.
- `2026-10-05` — claude: **`MobilePanelShell` drawers are ONE sheet.** Picker and opened panel used to be two sibling `BottomSheet`s; tapping a panel closed the picker and opened the panel in the same tap, the closing sheet returned focus outside the new one, and the new one dismissed itself — so phone "Panels → X" showed nothing on every drawer route (found on `/transcripts/studio`). Now one sheet swaps picker ↔ panel content. A route with exactly one panel skips the picker: the trigger is named and drawn as that panel (e.g. "Sessions") unless the route passed `menuLabel`/`menuIcon`. Verified in the browser at 375px: ⋮ → Sessions → session list → pick opens the session.
- `2026-10-03` — claude: **The header is not glass; the shell owns the top boundary once** (owner ruling, 2026-10-03; reverses the direction of the 2026-10-02 "all glass" entry below and the same-day `EntityModeHeader` capsule). The header band is solid (`.shell-header::before`, now exactly the header's box — the 1rem fade tail it used to paint is gone), so by "glass only floats" every header control is `variant="transparent"`: the five-icon set (Search, Agents, Canvas, Messages, Notifications), hamburger, chat toggle, phone ⋮ trigger, `RouteHeader`'s overflow `…`, `MobilePanelShell`'s trigger, and the `CrumbTrailHeader` / `EntityModeHeader` back + trail/name (no glass capsule; the trail keeps its own 3px half-gap, `ps-[3px]`). No border under the header. The ONE boundary is `<div class="shell-header-fade">` rendered by `Header.tsx`: 8px (`--shell-header-fade-h: 0.5rem`) background→transparent, absolute at `top:100%`, pointer-events off, zero layout space — so `--shell-header-clearance` is now just `--shell-header-h`. Guard: `__tests__/header-top-boundary.test.ts` (6/8 red against the previous files, the other two red on planted `border-b` / `box-shadow`); the "is ALL GLASS" case in `header-right-set.test.ts` is removed. `RouteModeNav`'s track is now `bg-muted` (was a glass capsule), matching /chat's mode switch. Not changed yet: route-injected header buttons that still take the glass default (~370 files inject header content; a separate sweep).

- `2026-10-03` — claude: **`EntityModeHeader`: back and name in one glass capsule.** The template drew a glass back button beside a bare name, which the tap-target guard flags (placement rule 2: all glass or none) on every one of its ~50 consumers (`/artifacts/<id>` included). Back is now the group variant inside one `data-matrx-glass` capsule with the name (the `CrumbTrailHeader` shape).
- `2026-10-03` — claude: **A title never yields to a nav that cannot draw.** `RouteHeader` capped the title to leave the center nav its smallest trigger, clamped at the title floor — so when even a floored title left too little for the trigger, the center drew nothing and the title still sat at its floor (`/war-room/<id>` beside a 360px canvas: "Acme…" at 42px beside a blank 56px gap). `titleMaxWidth` returns no cap in that case. Test: `components/header/__tests__/title-max-width.test.ts` (red on the old clamp).
- `2026-10-03` — claude: **The header answers the MAIN COLUMN, not the window.** With the canvas open the header spans only the main column (1440px window + 640px canvas → ~516px header), but the header's responsive choices read the viewport, so `/chat/<id>` drew its Chat · Work · Advanced switch over Records / Attached / the page menu (seven overlapping pairs, OVERDRAWN logged). Four shared pieces: (1) `.shell-header-center` is a size container (`container: shell-header / inline-size`) — a route header splits by `@min-[…]/shell-header:`, never `lg:` (`AgentHeader` moved, 44rem); (2) `HeaderCrowdingGuard` gained a fold stage: when the route is left < 240px, or compacting words was not enough, the header sets `data-header-folded` and the right set folds into the one ⋮ exactly as on a phone; (3) `useCenterControlFit` — the measured form for any control in RouteHeader's center (centered slot → in-flow → nothing), which `ComposerModeSwitch` now uses instead of `sm:`; (4) last resort: `data-header-overdrawn` makes the route's row scroll under its own clip instead of painting under the right set. `ChatRunHeader` moved onto `RouteHeader` so its actions fold into "…". Guards: `layout-gate/header-never-overdraws-route-controls.spec.ts` (canvas-width cases, red without the guard), `components/header/__tests__/center-control-fit.test.ts`.

- `2026-10-02` — **The shell header is all glass, row by row** (tap-target placement rules, owner 2026-10-02). Measured: `.shell-header` is `position: sticky` and `.shell-main` is pulled up under it (`margin-top: -var(--shell-header-h)`), so the page scrolls behind the bar — a floating bar by the rule's own definition (the opaque `::before` band is the legibility scrim, not a solid bar). So every row in it is glass: `CrumbTrailHeader` puts the back button (group variant, 28px pill in a 32px box) and the trail in ONE glass capsule (`data-matrx-glass`), trail inset `ps-1` so pill-to-text is one 6px gap, end inset `pe-2` to match the glyph's start inset; `HeaderControlSet` passes `<CanvasToggle variant="glass" />` (`@ai-matrx/canvas` 0.2.2 added the prop; it defaults to transparent). Before: a glass back circle beside bare text 3px from its pill, and a plain canvas icon among four glass ones. Guard: `__tests__/header-right-set.test.ts` "is ALL GLASS" (red against the old set). Design-system 0.53.2 teaches the dev guard that a badge host around one glass button is glass.

- `2026-10-01` — claude (phone run PB-08 #2): **The app follows the device until the person picks a theme; the account rail is the top of the phone menu.** Settings → Theme is Light | Dark | Device (`ShellSettingsMenu` `ThemeRow`, 44px segments on a phone; Device = `theme.mode: "system"`, now the slice default — see `lib/sync/FEATURE.md`). The phone drawer renders the person, organization and Settings rows ABOVE the route menu (`renderAccountRail`), no longer below every admin section. Focus no longer stays inside an aria-hidden tree: the drawer blurs the `#shell-mobile-menu` checkbox on open and the Settings row blurs itself before its nested sheet. Guards: `mobile-sheet/MobileNavigationDrawer.account-row.test.ts`, `styles/themes/__tests__/themeSlice.followsDevice.test.ts`.

- `2026-10-01` — **One menu family; organization favorites.** Settings, Organization and the account menu share one panel (`USER_MENU_PANEL_CLASS`, 288px), one header (`account-rail/RailMenuHeader`: a 28px coloured mark, title, subtitle, a door to its page) and one row (`MENU_ITEM_CLASS`). The organization picker (`@ai-matrx/design-system` 0.50.0) drops "Keep it at the top" and "Working in …": the active row is highlighted, every row has a favorite star (`useOrganizationFavorites` → `public.ues_set`/`ues_list`, entity_type `organization`; the old single star carries over once), and marks are coloured (`OrganizationMark` / `organizationColor`, also used for the person's initial — `user-block/RailUserAvatar`).

- `2026-09-30` — **One sidebar on canvas pages.** /board, /education (signed in) and the canvas demos show the shell sidebar + account rail instead of their own canvas nav (deleted with `CanvasUserRow` and its cookie). Route-menu entries take `defaultView` (`routeMenuDefaultView`, honoured by the desktop slot, the phone drawer and SSR); the canvas-workspace entry is the same `ChatSidebarMenu` with `defaultView: "main"`, hosted in the page's chat panel via `in-place-chat-host`. Guards: `route-menu-slot.test.ts`.

- `2026-09-30` — **The account rail + the header control set** (owner ruling): Settings, Organization and You are the sidebar's three bottom slots, aligned to the nav's icon column (the avatar was 32px and centred 4px left of it; footer icons were 2px right). `ShellOrgSwitcher` is the one org control; `HeaderChooseOrgButton`, `UserMenuOrgSection`, `CanvasOrgDropUp`, `ThemeToggleMenuItem` and the unused `GuestUserMenuPanel` family are deleted. Theme/Media/Preferences moved from the avatar menu into the Settings slot. The header is `HeaderControlSet` (Search, Intelligence, Canvas, Messages, Notifications), shared by the shell header and `/board`; Messages split from Notifications with its own count; Canvas is never disabled (empty opens `CanvasHomeSheet`). The scope tree's organization read now carries `logo_url`.

- `2026-09-27` — **A menu is never the phone primary**: keeping the last action in the row (c397bcf4a7) put a page's own "…" / record menu beside the shell's ⋮ — two overflow buttons. Below 768px `RouteHeader` now sends every MENU action to the ⋮ sheet and keeps the last NON-menu action as the primary (none when every action is a menu). Menus are known by what they declare, never DOM text — `isMenuAction` in `components/header/route-header-layout.tsx`: identity (`DropdownMenu`, `MoreHorizontalTapButton`), an overflow `icon` (lucide `Ellipsis` / `EllipsisVertical`, i.e. `MoreHorizontal` / `MoreVertical`), a single-child host wrapper around one of those, or the `routeHeaderMenu = true` static (`ItemMenu` carries it; a page's own menu component declares it the same way). Desktop is unchanged. Guard: `route-header-phone-actions.test.tsx` "a menu is never the primary" (3 of 3 red against c397bcf4a7).

- `2026-09-27` — **A page's primary action never leaves the phone header row**: below 768px `RouteHeader` moves only the SECONDARY actions into the ⋮ sheet (`phone-page-actions.ts`); the primary (last, per the RouteHeader contract) stays in the row, icon-only when it is a labelled tap button (caption kept as accessible name + tooltip). Fixes a93cd8029e burying "Submit all" (/agents/battle) and "New meeting" (/meetings) in the sheet. Guard: `components/header/route-header-phone-actions.test.tsx` (3 of 6 red against a93cd8029e).

- `2026-09-27` — **No nav item sits under the account block**: the `--shell-user-block-h` reservation moved from `.shell-sidebar-footer` (hidden on the settings route, so /user-settings' last item sat under the avatar) to the `.shell-sidebar` column at desktop widths. Landed in sweep commit `591d465ff0`. Guard: `__tests__/sidebar-reserves-the-account-block.test.ts` (2 of 2 red against the old CSS).

- **2026-09-27** — Chat beside a page is the canvas workspace (`../aidream/apps/shared/chat/src/canvas/workspace/`), not a shell column: the short-lived right-side chat dock and its header control were removed (Arman). Signed-in `/education` renders in canvas chrome (`SIGNED_IN_CANVAS_CHROME_ROUTES`, `data-signed-in`).
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
  1280x720, **1440x900** (added to `config/playwright/playwright.shell-layout.config.ts` for
  this defect) and 390x844.

- **2026-09-19** — Created with the header right set and the bottom-left user
  block. Deleted: `CanvasPaneHeaderChrome.tsx`, `CanvasReopenChip.tsx`,
  `ElevatedShellUserMenu.tsx` + store, the canvas/elevated menu CSS, the
  `:root[data-canvas-open]` avatar hide, `NotificationsMenuItem.tsx`,
  `MessagesMenuItem.tsx`, `ApprovalsMenuItem.tsx`.

- **2026-10-07** — The header ghost's clone no longer carries
  `data-page-header-portal` (it wears `data-page-header-ghost-portal`; the
  fallback-hide rule in `styles/shell.css` covers both). A page had two
  `[data-page-header-portal]` nodes from first paint to hydration (~1-2s) — the
  real one plus the ghost's clone. Guard: `page-header-ssr.test.tsx` counts one.
