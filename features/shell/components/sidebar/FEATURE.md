# FEATURE.md — App shell sidebar

**Status:** `stable`
**Tier:** `1`
**Last updated:** `2026-09-15`

---

## Purpose

The app shell renders one canonical navigation tree across the desktop sidebar and an iOS-style mobile bottom drawer. Large Routes can replace either surface with route-owned navigation without building a second shell. Admin users also receive a persistent Admin Launchpad door.

## Entry points

- `Sidebar.tsx` — server-rendered sidebar frame, global navigation, and portal targets.
- `RouteMenuSlot.tsx` — client island that matches a Large Route, loads its menu, and switches between route and global navigation.
- `RouteHeaderSlot.tsx` — optional Large Route replacement for the sidebar brand area.
- `../../constants/route-menu-registry.ts` — ordered route-family registrations.
- `../../constants/route-menu-style.ts` — canonical route-menu row class and icon metrics.
- `../../../../styles/shell.css` — expansion, collapse, animation, mode-control, and collapsed-tooltip behavior.
- `admin-menu/AdminSidebarSection.tsx` — admin-only footer controls and the direct new-tab Admin Launchpad door.
- `../mobile-sheet/MobileNavigationDrawer.tsx` — solid 92dvh mobile drawer, drill-in stack, Back navigation, and destination search.
- `../mobile-sheet/MobileSideSheet.tsx` — server boundary that filters the canonical nav tree for the viewer before handing it to the drawer.

## Key flows

### Enter a Large Route

1. `RouteMenuSlot` matches the pathname against `routeMenuRegistry`.
2. The registered menu is imported and portaled into `.shell-sidebar-route-nav`.
3. `resolveSidebarView` selects the route menu unless the user made a manual choice for that route family.
4. `animateSwitch` decorates the transition; its fallback timer guarantees the DOM view changes even when animation events do not fire.

### Switch navigation modes

1. The bordered `.shell-sidebar-switch` names the destination: the route menu or `Main Menu`.
2. Activating it records a manual choice scoped to the current route family.
3. Expanded sidebars show the destination inline; collapsed sidebars expose `Switch to …` through the styled rail tooltip and `aria-label`.

### Launch administration work

1. `AdminSidebarSection` hydrates the existing `selectIsAdmin` gate.
2. Admins receive a neutral Admin Launchpad anchor before the Administration cascade and operational toggles. It is a launcher, so it never borrows the selected-route treatment.
3. The anchor opens `/administration/launchpad` in a new tab so the current product workspace is never displaced.

### Navigate on mobile

1. The existing `#shell-mobile-menu` control opens the canonical `BottomSheet` with `surface="solid"` and a fixed 92dvh height.
2. A group label/icon opens its module home; its separate arrow opens one child screen. A sub-area row (an industry, Board › Boards) drills in once more; Back steps up one level without changing routes.
3. Search filters parent and child destinations from the same viewer-filtered `nav-data.ts` tree.
4. Selecting a destination starts navigation, then closes the drawer; route changes also close it through `MobileMenuPathSync`.

## Invariants & gotchas

- **Register Large Routes only in `route-menu-registry.ts`.** Keep more-specific pathname patterns before broader patterns.
- **Use `route-menu-style.ts` for standard route-menu rows.** The class and 18px/1.75 icon metrics keep route menus aligned with global navigation through collapse.
- **Route-menu collapse never swaps trees.** Width changes may hide labels and
  trailing controls, but the same keyed rows and icon nodes stay mounted so
  their spatial positions and any open two-tier groups survive the transition.
