# FEATURE.md — App shell sidebar

**Status:** `stable`
**Tier:** `1`
**Last updated:** `2026-08-15`

---

## Purpose

The desktop app-shell sidebar renders the global navigation and lets Large Routes replace it with route-owned navigation without building a second shell.

## Entry points

- `Sidebar.tsx` — server-rendered sidebar frame, global navigation, and portal targets.
- `RouteMenuSlot.tsx` — client island that matches a Large Route, loads its menu, and switches between route and global navigation.
- `RouteHeaderSlot.tsx` — optional Large Route replacement for the sidebar brand area.
- `../../constants/route-menu-registry.ts` — ordered route-family registrations.
- `../../constants/route-menu-style.ts` — canonical route-menu row class and icon metrics.
- `../../../../styles/shell.css` — expansion, collapse, animation, mode-control, and collapsed-tooltip behavior.

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

## Invariants & gotchas

- **Register Large Routes only in `route-menu-registry.ts`.** Keep more-specific pathname patterns before broader patterns.
- **Use `route-menu-style.ts` for standard route-menu rows.** The class and 18px/1.75 icon metrics keep route menus aligned with global navigation through collapse.
- **Keep the mode control distinct from navigation rows.** Its bordered glass pill communicates a reversible mode change, not a destination.
- **Never depend on animation events for the view flip.** Hidden pages may not emit them.
- **Do not force every route menu into one row component.** Consumers use different elements, state, groupings, and specialized rows; share the visual contract unless behavior also becomes identical.

## Related features

- Consumers: `features/agents/components/chat/ChatSidebarMenu.tsx`, `features/agents/components/shell/AgentRunSidebarMenu.tsx`, `features/code/shell/CodeSidebarMenu.tsx`, `features/admin/components/AdminRouteSidebarMenu.tsx`, `features/marketing/components/shell/MarketingSidebarMenu.tsx`.
- Mobile counterpart: `../mobile-sheet/MobileRouteMenuSlot.tsx`.

## Doctrine compliance

**Primitives reused**

- Components: `ShellIcon`, Next.js `Link`, and the shared shell nav CSS contract.
- Hooks: `useSidebarExpanded`, `usePathname`.

**Primitives introduced**

- `RouteMenuSlot` and `routeMenuRegistry` are the existing shared Large Route mechanism; this change introduces no parallel component.
- `route-menu-style.ts` names the already-shared visual contract so consumers stop copying literals.

## Change log

- `2026-08-15` — Codex: Preserved mode-switch meaning in the collapsed rail and centralized the route-menu row visual contract.
