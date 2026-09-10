# react-resizable-panels v4 — collapse and toggle

## Contents

- §4 — Show/hide a panel that remembers its prior size
- Cross-portal panel control via `<PanelControlProvider>` — and why it uses `setLayout`, NOT `panel.collapse()`

## §4 — Show/hide a panel that remembers its prior size

**The library handles size memory automatically.** Do NOT add `useState` to track the previous width. Do NOT add a `useRef` to capture it before collapse. The library stores it in the panel's internal `expandToSize` and `expand()` reads it back.

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

If you need the toggle from a button **rendered far away** (toolbar in a different subtree), put the boolean in Redux and use one effect to drive the panel:

```tsx
"use client";
import { useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";

function SidebarPanel() {
  const sidebarRef = usePanelRef();
  const isOpen = useAppSelector((s) => s.layout.sidebarOpen);

  useEffect(() => {
    const panel = sidebarRef.current;
    if (!panel) return;
    if (isOpen && panel.isCollapsed()) panel.expand();
    if (!isOpen && !panel.isCollapsed()) panel.collapse();
  }, [isOpen]);

  return <Panel id="sidebar" panelRef={sidebarRef} collapsible collapsedSize="0%" defaultSize="240px" />;
}
```

The Redux value is the "intent." The library still owns the size. Don't put the size in Redux — that's drift waiting to happen.

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

The `useState` here tracks **intent** (open/closed boolean) — NOT size. Size still lives in the library. This is the only legitimate `useState` you should add for a panel.

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

`setLayout(layout: { [panelId: string]: number })` sets every panel's size at once and bypasses the pivot. Other already-collapsed panels stay collapsed because we explicitly pass `0` for them.

[`_lib/PanelControlProvider.tsx`](../../../app/(dev)/demos/resizables/_lib/PanelControlProvider.tsx) implements this:
- Each `<RegisteredPanel>` calls `registerPanel(panelId, groupKey, panelRef, defaultSizePercent)` and reports its size to `notifyResize` on every `onResize`. The provider keeps a fresh `lastOpenSize` per panel.
- Each `<ClientGroup groupKey="...">` registers its `groupRef` (via `useGroupRef`) so the provider has setLayout access for that group.
- `toggle(panelId)` reads `groupRef.getLayout()`, modifies ONLY the toggled panel's size in the layout map (0 to collapse, `lastOpenSize` to expand), and calls `groupRef.setLayout(newLayout)`. All other panels keep their current sizes; the lib normalizes the sum, so the delta is absorbed by panels with room (typically the non-collapsible "filler" like `main` or `editor`).

#### Plumbing — what the page provides

```tsx
<PanelControlProvider>
  <PageHeader><MyHeaderControls /></PageHeader>
  <div className="h-full overflow-hidden">
    <ClientGroup id="my-page-root" groupKey="root" cookieName={...}>
      <RegisteredPanel registerAs="sidebar" groupKey="root" id="sidebar" collapsible defaultSize="20%" minSize="5%">
        <ServerSidebar />
      </RegisteredPanel>
      <Handle />
      <Panel id="main">…</Panel>
      <Handle />
      <RegisteredPanel registerAs="inspector" groupKey="root" id="inspector" collapsible defaultSize="20%" minSize="5%">
        <ServerInspector />
      </RegisteredPanel>
    </ClientGroup>
  </div>
</PanelControlProvider>
```

For nested groups (a vertical group inside a panel of an outer horizontal group), pass a different `groupKey` — toggleable panels in each group register against their own group's ref. Panels with no toggle don't register.

#### Drag-to-collapse still works

`<RegisteredPanel>` listens to `onResize` and calls `notifyResize` — when the user drags a panel below `minSize` and the lib auto-collapses it, the boolean intent flips to `true` and the toggle button icon updates accordingly. No effect-loop because `notifyResize` short-circuits when state is unchanged.
