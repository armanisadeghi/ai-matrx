# FEATURE.md — `resizable-panels`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-10`

---

## Purpose

The shared split-pane kit on top of `react-resizable-panels` v4: cookie-persisted groups plus header toggles (in `<PageHeader>`, a different subtree) that collapse and reopen panels. Every resizable `(core)` shell uses it. Library rules: **invoke the `react-resizable-panels-v4` skill.**

---

## Entry points

- `ClientGroup.tsx` — `<Group>` wrapper; writes the `panels:*` cookie on `onLayoutChanged`; with `groupKey` it registers its `groupRef` and reports every settled layout to the provider.
- `RegisteredPanel.tsx` — `<Panel>` wrapper; registers its element and RAW `defaultSize`/`minSize`, mirrors the collapsed boolean from `onResize`. **`registerAs` must equal the Panel `id`.**
- `PanelControlProvider.tsx` — `usePanelControls()` → `toggle(name)`, `isCollapsed(name)`; `initialLayouts` seeds collapsed state from the server-read cookie(s).
- `Handle.tsx` — themed `<Separator>`; `hideWhenCollapsed` returns null beside a collapsed panel.
- `readLayoutCookie.ts` — server-only cookie read (`readLayoutCookie`, `readJsonCookie`).

**Consumers:** `/tasks` (`features/tasks/components/TasksDesktopShell.tsx`), `/user-settings` (`features/settings/route-shell/SettingsRouteShell.tsx`), `/agent-connections` (`features/agent-connections/components/AgentConnectionsRouteShell.tsx`), `/agents/[id]/surfaces` + admin twin (`features/surfaces/admin/SurfacesAdminShell.tsx`), `ClientGroup`-only: content plan, vision interview; demos `app/(dev)/demos/resizables/02–05`.

---

## Key flows

**Header toggle.** `toggle(name)` → `groupRef.getLayout()` → collapse: remember the current size, target 0; reopen: target = remembered size → `layoutWithPanelAt` sets the panel to exactly the target and takes the difference from the open non-toggleable filler, then (if the library clamped the filler back to its minSize) from the other open toggleable panels → `groupRef.setLayout()` → collapsed flag = the **applied** size is 0.

**Drag-collapse, then reopen.** Pointer-up fires `onLayoutChanged` → `ClientGroup` → `notifyLayoutChanged` records each open panel's settled size → the drag snaps the panel to 0 (the settled pre-drag width is kept) → `onResize` flips the icon → header click reopens at the pre-drag width.

**Server paint.** The page reads the cookie → passes it as `defaultLayout` to the group AND `initialLayouts={[defaultLayout]}` to the provider → a 0% panel paints its "show" icon and no Handle on the server; hydration matches.

---

## Invariants & gotchas

- **Never let `setLayout` normalize.** A layout that does not sum to 100 is rescaled: every column moves and the reopened one comes back short (16% → 13.79%).
- **The collapsed flag comes from the layout `setLayout` returned**, never from what `toggle()` intended — the library snaps a restore below half of `minSize` shut.
- **Never capture an open size from `onResize`.** A drag-to-collapse passes through slivers; only settled `onLayoutChanged` values (and the layout at a toggle-collapse) are remembered.
- **Size props convert at toggle time by the library's unit rules** — a bare number is **px**, `"30"` is %. The group size is the sum of its `[data-panel]` pixels.
- **Every fallback warns naming the panel:** reopening at `defaultSize` (panel mounted collapsed), at `minSize` (remembered width too small now), a library clamp, a toggle with no mounted panel/group/layout entry.
- **A page that reads a layout cookie passes it to `initialLayouts`** — otherwise a collapsed panel paints open with a draggable Handle until hydration.
- **Adjacent collapsibles use `setLayout`, never `panel.collapse()`** — the library's pivot re-opens the neighbour.

---

## Tests

`pnpm test features/resizable-panels` — the real library in jsdom with geometry only stood in (`__tests__/panelGeometry.ts`: flex model, `ResizeObserver`, pointer drags through the library's own handlers); `.ssr.test.tsx` renders the server paint under `@jest-environment node`.

---

## Related features

- Depended on by: `features/tasks`, `features/settings/route-shell`, `features/agent-connections`, `features/surfaces/admin`, `features/marketing/content-plan`, `features/vision-interview`
- Cross-links: `features/shell/components/header/PageHeader.tsx` (the portal the toggles live in)

---

## Change log

- `2026-09-10` — Claude (standard lane): toggle builds a sum-preserving layout (filler first, then other toggleables), flags collapsed from the applied layout, converts px/rem/bare-number sizes with the library's rules, remembers open sizes only from settled `onLayoutChanged`, seeds collapsed state from the cookie via `initialLayouts` (all cookie-reading consumers updated), warns on every fallback; forcing tests added.
- `2026-07-28` — moved from `app/(dev)/demos/resizables/_lib/` to `features/resizable-panels/`.