- **Keep the mode control distinct from navigation rows.** Its bordered glass pill communicates a reversible mode change, not a destination.
- **Never depend on animation events for the view flip.** Hidden pages may not emit them.
- **Do not force every route menu into one row component.** Consumers use different elements, state, groupings, and specialized rows; share the visual contract unless behavior also becomes identical.
- **Keep Admin Launchpad directly reachable.** It is a real new-tab anchor in the admin-only footer, not another level inside the Administration cascade.
- **Selected means the current route.** Global groups, flyout children, mobile drill-ins, Large Route menus, and alternate module sidebars use the same blue selected treatment and choose the single most-specific route owner (`findOwningNavItem`). A group may claim a route from its own href, its first path segment, or a declared `ownedRoutePrefixes` alias — never from a flyout child that points into another module. When two groups still claim the same path (a placeholder borrowing another module's href), only the most-specific owner lights up. New-tab launchers such as Admin Launchpad stay neutral. A module with a legacy/alternate namespace declares it once through `ownedRoutePrefixes`; consumers must not duplicate pathname heuristics.
- **Phone navigation is a solid bottom drawer.** Tablet widths use the same drawer primitive as a bounded left edge panel, while phones retain the fixed-height bottom drawer. Do not restore glass, inline primary-group accordions, or an adaptive-height panel.
- **Keep one mobile scroll area.** `BottomSheetBody` owns scrolling; drill-in screens and search results flow inside it.
- **Keep iOS interaction minimums.** Rows are at least 48px and the search input is 16px.
- **Every first-party `ShellIcon` name is compile-time registered.** Persisted or external names must pass through `resolveShellIconName`; an invalid value renders `CircleHelp` and emits one structured `shell-navigation` diagnostic.

## Related features

- Consumers: `../aidream/apps/shared/chat/src/agents/components/chat/ChatSidebarMenu.tsx`, `../aidream/apps/shared/chat/src/agents/components/shell/AgentRunSidebarMenu.tsx`, `features/code/shell/CodeSidebarMenu.tsx`, `features/admin/components/AdminRouteSidebarMenu.tsx`, `features/marketing/components/shell/MarketingSidebarMenu.tsx`, `features/research/components/shell/ResearchTopicSidebarMenu.tsx`.
- Mobile route-menu bridge: `../mobile-sheet/MobileRouteMenuSlot.tsx`.

## Doctrine compliance

**Primitives reused**

- Components: `ShellIcon`, Next.js `Link`, and the shared shell nav CSS contract.
- Hooks: `useSidebarExpanded`, `usePathname`, and the existing `useIsMounted` hydration gate.

**Primitives introduced**

- `RouteMenuSlot` and `routeMenuRegistry` are the existing shared Large Route mechanism; this change introduces no parallel component.
- `route-menu-style.ts` names the already-shared visual contract so consumers stop copying literals.

## Change log

- `2026-10-04` — Claude: THE CORRECTED DOMAIN TREE (Arman's rulings, 2026-10-04). Strip: Board (home: dashboard, launchpad, Boards sub-area, War Room) · Projects (beside Board: the two daily-work surfaces) · Agents · Applets · Chat · Workflows · Intelligence (+Reports) · Masterwork · Knowledge (Library icon, +Acquisition) · Web (scraper, search, Connect a Computer) · Content (notes, documents, workbooks, maps, e-sign, text utilities) · Data (record store, Shapes studio, scopes) · Files (cloud drive + PDF) · Media (images, libraries, camera, scanner) · Audio (transcripts, voice playground/tester, voice settings) · Code · Publish (+Print, flattened) · Communications · CRM · Marketing · Human Resources · Integrations · Account · Industries (Commerce gains Product Capture; its landing is Capture Products, the guest-safe page) · Other. Workspace and the Media sub-areas are gone; mixed menus (leaves plus one sub-area) render on desktop and phone. New strip icons `Library`, `Cloud`, `AudioLines` in `shellIconMap.ts`. `nav-no-loss.test.ts` holds the new order, the five stuff-domain owners and unique strip icons; `is-nav-group-active.test.ts` lights each moved family (/files, /notes, /data, /war-room, /transcripts, /images, /board).
- `2026-10-03` — Claude: sidebar review fixes. Industries lights the industry that owns the route (an `ownedRoutePrefixes` entry that is a sub-area's own namespace is never an alias; /commerce/* with no listed row falls to Commerce). `openInNewTab` on children (Launchpad) and `external` open a new tab in the flyout and the phone drawer. Guest view frozen in `nav-no-loss.test.ts` (old guest rows stay visible, old members-only rows stay hidden, a new guest-visible row must be in `GUEST_OK_SINCE_DOMAIN_TREE`); Account and ~45 new members-only rows are `guestHidden`. Phone search applies nav gates (`utils/search-nav.ts`) and typing leaves an area's route view for the full menu. A failed route-menu chunk is captured, falls back to the main menu and offers Retry. ArrowRight focuses into a hover-opened submenu. The default-open chat no longer folds a domain panel (`shellChatDomainPanelAction`); every /user-settings/* lights Account.
- `2026-10-02` — Claude: THREE-LEVEL MENU (Arman's ruling). A nav child may carry its own `children` — a sub-area whose name opens its landing and whose menu opens beside the flyout (hover intent 140ms open / 320ms close, chevron click pins it, ArrowRight opens, Escape/ArrowLeft step back, clamped and flipped to stay on screen, scrolls when long) and as a drill-in on phones (Back steps one level). Industries lists only Education, Legal, Commerce, Medical (`/medical`); Media splits into Files, Images & Video, Audio & Transcripts, PDF & Scanning, Product Capture, Print; Workspace into Home, Docs, Projects, Data, Utilities. Every flat consumer walks nesting through `expandNavChildren`; active state uses `findActiveNavBranch` / leaf `findActiveNavChild`. `nav-no-loss.test.ts` walks all three levels and holds the Industries shape, the 20-row flyout cap and the three-level ceiling.
- `2026-10-02` — Main menu rebuilt on the domain tree: 17 product domains in tree order, then Industries, then a temporary pink "Other" (`tone: "attention"`). Every former entry kept (frozen in `features/shell/__tests__/nav-no-loss.test.ts`), 85 previously unlinked pages added, duplicates merged (one Workflows holds the run catalog and the external studio). Children now carry guest rules through `navItemsForViewer`; a domain owns the routes of its destination children (`is-nav-group-active.ts`); flyouts scroll; the phone dock is its own fixed list.
- `2026-10-05` — Claude: the shell chat no longer stands aside on the Board or Education (their own chat column is gone; each board and Education keep their own conversation inside the shell chat, `shellChatHome`). It stands aside only on /chat and /code.
- `2026-10-02` — Claude: THE CHAT ON EVERY PAGE. `ShellChatDock` (../aidream/apps/shared/chat/src/canvas/workspace) is mounted once by AppShell beside the sidebar; it publishes `--shell-chat-w`, which the grid's first track adds. Open/closed is remembered per page family (cookie `canvas-workspace:page:<family>:chat`, server-read); with no choice it opens at ≥1440px. Header chat button on the left (`ShellChatToggle`) and ⌘\. Stands aside on /chat and canvas-workspace pages (Board, Education). Beside an open chat at 1024–1599px a domain panel folds to the strip. Marketing's own workspace wrap removed.

- `2026-10-01` — Claude: THE DOMAIN PANEL. A route-menu entry with `layout: "panel"` keeps the main menu as the icon strip and puts its own menu beside it on desktop (no flip); the sidebar toggle opens/closes the panel. `.shell-root[data-domain-panel]` (AppShell + NavActiveSync) redefines `--shell-sidebar-w-expanded` as strip + panel so every width rule follows. Pilot: Marketing. Phones keep the drawer flip for now. Same day: the panel runs full height from the top (the sidebar becomes a two-column grid, `.shell-sidebar-nav` is `display: contents`) and opens with `.shell-domain-panel-title`; Marketing is wrapped in `ChatCanvasWorkspace` (`SIGNED_IN_CHAT_WORKSPACE_ROUTES`) so the chat sits beside its menu, as on the Board.

- `2026-09-19` — Cursor: group highlight is ownership-only. A flyout shortcut into another module (AI Work → `/chat/new`) no longer lights the parent beside the real owner; Agents declares `/agent-connections` as its alternate namespace.

- `2026-09-15` — Codex: unified active-route ownership and the blue selected treatment across desktop groups, flyout children, mobile drill-ins, Administration, and alternate module sidebars; added explicit alternate namespaces for Knowledge's `/rag/*` routes; kept the Admin Launchpad launcher neutral.

- `2026-09-11` — Browser verification: removed the desktop checkbox dependency from portaled route-menu styles and the inherited bottom-sheet top margin on tablets; verified visible 48px rows in a 352px-wide panel at 834×1112 with the desktop sidebar expanded.

- `2026-09-11` — Codex: made every global parent label/icon a real module-home link and moved submenu opening to a separate disclosure control; restored portaled route-menu labels and 48px touch rows; tablet navigation now presents as a bounded edge panel rather than a phone-height drawer.

- `2026-09-08` — Codex: made the Administration Large Route consume one
  persistent icon-led tree at both sidebar widths, eliminating mode-specific
  row replacement and collapse-time spatial reordering.
- 2026-08-29 — C9 adoption: `BottomSheet`/`TabbedBottomSheet`, `EditableLabel`, `SegmentedControl`, `ScoreRing`, and `useScrollFade` now import from `@ai-matrx/design-system` 0.2.0 (npm); the local originals under `components/official/` and `components/ui/segmented-control.tsx` are deleted. Behavior identical (verbatim ports; host keeps the glass/pb-safe/matrx-scroll-fade CSS contracts in `app/globals.css`).
- `2026-08-25` — Codex: registered the mobile drawer's `ChevronLeft` Back icon, made `ShellIcon` accept only closed-registry names so first-party omissions fail type-check, and preserved external invalid-icon fallback events as structured `shell-navigation` diagnostics instead of generic console errors.
- `2026-08-24` — Codex: replaced the glass left mobile sheet and inline primary-group accordions with a solid, searchable, fixed-height bottom drawer with drill-in and Back navigation.
- `2026-08-15` — Codex: added the prominent admin-only new-tab Launchpad door to the persistent sidebar footer.
- `2026-08-15` — Codex: Preserved mode-switch meaning in the collapsed rail and centralized the route-menu row visual contract.
