# react-resizable-panels v4 — collapse and toggle

## Contents

- §4 — Show/hide a panel that remembers its prior size (a lone collapsible, button in the same component)
- Cross-portal panel control via `<PanelControlProvider>` — and why it uses `setLayout`, NOT `panel.collapse()`
- Plumbing — what the page provides (`initialLayouts`, `registerAs` = Panel `id`)
- Drag-to-collapse, the server paint, and the warn-announced fallbacks

## §4 — Show/hide a panel that remembers its prior size

**A lone collapsible whose button lives in the same component:** the library handles size memory automatically. Do NOT add `useState` to track the previous width. Do NOT add a `useRef` to capture it before collapse. The library stores it in the panel's internal `expandToSize` and `expand()` reads it back.

```tsx
"use client";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";

export function ToggleSidebar() {
  const sidebarRef = usePanelRef();

  const toggle = () => {
    const panel = sidebarRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  };

  return (
    <>
      <button onClick={toggle}>Toggle</button>
      <Group id="root">
        <Panel
          id="sidebar"
          panelRef={sidebarRef}
          collapsible
          collapsedSize="0%"
          defaultSize="240px"
          minSize="180px"
        >
          <Sidebar />
        </Panel>
        <Separator />
        <Panel id="main"><Main /></Panel>
      </Group>
    </>
  );
}
```

That's the entire pattern. No state, no effects, no refs to capture sizes. The library does it.

