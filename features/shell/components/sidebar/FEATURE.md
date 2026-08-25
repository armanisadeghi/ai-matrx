# FEATURE.md — App shell sidebar

**Status:** `stable`
**Tier:** `1`
**Last updated:** `2026-08-25`

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
2. Admins receive a visually distinct Admin Launchpad anchor before the Administration cascade and operational toggles.
3. The anchor opens `/administration/launchpad` in a new tab so the current product workspace is never displaced.

### Navigate on mobile

1. The existing `#shell-mobile-menu` control opens the canonical `BottomSheet` with `surface="solid"` and a fixed 92dvh height.
2. A top-level group opens one child screen; Back returns to the root without changing routes.
3. Search filters parent and child destinations from the same viewer-filtered `nav-data.ts` tree.
4. Selecting a destination starts navigation, then closes the drawer; route changes also close it through `MobileMenuPathSync`.

## Invariants & gotchas

- **Register Large Routes only in `route-menu-registry.ts`.** Keep more-specific pathname patterns before broader patterns.
- **Use `route-menu-style.ts` for standard route-menu rows.** The class and 18px/1.75 icon metrics keep route menus aligned with global navigation through collapse.
- **Keep the mode control distinct from navigation rows.** Its bordered glass pill communicates a reversible mode change, not a destination.
- **Never depend on animation events for the view flip.** Hidden pages may not emit them.
- **Do not force every route menu into one row component.** Consumers use different elements, state, groupings, and specialized rows; share the visual contract unless behavior also becomes identical.
- **Keep Admin Launchpad directly reachable.** It is a real new-tab anchor in the admin-only footer, not another level inside the Administration cascade.
- **Mobile navigation is a solid bottom drawer.** Do not restore glass, a left sheet, inline primary-group accordions, or an adaptive-height panel.
- **Keep one mobile scroll area.** `BottomSheetBody` owns scrolling; drill-in screens and search results flow inside it.
- **Keep iOS interaction minimums.** Rows are at least 48px and the search input is 16px.
- **Every first-party `ShellIcon` name is compile-time registered.** Persisted or external names must pass through `resolveShellIconName`; an invalid value renders `CircleHelp` and emits one structured `shell-navigation` diagnostic.

## Related features

- Consumers: `features/agents/components/chat/ChatSidebarMenu.tsx`, `features/agents/components/shell/AgentRunSidebarMenu.tsx`, `features/code/shell/CodeSidebarMenu.tsx`, `features/admin/components/AdminRouteSidebarMenu.tsx`, `features/marketing/components/shell/MarketingSidebarMenu.tsx`.
- Mobile route-menu bridge: `../mobile-sheet/MobileRouteMenuSlot.tsx`.

## Doctrine compliance

**Primitives reused**

- Components: `ShellIcon`, Next.js `Link`, and the shared shell nav CSS contract.
- Hooks: `useSidebarExpanded`, `usePathname`, and the existing `useIsMounted` hydration gate.

**Primitives introduced**

- `RouteMenuSlot` and `routeMenuRegistry` are the existing shared Large Route mechanism; this change introduces no parallel component.
- `route-menu-style.ts` names the already-shared visual contract so consumers stop copying literals.

## Change log

- `2026-08-25` — Codex: registered the mobile drawer's `ChevronLeft` Back icon, made `ShellIcon` accept only closed-registry names so first-party omissions fail type-check, and preserved external invalid-icon fallback events as structured `shell-navigation` diagnostics instead of generic console errors.
- `2026-08-24` — Codex: replaced the glass left mobile sheet and inline primary-group accordions with a solid, searchable, fixed-height bottom drawer with drill-in and Back navigation.
- `2026-08-15` — Codex: added the prominent admin-only new-tab Launchpad door to the persistent sidebar footer.
- `2026-08-15` — Codex: Preserved mode-switch meaning in the collapsed rail and centralized the route-menu row visual contract.