**The button is rendered far away (a toolbar in another subtree, a `<PageHeader>` portal), or the group has two or more collapsibles** → never a Redux boolean + effect driving `panelRef.collapse()/.expand()`. Use `<PanelControlProvider>` + `<RegisteredPanel>` (next section, SKILL.md pitfall #26). The provider holds the collapsed boolean; the library still owns the size. Don't put the size in Redux — that's drift waiting to happen.

**If you need a toggle button whose icon flips when the panel is collapsed (whether by click OR by drag-to-collapse), mirror only the BOOLEAN in `useState` and update it inside `onResize`:**

```tsx
const [collapsed, setCollapsed] = useState(false);

const trackCollapse: OnPanelResize = (next, _id, prev) => {
  if (prev === undefined) return;             // first mount — skip
  const wasCollapsed = prev.asPercentage === 0;
  const isCollapsed = next.asPercentage === 0;
  if (wasCollapsed !== isCollapsed) setCollapsed(isCollapsed);
};

<Panel
  id="sidebar"
  panelRef={sidebarRef}
  collapsible
  collapsedSize="0%"
  defaultSize="20%"
  minSize="5%"
  onResize={trackCollapse}
/>
```

The `useState` here tracks **intent** (open/closed boolean) — NOT size. Size still lives in the library. This is the only legitimate `useState` you should add for a panel. `<RegisteredPanel>` already does this for you.

---

### Cross-portal panel control via `<PanelControlProvider>` — and why it uses `setLayout`, NOT `panel.collapse()`

The header is portaled into a different DOM subtree than the panels. **React Context propagates through portals along the React tree, NOT the DOM tree** — so a Provider above both `<PageHeader>` and the page body bridges the two sides.

#### The `panel.collapse()` / `panel.expand()` pivot trap (REAL bug, verified in v4 source)

`getImperativePanelMethods.ts` implements `collapse`/`expand`/`resize` via `setPanelSize`, which uses **`pivotIndices: isLastPanel ? [index-1, index] : [index, index+1]`**. The freed/required space is redistributed via the IMMEDIATE adjacent panel.

**This breaks adjacent collapsibles:**

```
Layout: ... | chat (open) | chat-history (open) |
              ──────────── ─────────────────────
                index n-1     index n (last)

User collapses chat-history → pivot [n-1, n] → freed 14% goes to chat.
If chat is currently at 0% (already collapsed), it RE-EXPANDS to 14%.
The user collapsed one and the other came back.
```

The same trap exists for any two adjacent collapsibles in the middle of a group: collapsing one pushes its space into the immediate neighbor.

#### The fix: `groupRef.setLayout()` for whole-group updates

`setLayout(layout: { [panelId: string]: number })` sets every panel's size at once and bypasses the pivot. Other already-collapsed panels stay collapsed because we explicitly pass `0` for them. **A layout that does not sum to what the group sums to is normalized** — every column moves and the reopened one comes back short (16% → 13.79%) — so the layout handed to it must already sum correctly.

[`features/resizable-panels/PanelControlProvider.tsx`](../../../features/resizable-panels/PanelControlProvider.tsx) implements this (mechanics: [`features/resizable-panels/FEATURE.md`](../../../features/resizable-panels/FEATURE.md)):
- Each `<RegisteredPanel>` calls `registerPanel(panelId, groupKey, elementRef, { defaultSize, minSize })` — its element (to measure the group) and its RAW size props, converted to % only at toggle time by the library's unit rules (a bare number is px). On every `onResize` it calls `notifyResize`, which mirrors **only the collapsed boolean**.
- Each `<ClientGroup groupKey="...">` registers its `groupRef` (via `useGroupRef`) so the provider has `setLayout` access for that group, and reports every **settled** layout (`onLayoutChanged`: pointer-up, keyboard, imperative, mount) to `notifyLayoutChanged` — the only source of each panel's remembered open size.
- `toggle(panelId)` reads `groupRef.getLayout()`. Collapse: remember the current size, target 0. Reopen: target the remembered settled size. It builds a layout with the panel at exactly the target that still sums to the group's total — the difference is taken from (or given to) the open non-toggleable filler first (`main`, `editor`), then, if the library clamped the filler back to its `minSize`, from the other open toggleable panels — and calls `groupRef.setLayout(layout)`. Collapsed panels are never touched.
- **The collapsed flag comes from the layout `setLayout` returned (applied)**, never from what `toggle()` intended — the library snaps a restore below half of `minSize` shut.

#### Plumbing — what the page provides

```tsx
const defaultLayout = await readLayoutCookie(COOKIE_NAME); // server page

<PanelControlProvider initialLayouts={[defaultLayout]}>
  <PageHeader><MyHeaderControls /></PageHeader>
  <div className="h-full overflow-hidden">
    <ClientGroup id="my-page-root" groupKey="root" cookieName={COOKIE_NAME} defaultLayout={defaultLayout}>
      <RegisteredPanel registerAs="sidebar" groupKey="root" id="sidebar" collapsible collapsedSize="0%" defaultSize="20%" minSize="5%">
        <ServerSidebar />
      </RegisteredPanel>
      <Handle hideWhenCollapsed={["sidebar"]} />
      <Panel id="main">…</Panel>
      <Handle hideWhenCollapsed={["inspector"]} />
      <RegisteredPanel registerAs="inspector" groupKey="root" id="inspector" collapsible collapsedSize="0%" defaultSize="20%" minSize="5%">
        <ServerInspector />
      </RegisteredPanel>
    </ClientGroup>
  </div>
</PanelControlProvider>
```

- **`registerAs` must equal the Panel `id`.** `toggle()` addresses the group layout by it; a mismatch warns and does nothing.
- **`initialLayouts` gets every layout cookie the page read** (one entry per group: `[rootLayout, mainLayout]`). It seeds which panels are collapsed, so the server paint already shows the right toggle icon and no Handle beside a collapsed panel. Without it a collapsed panel paints its "hide" icon and a draggable Handle until hydration.
- Header controls call `usePanelControls()` → `toggle(name)`, `isCollapsed(name)`. Worked consumer: [`app/(core)/tasks/page.tsx`](../../../app/(core)/tasks/page.tsx) + [`features/tasks/components/TasksDesktopShell.tsx`](../../../features/tasks/components/TasksDesktopShell.tsx).

For nested groups (a vertical group inside a panel of an outer horizontal group), pass a different `groupKey` — toggleable panels in each group register against their own group's ref. Panels with no toggle don't register.

#### Drag-to-collapse still works

`<RegisteredPanel>` listens to `onResize` and calls `notifyResize` — when the user drags a panel below `minSize` and the lib auto-collapses it, the boolean intent flips to `true` and the toggle button icon updates accordingly. No effect-loop because `notifyResize` short-circuits when state is unchanged. **`notifyResize` never records an open size:** `onResize` fires on every frame of a live drag, and a drag-to-collapse passes through slivers on its way to the snap — capturing those reopens the panel as a sliver. The pre-drag width was already recorded by the last settled `onLayoutChanged`, so the header click reopens at it.

#### The server paint of a saved-collapsed panel

The library's server render treats a saved size of `0` as missing: `getPanelStyles` returns a flex-grow only for a truthy layout entry, so the panel falls back to `flexBasis: defaultSize` (verified in `node_modules/react-resizable-panels`, 4.12.4). A cookie-collapsed column therefore paints at `defaultSize` and snaps to 0 when the group mounts on the client. The repo's mitigation is `initialLayouts` — the icon and the hidden Handle are correct on the server paint (`features/resizable-panels/__tests__/PanelControlProvider.ssr.test.tsx`); the column width itself is corrected at hydration.

#### The warn-announced fallbacks

Every fallback in the provider `console.warn`s with `[resizable-panels]` and the panel name — read the console before debugging a toggle:
- **Reopen at `defaultSize`** — the panel mounted collapsed and has not been open this session; its width from before the page loaded is not remembered.
- **Reopen at `minSize`** — no remembered width and no usable `defaultSize`; or the remembered width is below `minSize` at the current group size (the library would snap it shut).
- **Cannot reopen** — neither `defaultSize` nor `minSize` resolves to a size. Give the `<RegisteredPanel>` a `defaultSize`.
- **Library clamp** — the applied size differs from the target by more than 0.1% (the other panels' constraints left no room).
- **Toggle did nothing** — no `<RegisteredPanel registerAs>` mounted, no `<ClientGroup groupKey>` mounted, or the group has no laid-out panel with that id (group hidden or zero-size, or Panel `id` ≠ `registerAs`).
