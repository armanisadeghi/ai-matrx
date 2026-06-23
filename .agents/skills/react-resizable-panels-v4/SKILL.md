---
name: react-resizable-panels-v4
description: Single source of truth for `react-resizable-panels` v4 in this Next.js 16 SSR-heavy codebase. Use whenever you import from `react-resizable-panels`, edit `components/ui/resizable*`, work on `features/code/layout/`, build a split-pane layout, sidebar, code-editor shell, multi-pane app, or anything mentioning "resizable", "panel group", "split", "sidebar", or "drag handle". Covers the v3→v4 rename trap, the official Next.js cookie SSR pattern, programmatic show/hide that snaps back to prior size, and what NOT to add (no `useState` for sizes, no extra refs, no useEffects to read sizes).
---

# react-resizable-panels v4 — the only thing you need to read

> **Library version:** `4.10.x` (latest stable as of 2026-04). The package in `package.json` resolves here.
> **Demo routes that prove every pattern in this skill:** `/demos/resizables/*` (index at `app/(dev)/demos/resizables/page.tsx`).
> **Repo wrappers (already styled to the theme):** [`components/ui/resizable.tsx`](../../../components/ui/resizable.tsx), [`components/ui/matrx/resizable.tsx`](../../../components/ui/matrx/resizable.tsx).

---

## STOP. Read this before writing any code.

### v4 is a rename of v3. Most of what you remember is wrong.

| You're about to type… | …it doesn't exist. Use this instead. |
|---|---|
| `import { PanelGroup }` | `import { Group }` |
| `import { PanelResizeHandle }` | `import { Separator }` |
| `<PanelGroup direction="horizontal">` | `<Group orientation="horizontal">` |
| `autoSaveId="x"` | `useDefaultLayout({ id: "x", panelIds, storage })` hook |
| `defaultSize={30}` (you meant 30%) | `defaultSize="30%"` (in v4, **bare numbers are PIXELS**) |
| `ref={panelRef}` | `panelRef={panelRef}` (named prop, NOT React `ref`) |
| `ref={groupRef}` | `groupRef={groupRef}` (named prop, NOT React `ref`) |
| `onCollapse={...}` / `onExpand={...}` | derive from `onResize(next, id, prev)` — those props were removed |
| `MixedSizes` type | `PanelSize` (`{ asPercentage: number; inPixels: number }`) |
| `ImperativePanelHandle` | `PanelImperativeHandle` |
| `ImperativePanelGroupHandle` | `GroupImperativeHandle` |
| `disableGlobalCursorStyles()` | `<Group disableCursor />` prop |

### Things that DO NOT EXIST in v4 (don't search for them — you won't find them)

- `units` prop on Group (size unit is encoded in each value: `30` = 30px, `"30%"` = 30%, `"3rem"`, `"50vh"`, `"50vw"`).
- `keyboardResizeBy` prop.
- `tagName` prop on Group/Panel/Separator. The root is always a `<div>`.
- `order` prop on Panel. DOM order = layout order. (Conditional rendering replaces it.)
- `defaultCollapsed` prop on Panel. Use `defaultSize="0%"` + `collapsible`. (4.4.1+ mounts collapsed.)
- `hitAreaMargins` on Separator. Hit-target is configured at Group level via `resizeTargetMinimumSize={{ coarse: 20, fine: 10 }}`.
- `onDragging` / `onFocus` / `onBlur` on Separator.
- `usePanelGroupContext` hook. Internal. Not exported.

If you import any of these, the build fails or runtime silently does nothing.

### The pixel-vs-percent rule (the most common silent regression)

In v3, `defaultSize={30}` meant 30%. **In v4, it means 30 pixels.** Use strings with explicit units:

```tsx
// ❌ WRONG — 30 pixels, not 30%. Your sidebar will be 30px wide.
<Panel defaultSize={30} minSize={10} />

// ✅ RIGHT — explicit percent
<Panel defaultSize="30%" minSize="10%" />

// ✅ ALSO RIGHT — explicit pixels (good for fixed sidebars)
<Panel defaultSize="240px" minSize="180px" />

// ✅ Mixed is fine; each prop is interpreted standalone
<Panel defaultSize="240px" minSize="20%" maxSize="50%" />
```

`SizeUnit` = `"px" | "%" | "em" | "rem" | "vh" | "vw"`.

---

## Decision tree

| You want… | Use this. |
|---|---|
| A simple 50/50 horizontal split with no persistence | Render `<Group>` directly from a Server Component with two `<Panel>`s and a `<Separator>`. No client wrapper needed. |
| Sizes remembered across reloads, SSR-correct first paint | Cookie pattern (recipe §3 below). Server reads cookie, passes `defaultLayout`, client wrapper writes on `onLayoutChanged`. |
| A button that hides/shows a sidebar and remembers prior width | `collapsible` + `collapsedSize="0%"` + `panelRef.current.collapse()/.expand()`. Library remembers automatically. (Recipe §4.) |
| Mount/unmount panels conditionally (not just collapse) | `useDefaultLayout({ id, panelIds })` with `panelIds` reflecting currently-mounted panels. (Recipe §5.) |
| VSCode-like layout (sidebar + editor + terminal + chat) | Nested groups (recipe §6). Each group has its own `id` and its own cookie. |
| Apple Mail / Notes layout (multi-sidebar) | Multiple collapsible panels in a single Group. (Recipe §7.) |
| Cross-component toggle (toolbar button hides a panel rendered far away) | Redux for the "is open" boolean → `useEffect` reads it and calls `panelRef.collapse()/.expand()`. Library still owns size. |
| Fullscreen one panel | `panel.resize("100%")` and `siblings.resize("0%")` via `groupRef.setLayout(...)`. Don't unmount. |

---

## §1 — API reference (verbatim from source)

### `<Group>` — replaces v3 `<PanelGroup>`

```tsx
import { Group, type GroupProps } from "react-resizable-panels";
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `id` | `string \| number` | `useId()` fallback | **Pass an explicit, stable `id` always.** Storage key uses it. |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | (v3 was `direction`) |
| `defaultLayout` | `{ [panelId: string]: number }` (percentages 0..100) | undefined | Pair with `onLayoutChanged` for persistence. |
| `onLayoutChange` | `(layout) => void` | undefined | Fires every pointer move during drag. **Avoid for persistence — use the past-tense one.** |
| `onLayoutChanged` | `(layout) => void` | undefined | Fires on pointer-up. **Use this for cookie writes.** |
| `disableCursor` | `boolean` | false | Disables the global resize-cursor side effect. |
| `disabled` | `boolean` | false | Disables resize for the whole group. |
| `resizeTargetMinimumSize` | `{ coarse: number; fine: number }` | `{ coarse: 20, fine: 10 }` | Hit-target px for touch / mouse. |
| `groupRef` | `Ref<GroupImperativeHandle \| null>` | — | Imperative API. **Named prop, NOT React `ref`.** |
| `elementRef` | `Ref<HTMLDivElement \| null>` | — | Root `<div>` ref. |
| `className` / `style` | standard | — | `display`, `flex-direction`, `flex-wrap`, `overflow` are forced by the lib and CANNOT be overridden. |

### `<Panel>`

```tsx
import { Panel, type PanelProps } from "react-resizable-panels";
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `id` | `string \| number` | `useId()` fallback | **Pass an explicit, stable `id` always.** |
| `defaultSize` | `number \| string` | auto-distributed | Number = px. String without unit = percent. (`30` = 30px, `"30"` = 30%, `"30%"` = 30%, `"240px"` = 240px.) |
| `minSize` | `number \| string` | `"0%"` | Same unit rules. |
| `maxSize` | `number \| string` | `"100%"` | Same unit rules. |
| `collapsible` | `boolean` | false | Auto-collapses if dragged below `minSize`. Required for `panelRef.collapse()`. |
| `collapsedSize` | `number \| string` | `"0%"` | Size when collapsed. |
| `disabled` | `boolean` | false | Cannot be resized via pointer. **Imperative API still works.** |
| `groupResizeBehavior` | `"preserve-relative-size" \| "preserve-pixel-size"` | `"preserve-relative-size"` | When parent group resizes: keep ratio (default) or keep pixels. At least one panel per group must be `preserve-relative-size`. |
| `onResize` | `(next, id, prev) => void` | — | `next`/`prev` = `PanelSize` (`{ asPercentage, inPixels }`). `prev` is `undefined` on first mount. |
| `panelRef` | `Ref<PanelImperativeHandle \| null>` | — | **Named prop, NOT React `ref`.** |
| `elementRef` | `Ref<HTMLDivElement>` | — | Root `data-panel` div ref. |
| `className` / `style` | standard | — | **Applied to a NESTED inner div, not the outer `data-panel` div.** Target outer with `[data-panel]` selector or `elementRef`. |

### `<Separator>` — replaces v3 `<PanelResizeHandle>`

```tsx
import { Separator, type SeparatorProps } from "react-resizable-panels";
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `id` | `string \| number` | `useId()` fallback | |
| `disabled` | `boolean` | false | Direct resize disabled (neighbors may still resize indirectly). |
| `disableDoubleClick` | `boolean` | false | Disables 4.5.0+ double-click-to-reset behavior. |
| `elementRef` | `Ref<HTMLDivElement>` | — | |
| `className` / `style` | standard | — | `flex-grow`, `flex-shrink` cannot be overridden. |

The library renders `role="separator"`, `aria-controls`, `aria-orientation`, `aria-valuemin/max/now`, plus `data-separator="default" | "hover" | "dragging" | "focus"`. Style off `data-separator=*`, not pseudo-classes.

**Required CSS for any custom Separator** (you WILL hit this in dark mode otherwise):

```tsx
<Separator
  className={[
    "bg-border transition-colors focus:outline-none",
    // kill the browser's default focus outline (the lib sets tabIndex={0})
    "data-[separator=hover]:bg-primary",
    "data-[separator=active]:bg-primary",   // mouse-down / focused — covers the "click reveals a white line" bug
    "data-[separator=dragging]:bg-primary",
    // orientation-aware sizing (works in both horizontal and vertical Groups)
    "[&[aria-orientation=vertical]]:w-0.5 [&[aria-orientation=vertical]]:cursor-col-resize",
    "[&[aria-orientation=horizontal]]:h-0.5 [&[aria-orientation=horizontal]]:cursor-row-resize",
  ].join(" ")}
/>
```

The library sets `tabIndex={0}` on the Separator, so clicking it focuses it. Without `focus:outline-none` the browser draws its default focus outline — a 1px near-white line in the center — which looks fine in light mode but stands out in dark mode. **Always set `focus:outline-none` and explicitly style `hover`, `active`, AND `dragging`** (style only `hover` and the bar reverts to `bg-border` the moment you click — that's the bug).

In this codebase: use [`components/ui/resizable.tsx`](../../../components/ui/resizable.tsx)'s `ResizableHandle` for theme-aware horizontal handles, OR import the demo-shared `Handle` from [`app/(dev)/demos/resizables/_lib/Handle.tsx`](../../../app/(dev)/demos/resizables/_lib/Handle.tsx) which is orientation-aware (works in both horizontal and vertical Groups, no hardcoded cursor). Don't reinvent the class string in every demo.

### Imperative handles

```tsx
interface PanelImperativeHandle {
  collapse(): void;                  // no-op if not collapsible OR already collapsed
  expand(): void;                    // restores pre-collapse size automatically (falls back to minSize, then 1)
  getSize(): { asPercentage: number; inPixels: number };
  isCollapsed(): boolean;            // returns false for non-collapsible panels even at size 0
  resize(size: number | string): void; // accepts "30%" / "200px" / "1rem" / etc.
}

interface GroupImperativeHandle {
  getLayout(): { [panelId: string]: number };           // percentages 0..100
  setLayout(layout: { [panelId: string]: number }): Layout; // returns post-validation layout
}
```

All methods are **synchronous**. Safe in event handlers and effects. **No-op if called during render** (the ref holds a stub until first layout effect runs).

### Hooks — the full export list

```tsx
import {
  Group, Panel, Separator,
  useDefaultLayout,        // SSR/persistence helper
  useGroupRef,             // = useRef<GroupImperativeHandle | null>(null) — type sugar
  useGroupCallbackRef,     // callback-ref form
  usePanelRef,             // = useRef<PanelImperativeHandle | null>(null) — type sugar
  usePanelCallbackRef,     // callback-ref form
  isCoarsePointer,         // utility
} from "react-resizable-panels";
```

There is **no `usePanelGroupContext`**. Don't import it.

---

## §2 — The smallest possible example (no persistence)

A 2-panel split. **Renders directly from a Server Component** — no `'use client'` wrapper needed because no callback props.

```tsx
// app/(dev)/demos/resizables/00-baseline/page.tsx
// SERVER COMPONENT. No 'use client'.
import { Group, Panel, Separator } from "react-resizable-panels";

export default function Page() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-hidden">
      <Group id="demo-baseline" orientation="horizontal" className="h-full w-full">
        <Panel id="left" defaultSize="50%" minSize="20%">
          <div className="h-full p-4">Left</div>
        </Panel>
        <Separator className="w-0.5 bg-border" />
        <Panel id="right" defaultSize="50%" minSize="20%">
          <div className="h-full p-4">Right</div>
        </Panel>
      </Group>
    </div>
  );
}
```

Why this works as SSR: `Group`/`Panel`/`Separator` all carry their own `'use client'` directive in the library. RSC composition allows server components to instantiate client components and pass server-rendered children. We don't pass any function props, so nothing crosses the boundary that can't be serialized.

---

## §3 — Cookie-backed SSR persistence (the canonical pattern)

**This is the pattern for 99% of real layouts.** Server reads cookie → passes `defaultLayout` to a client wrapper → wrapper writes the cookie on `onLayoutChanged`.

### Server component (the page)

```tsx
// app/(dev)/demos/resizables/01-cookie-ssr/page.tsx
import { cookies } from "next/headers";
import { Panel, Separator, type Layout } from "react-resizable-panels";
import { ClientGroup } from "./ClientGroup";

const GROUP_ID = "demo-01";
const COOKIE_NAME = `panels:${GROUP_ID}`;

async function readLayoutCookie(): Promise<Layout | undefined> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Layout;
  } catch {
    return undefined;
  }
}

export default async function Page() {
  const defaultLayout = await readLayoutCookie();
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-hidden">
      <ClientGroup
        id={GROUP_ID}
        cookieName={COOKIE_NAME}
        defaultLayout={defaultLayout}
        className="h-full w-full"
      >
        <Panel id="left"   defaultSize="20%" minSize="10%">…</Panel>
        <Separator className="w-0.5 bg-border" />
        <Panel id="center" defaultSize="60%" minSize="30%">…</Panel>
        <Separator className="w-0.5 bg-border" />
        <Panel id="right"  defaultSize="20%" minSize="10%">…</Panel>
      </ClientGroup>
    </div>
  );
}
```

### Client wrapper

```tsx
// app/(dev)/demos/resizables/01-cookie-ssr/ClientGroup.tsx
"use client";

import { Group, type GroupProps } from "react-resizable-panels";

type Props = Omit<GroupProps, "onLayoutChange" | "onLayoutChanged"> & {
  cookieName: string;
};

export function ClientGroup({ cookieName, ...props }: Props) {
  return (
    <Group
      {...props}
      onLayoutChanged={(layout) => {
        document.cookie =
          `${cookieName}=${encodeURIComponent(JSON.stringify(layout))}` +
          `; path=/; max-age=31536000; SameSite=Lax`;
      }}
    />
  );
}
```

### Why each piece matters

- **Server reads cookie, passes `defaultLayout`.** Server output already has the persisted sizes baked into flex-grow values. No flash on first paint.
- **`onLayoutChanged` (past tense), not `onLayoutChange`.** Past tense fires on pointer-up. Present tense fires every mousemove → cookie write storm. (Past tense was added in 4.4.0.)
- **Stable explicit `id`** on Group AND every Panel. Without explicit ids the library uses `useId()` — hydration-stable but volatile across navigations, so persistence silently breaks.
- **Wrapper is `'use client'`** because `onLayoutChanged` is a function and functions can't cross the RSC boundary. The wrapper is the thinnest possible client component.
- **Server component children of `<Panel>` are fine.** Pass `<ServerSidebar />` etc. as `children` — RSC composition allows it.

---

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

## §5 — Conditional panels (mount/unmount, not just collapse)

If a panel can be **fully removed from the DOM** (not collapsed to zero), each combination of mounted panels gets its own remembered layout via `useDefaultLayout({ id, panelIds })`.

```tsx
"use client";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";

export function Workbench({ showLeft, showRight }: Props) {
  const panelIds = [
    ...(showLeft ? ["left"] : []),
    "center",
    ...(showRight ? ["right"] : []),
  ];
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "workbench",
    panelIds,
    storage: cookieStorage, // see below
  });

  return (
    <Group id="workbench" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
      {showLeft && <><Panel id="left" minSize="160px"><Left /></Panel><Separator /></>}
      <Panel id="center"><Editor /></Panel>
      {showRight && <><Separator /><Panel id="right" minSize="240px"><Right /></Panel></>}
    </Group>
  );
}
```

Storage key format (from library source): `react-resizable-panels:${groupId}:${...sortedPanelIds}`. Each `panelIds` permutation gets its own key, so toggling the right panel off and on again restores the same layout you had last time it was visible.

Cookie storage adapter (works with `useDefaultLayout`):

```ts
import type { LayoutStorage } from "react-resizable-panels";

export const cookieStorage: LayoutStorage = {
  getItem(key) {
    if (typeof document === "undefined") return null;
    const row = document.cookie.split("; ").find((r) => r.startsWith(`${encodeURIComponent(key)}=`));
    return row ? decodeURIComponent(row.split("=")[1]) : null;
  },
  setItem(key, value) {
    if (typeof document === "undefined") return;
    document.cookie =
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}` +
      `; path=/; max-age=31536000; SameSite=Lax`;
  },
};
```

Note: `useDefaultLayout` only runs on the client (it's in a `'use client'` component). For SSR-correct first paint with conditional panels, ALSO read the toggle state from a cookie on the server so the initial render mounts the correct set of panels:

```tsx
// Server page — page.tsx
const toggles = await readJsonCookie<Toggles>("panels:demo-05:toggles");
return (
  <ConditionalWorkbench initialShowRight={toggles?.showRight ?? true} />
);

// Client component
const [showRight, setShowRight] = useState(initialShowRight);
useEffect(() => {
  // persist toggle state so SSR can pick the right initial set next time
  document.cookie = `panels:demo-05:toggles=${encodeURIComponent(JSON.stringify({ showRight }))}; path=/; max-age=31536000; SameSite=Lax`;
}, [showRight]);
const panelIds = ["left", "center", ...(showRight ? ["right"] : [])];
const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id, panelIds, storage: cookieStorage });
```

Working example: [`05-conditional-panels/`](../../../app/(dev)/demos/resizables/05-conditional-panels/).

---

## §6 — VSCode-style nested layout

```tsx
"use client";
import { Group, Panel, Separator } from "react-resizable-panels";

export function VSCodeShell() {
  return (
    <Group id="root" orientation="horizontal" className="h-dvh">
      <Panel id="activity-bar" defaultSize="48px" minSize="48px" maxSize="48px">
        <ActivityBar />
      </Panel>
      <Separator disabled />

      <Panel id="sidebar" defaultSize="240px" minSize="180px" collapsible collapsedSize="0%">
        <Sidebar />
      </Panel>
      <Separator />

      <Panel id="main" minSize="40%">
        <Group id="main-vertical" orientation="vertical">
          <Panel id="editor" minSize="20%"><Editor /></Panel>
          <Separator />
          <Panel id="terminal" defaultSize="30%" collapsible collapsedSize="0%">
            <Terminal />
          </Panel>
        </Group>
      </Panel>
      <Separator />

      <Panel id="chat" defaultSize="320px" minSize="240px" collapsible collapsedSize="0%">
        <Chat />
      </Panel>
    </Group>
  );
}
```

Rules for nesting:
- Each `<Group>` needs its own stable `id` (and therefore its own cookie).
- Panels and Separators must be **direct DOM children of their Group**. Never wrap them in a `<div>`. (TSDoc spec.)
- A nested Group goes **inside** a parent Panel's children, not as a sibling of other Panels.
- For the immovable activity-bar pattern, set `defaultSize=minSize=maxSize` to the same pixel value AND mark the adjacent `<Separator disabled />`.

---

## §7 — Apple Mail / Notes multi-sidebar layout

```tsx
"use client";
import { Group, Panel, Separator } from "react-resizable-panels";

export function MailShell() {
  return (
    <Group id="mail" orientation="horizontal" className="h-dvh">
      <Panel id="folders"  defaultSize="200px" minSize="160px" collapsible collapsedSize="0%"><Folders /></Panel>
      <Separator />
      <Panel id="messages" defaultSize="300px" minSize="220px" collapsible collapsedSize="0%"><Messages /></Panel>
      <Separator />
      <Panel id="reader"   minSize="40%"><Reader /></Panel>
      <Separator />
      <Panel id="inspector" defaultSize="280px" minSize="200px" collapsible collapsedSize="0%"><Inspector /></Panel>
    </Group>
  );
}
```

Each separator is independent — pulling separator B doesn't move separator A. Each collapsible panel remembers its own pre-collapse size.

---

## §8 — Pitfalls (numbered for fast scanning during code review)

1. **Don't add `useState` to track sizes.** The library is the source of truth. If you need the current size, read it from `onResize`, `onLayoutChanged`, or `panel.getSize()` in an event handler. A second source will drift during fast drags.
2. **Don't add `useRef` + `useEffect` to read sizes.** No `setInterval`, no `ResizeObserver`. `onLayoutChanged` and `onResize` already give you the values.
3. **Don't add a state to remember "previous size before collapse."** `panel.collapse()` stores it; `panel.expand()` restores it. Adding your own `lastSize` state is duplication.
4. **Don't put `key` props on Group or Panel that change on re-render.** Changing `key` remounts → re-registration with new identity → drops in-memory layout → resets persistence. Swap the `children`, not the panel.
5. **Don't wrap `<Panel>` or `<Separator>` in extra `<div>`s.** They must be direct DOM children of their Group. Wrap **inside** the Panel instead.
6. **Don't import v3 names** (`PanelGroup`, `PanelResizeHandle`, `MixedSizes`, `ImperativePanelHandle`, `ImperativePanelGroupHandle`). Build will fail.
7. **Don't pass bare numbers and assume percent.** `defaultSize={30}` = 30 pixels. Use `"30%"`.
8. **Don't pass `onLayoutChanged` (or any function prop) on `<Group>` from a Server Component.** Functions can't cross the RSC boundary. Use a `'use client'` wrapper (recipe §3).
9. **Don't call imperative API methods during render.** The ref holds a no-op stub until first layout effect runs. Call from event handlers / effects.
10. **Don't use `localStorage` for SSR.** It's undefined on the server → mismatch on hydration. Use the cookie storage adapter (§5) or an explicit `defaultLayout` cookie read.
11. **Don't omit `id` on Group or Panel.** Falls back to `useId()` — works for the current page but breaks persistence across navigations and clobbers other groups' storage.
12. **Don't rely on `Layout` being an array.** v4 layout is `{ [panelId: string]: number }`. v3-shaped persisted data needs migration (the `useDefaultLayout` hook does it automatically via `readLegacyLayout`; if you wrote your own persistence in v3, migrate manually).
13. **`Panel`'s `className`/`style` apply to a NESTED inner div, not the outer `data-panel` div.** Target the outer with `[data-panel]` selector or `elementRef`.
14. **Don't expect `onCollapse`/`onExpand`.** Removed in v4. Detect transitions in `onResize` by comparing `prev.asPercentage` to `next.asPercentage`.
15. **Don't forget `focus:outline-none` on a custom Separator.** The library sets `tabIndex={0}`, so clicking the separator focuses it; without that class the browser paints a near-white default outline that's invisible in light mode but jarring in dark mode. Style `hover`, `active`, AND `dragging` data-states — not just `hover`. See §1 for the canonical class list, or use a project wrapper.
16. **Don't set sidebar `minSize` too high.** Project convention: sidebars use `minSize="5%"` (or `"8%"` if it's a *primary* sidebar that should never go invisibly small). **`minSize="12%"` and up is wrong** — agents do this constantly and it ruins the UX because users can't shrink the sidebar to a comfortable size before collapsing. Main / reader panels can use bigger mins (20–30%) since they're the focus area. Fixed rails (activity bar, etc.) use `minSize=maxSize=defaultSize="48px"` (or whatever pixel size).
17. **Don't roll your own "is this collapsed" tracking with `useEffect` reading the ref.** If you need a button icon to flip on collapse, mirror only the `boolean` (intent) in `useState` and update it inside `onResize` by comparing `prev.asPercentage === 0` to `next.asPercentage === 0`. The library still owns the size; you only own the icon flip. Use [`_lib/RegisteredPanel.tsx`](../../../app/(dev)/demos/resizables/_lib/RegisteredPanel.tsx) — it does this for you and registers the ref with the cross-portal provider.
18. **Don't render your own `<header>` element inside the page body.** Use [`<PageHeader>`](../../../features/shell/components/header/PageHeader.tsx) — it portals into the shell's already-glass header. A custom in-body header double-stacks the chrome and leaves an empty gap at the bottom.
19. **Don't add padding / borders / gap / space / `bg-*` around `TapTargetButton`s.** The component is `h-11 w-11` (44pt touch target) with an inner `h-8 w-8` glass disc — the 12px transparent ring is the visual breathing room. Adding *any* `p-*`, `gap-*`, `space-x-*`, `space-y-*`, `m-*`, or wrapping `<div className="p-1">` makes the header look bloated. **Containers around tap-targets must be `gap-0 p-0 space-x-0 space-y-0`.** Same applies to `BackChevron` (it mirrors TapTargetButton's structure).
20. **Don't make the whole page `'use client'`.** The page is a Server Component. Add `'use client'` only at small leaves — `ClientGroup`, `RegisteredPanel`, `Handle`, `HeaderControls`, providers. Server-component children pass through `<Panel>` as `children`. Reference: [`app/(a)/agents/[id]/build/page.tsx`](../../../app/(a)/agents/[id]/build/page.tsx).
21. **Don't put `bg-*` on the root of `<PageHeader>` content.** The shell header is the glass surface. Adding a background on the injected content breaks the visual.
22. **Don't add `paddingTop: var(--shell-header-h)` to the page wrapper.** The header is transparent by design and panel content extends behind it. Adding paddingTop forces every panel below the header and creates the "boxed" look the design rejects. (Earlier guidance in this skill said the opposite — that was wrong; corrected.)
23. **Don't add `border-b border-border` to mini-titles INSIDE panels.** A "file tab" header strip with a bottom border inside an editor panel reads visually as a fake page-header bottom border, especially when the panel butts up against the shell header. Use typography (size, color, padding) for delineation, not lines.
24. **Don't use `useDefaultLayout` for conditional (mount/unmount) panels with SSR.** Its `defaultLayout` return is `undefined` on the server but populated on first client paint → hydration mismatch (server emits `flex-grow: 1` auto-distributed, client emits `flex-grow: 20` from cookie). For conditional panels, read the matching combo's cookie server-side and pass it as `defaultLayout` directly to `<Group>`. See §5 "Mount/unmount panels (different beast)".
25. **Every demo/route header includes a back chevron** to its parent route as the leftmost element. Use `<ChevronLeftTapButton href="/parent" variant="transparent" ariaLabel="Back" />` from `components/icons/tap-buttons.tsx`. Pattern: `<div className="flex items-center gap-0 p-0">{back-chevron}{...left toggles...}</div>` on the left of the header content, title in the middle, right toggles on the right.
26. **Don't use `panel.collapse()` / `panel.expand()` for cross-portal toggles when there are TWO OR MORE adjacent collapsibles in the same group.** The lib's `setPanelSize` uses a `[index-1, index]` pivot, so the freed/required space goes to the immediate neighbor. If the neighbor is already collapsed (0%), it re-expands. Use `groupRef.setLayout(layout)` instead (sets every panel's size at once, no pivot). [`_lib/PanelControlProvider.tsx`](../../../app/(dev)/demos/resizables/_lib/PanelControlProvider.tsx) does this. **All toggles in this codebase should go through `<PanelControlProvider>` + `<RegisteredPanel>`, not raw `panelRef.collapse()`.**
27. **Hide the Handle adjacent to a collapsed panel.** A 0%-wide Handle is still in the DOM, still draggable, still bypasses the toggle button — users can grab the sliver and drag a collapsed panel back open. Pass `hideWhenCollapsed={["sidebar"]}` (or any combination) on each `<Handle />` so it returns `null` when any of its adjacent named panels is collapsed in `<PanelControlProvider>`. The toggle button is then the only way to expand. Worked example: [`03-vscode-shell/page.tsx`](../../../app/(dev)/demos/resizables/03-vscode-shell/page.tsx).

---

## §8.5 — Server-first page composition (this is the project pattern)

**The page must be a Server Component.** Push `'use client'` down to the smallest possible islands. The reference is [`app/(a)/agents/[id]/build/page.tsx`](../../../app/(a)/agents/[id]/build/page.tsx); the demos at `/demos/resizables/*` follow the same shape.

### The skeleton

```tsx
// page.tsx — SERVER COMPONENT (no 'use client')
import { Panel } from "react-resizable-panels";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ClientGroup } from "../_lib/ClientGroup";
import { Handle } from "../_lib/Handle";
import { PanelControlProvider } from "../_lib/PanelControlProvider";
import { RegisteredPanel } from "../_lib/RegisteredPanel";
import { readLayoutCookie } from "../_lib/readLayoutCookie";
import { MyHeaderControls } from "./HeaderControls";

const COOKIE_NAME = "panels:my-page";

export default async function MyPage() {
  const defaultLayout = await readLayoutCookie(COOKIE_NAME);
  return (
    <PanelControlProvider>
      <PageHeader>
        <MyHeaderControls />          {/* client island — TapTargetButtons */}
      </PageHeader>

      <div
        className="h-full overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <ClientGroup id="my-page" cookieName={COOKIE_NAME} defaultLayout={defaultLayout} className="h-full w-full">
          <RegisteredPanel registerAs="sidebar" id="sidebar" collapsible collapsedSize="0%" defaultSize="20%" minSize="5%">
            <SidebarContent />        {/* SERVER COMPONENT */}
          </RegisteredPanel>
          <Handle />
          <Panel id="main" minSize="30%">
            <MainContent />            {/* SERVER COMPONENT */}
          </Panel>
        </ClientGroup>
      </div>
    </PanelControlProvider>
  );
}
```

### What's a server vs client island here

| Component | Boundary | Why |
|---|---|---|
| `page.tsx` | **server** | Awaits cookies, renders the tree |
| `<PanelControlProvider>` | client | Holds the ref registry + collapsed state in `useState` |
| `<PageHeader>` | server | Just a portal sender; no hooks |
| `<MyHeaderControls>` | client | Reads context, has `onClick` handlers |
| `<ClientGroup>` | client | Owns `onLayoutChanged` (function = not serializable across RSC) |
| `<RegisteredPanel>` | client | Owns `usePanelRef()` + `onResize` + `useEffect(register)` |
| `<Handle>` | client | Library `<Separator>` is `'use client'` |
| `SidebarContent`, `MainContent` | **server** | Pure JSX — pass them as `children` to `<Panel>`. They can `await` data, read cookies, etc. |

### The `<main>` is pulled UP under the header — content extends behind it (this is the design)

`shell.css` defines `.shell-main` with `margin-top: calc(-1 * var(--shell-header-h))`. The shell header is **transparent**, the page does not scroll vertically, and the design intent is that **content extends all the way to the top of the page, behind the glass header**. That gives panels (chat conversations especially) the maximum possible vertical real estate and feels open.

**Default page wrapper:**

```tsx
<div className="h-full overflow-hidden">
  <ClientGroup .../>
</div>
```

**No `paddingTop: var(--shell-header-h)`** on the outer wrapper — that forces every panel below the header and creates the "boxed" feeling the design rejects.

**Per-panel top-spacing is each column's own responsibility.** The page wrapper does NOT impose top padding; each panel surface decides based on its content:

- **Scrolling content (no `pt-` needed)** — chat conversations, message lists, any panel where the user scrolls. Content flows behind the header icons; if something is obscured, scrolling reveals it. Latest messages stay at the bottom (visible) by default. Example: the chat panel in [`03-vscode-shell/page.tsx`](../../../app/(dev)/demos/resizables/03-vscode-shell/page.tsx) has no `pt-` and no top label — messages flow all the way to the top edge.

- **Static or interactive top content (`pt-[var(--shell-header-h)]` required)** — anything that sits at the top and won't scroll out of the way: panel titles, file tabs, terminal tabs, search inputs, agent dropdowns, "+New" buttons. These MUST clear the shell header zone, otherwise the glass icons render on top of important UI. Add the padding at the OUTERMOST element of the panel surface so everything inside is safely below the header.

```tsx
// SCROLLING — no top padding, content can flow up under the header
function ChatSurface() {
  return (
    <div className="h-full flex flex-col bg-muted">
      <div className="flex-1 overflow-auto p-3 …">{messages}</div>
      <div className="shrink-0 p-2">{input}</div>
    </div>
  );
}

// STATIC / INTERACTIVE TOP — pt clears the header
function FilesSidebar() {
  return (
    <div className="h-full overflow-auto bg-muted pt-[var(--shell-header-h)]">
      <div className="px-3 py-1.5 text-[11px] uppercase …">Files</div>
      <ul>{items}</ul>
    </div>
  );
}
```

Tailwind arbitrary-value `pt-[var(--shell-header-h)]` is preferred over the inline `style={{paddingTop: "var(--shell-header-h)"}}` — same effect, less noise, still resolves the live CSS var so a future header-height change propagates everywhere.

The agent builder uses inline `paddingTop: "var(--shell-header-h)"` on individual single-column readers — same idea, just inline-style flavor. Both are valid; pick what reads cleanest in context.

### `<PageHeader>` rules (non-negotiable)

- `<PageHeader>` is a **server component** that portals its children into the shell header center slot. The shell header already has the glass background; you don't add it.
- **Do NOT render your own `<header>` element inside the page body.** If you do, you double-stack headers and leave a gap at the bottom.
- Children must be **self-contained and transparent at the root** — never give the root child `bg-card`, `bg-muted`, or any background class. The shell header is the surface; let it show through.
- Use **TapTargetButtons** for icons (`PanelLeftTapButton`, `PanelRightTapButton`, `TerminalTapButton`, `MessageTapButton`, etc., from [`components/icons/tap-buttons.tsx`](../../../components/icons/tap-buttons.tsx)). They include their own padding, glass disc, focus ring, and tooltip — **don't wrap them in extra padding** or add `className="p-1 rounded hover:bg-accent"` around them.
- For non-icon content (titles, subtitles), use plain text spans/h1 with no bg — see [`_lib/DemoTitle.tsx`](../../../app/(dev)/demos/resizables/_lib/DemoTitle.tsx).

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

### Mount/unmount panels (different beast — and a hydration trap)

If you genuinely want to remove a panel from the DOM (not just collapse it), follow [`05-conditional-panels/`](../../../app/(dev)/demos/resizables/05-conditional-panels/). The pattern has two cookies and a hand-rolled persistence step — `useDefaultLayout` is NOT safe here:

**Why not `useDefaultLayout`:** the hook's `defaultLayout` return value is `undefined` on the server (no `document`) but populated on the first client paint. That mismatch produces React's "tree hydrated but some attributes... didn't match" error — the server sends `flex-grow: 1` (auto-distributed) and the client computes `flex-grow: 20` (from the cookie).

**The SSR-safe shape:**

1. **Toggle cookie** holds the mount state (e.g. `{ showRight: true }`). Server reads it to decide which panels to mount.
2. **Layout cookie keyed per combination** — the lib's storage key format is `react-resizable-panels:${groupId}:${...panelIds}`. Server reads the cookie for the current `panelIds` permutation and passes it as `defaultLayout` directly to `<Group>`.
3. The client component takes `initialLayout` as a prop and gives it straight to `<Group>` as `defaultLayout`. Same value SSR + first client render → no mismatch.
4. When the user toggles, `panelIds` changes. A `useEffect` reads the new combo's cookie and calls `groupRef.setLayout(newLayout)` to swap.
5. `onLayoutChanged` writes back to whichever combo's cookie is currently active.

```tsx
// page.tsx (server)
const GROUP_ID = "demo-05";
const TOGGLE_COOKIE = "panels:demo-05:toggles";

function buildLayoutCookieKey(panelIds: string[]) {
  return `react-resizable-panels:${[GROUP_ID, ...panelIds].join(":")}`;
}

async function readState() {
  const store = await cookies();
  const showRight = JSON.parse(store.get(TOGGLE_COOKIE)?.value ?? "{}")?.showRight ?? true;
  const panelIds = ["left", "center", ...(showRight ? ["right"] : [])];
  const layoutRaw = store.get(buildLayoutCookieKey(panelIds))?.value;
  const initialLayout = layoutRaw ? JSON.parse(decodeURIComponent(layoutRaw)) : undefined;
  return { showRight, initialLayout };
}

// ConditionalGroup.tsx (client) — see the demo file for full impl.
// Key shape:
<Group
  id={GROUP_ID}
  groupRef={groupRef}
  defaultLayout={initialLayout}     // ← from server prop, identical SSR + client
  onLayoutChanged={writeToCurrentComboKey}
>
  ...
</Group>
```

This shape is the only conditional-panel persistence pattern that's hydration-clean. **If you're tempted to use `useDefaultLayout` here, don't** — the convenience isn't worth the SSR mismatch.

---

## §9 — Project conventions (this codebase)

- **Theme-styled wrappers exist.** Prefer importing `ResizablePanelGroup`/`ResizablePanel`/`ResizableHandle` from [`@/components/ui/resizable`](../../../components/ui/resizable.tsx) when you want the standard handle styling and theme-aware focus rings. They're thin v4-aware wrappers around `Group`/`Panel`/`Separator` and they're already `'use client'`.
- **For SSR-first pages**, render `<Group>` directly (it carries its own `'use client'`) or use a hand-written `'use client'` wrapper when you need callbacks. The shadcn wrapper is always client; if you mount it from a Server Component, you cannot pass `onLayoutChanged` from the server side.
- **Cookie naming convention:** `panels:${groupId}` (e.g. `panels:demo-01`, `panels:vscode-shell`). Keep all panel-layout cookies under the `panels:` namespace so they're easy to clear and find in devtools.
- **Sidebar `minSize` convention:** **5%** by default. **8%** for primary sidebars that should never go invisibly small. Anything **≥12%** is too restrictive — agents have a strong tendency to over-set this. Main / reader / editor panels: 20–30%. Fixed rails (activity bar): `minSize=maxSize=defaultSize="48px"`.
- **Layout state lives in Redux only when** a non-adjacent component needs to toggle a panel (toolbar button → panel rendered elsewhere). Keep only the *intent* (boolean isOpen) in Redux; let the library own the *size*.
- **Window Panels (overlays) are a different system.** [`features/window-panels/`](../../../features/window-panels/) is for floating windows, modals, sheets, drawers — overlays. `react-resizable-panels` is for split-pane layouts. Don't mix them.
- **Page wrapper convention:** `<div className="h-full overflow-hidden">` only. NO paddingTop. The shell header is transparent and panel content extends behind it (see §8.5). Do NOT use `h-[calc(100dvh-var(--header-height))]` or a custom body header — both fight the shell layout.
- **TapTargetButtons for header icons:** Import from [`components/icons/tap-buttons.tsx`](../../../components/icons/tap-buttons.tsx). Available pre-made: `PanelLeftTapButton`, `PanelRightTapButton`, `TerminalTapButton`, `MessageTapButton`, `HistoryTapButton`, `MenuTapButton`, `SettingsTapButton`, `SearchTapButton`, `Settings2TapButton`, `BellTapButton`, `PlayTapButton`, `PlusTapButton`, `XTapButton`, `SaveTapButton`, `WrenchTapButton`, `BugTapButton`, `RobotTapButton`, etc. All variants take `onClick`, `ariaLabel`, `tooltip`. Do NOT wrap them in containers with padding or borders — they already have a 44pt target + 32px glass disc + focus ring.
- **Back navigation uses `ChevronLeftTapButton` with `href`.** TapTargetButton supports `href` natively (`next/link` for internal, `<a target="_blank">` for external). Use `<ChevronLeftTapButton href="/parent" variant="transparent" ariaLabel="Back" />` — `variant="transparent"` makes it visually quieter than the active toggle buttons. There is no separate `BackChevron` component; don't create one.
- **`variant` indicates cluster state.** Group your toggle buttons into a left cluster and a right cluster. Compute one boolean per cluster (`isLeftSideCollapsed = AND of all panels in that cluster's collapsed flags`) and apply `variant={collapsed ? "transparent" : "glass"}` to every button in the cluster. When the entire side is closed, all its buttons go transparent — strong visual cue that there's nothing open on that side. Reference: [`03-vscode-shell/HeaderControls.tsx`](../../../app/(dev)/demos/resizables/03-vscode-shell/HeaderControls.tsx).
- **Mobile:** resizable panels collapse poorly on phones. Use `useIsMobile()` and swap to a stacked layout or drawer on mobile widths. (Pattern documented per AGENTS.md "NEVER tabs on mobile, NEVER nested scrolling.")
- **Demos that prove every pattern in this skill:** [`app/(dev)/demos/resizables/`](../../../app/(dev)/demos/resizables/). Refer to a demo whose route name matches your task before writing new code.

---

## §10 — Quick TypeScript reference (verbatim from `lib/index.ts`)

```ts
import type {
  GroupProps,
  GroupImperativeHandle,
  Layout,                 // { [panelId: string]: number }   — percentages 0..100
  LayoutStorage,          // Pick<Storage, "getItem" | "setItem">
  OnGroupLayoutChange,
  Orientation,            // "horizontal" | "vertical"
  PanelProps,
  PanelImperativeHandle,
  PanelSize,              // { asPercentage: number; inPixels: number }
  OnPanelResize,
  SizeUnit,               // "px" | "%" | "em" | "rem" | "vh" | "vw"
  SeparatorProps,
} from "react-resizable-panels";
```

`MixedSizes` is **not** exported in v4. The replacement is `PanelSize`.
`ImperativePanelHandle` / `ImperativePanelGroupHandle` are **not** exported. Use `PanelImperativeHandle` / `GroupImperativeHandle`.

---

## §11 — Pre-commit self-check (mental walkthrough before opening a PR)

- [ ] No `PanelGroup`, `PanelResizeHandle`, `MixedSizes`, `ImperativePanelHandle` imports.
- [ ] No `direction=`, `autoSaveId=`, `onCollapse=`, `onExpand=`, `order=`, `defaultCollapsed=`.
- [ ] All `defaultSize`, `minSize`, `maxSize`, `collapsedSize` for percent values use `"X%"` strings.
- [ ] Every `<Group>` has an explicit, stable `id`.
- [ ] Every `<Panel>` has an explicit, stable `id`.
- [ ] No `useState` mirroring panel sizes.
- [ ] No `useEffect` reading sizes from refs.
- [ ] No `useState`/`useRef` capturing pre-collapse size — use `panel.collapse()`/`expand()`.
- [ ] `onLayoutChanged` (past tense) used for persistence, not `onLayoutChange`.
- [ ] If SSR: cookie path used (server reads → `defaultLayout` → client wrapper writes). NOT `localStorage`.
- [ ] No `<div>` between `<Group>` and `<Panel>` / `<Separator>`.
- [ ] If using imperative API across the tree: Redux holds intent (boolean), one effect drives `panelRef`. Size stays in the library.
- [ ] Custom Separator has `focus:outline-none` AND explicit styling for `data-[separator=hover|active|dragging]` (not just `hover`).
- [ ] Sidebar `minSize` is `"5%"` or `"8%"`, not 12+ percent. Main panel `minSize` is 20–30%. Fixed rails set `min=max=default` to the same pixel value.
- [ ] Page is a Server Component (no `'use client'` at the top of `page.tsx`). Function is `async`, awaits cookies, returns JSX.
- [ ] Header content goes through `<PageHeader>` — no `<header>` element in the page body.
- [ ] Header icons are `TapTargetButton`s from `components/icons/tap-buttons.tsx`. Their parent flex containers are `gap-0 p-0 space-x-0 space-y-0` — never `gap-1` / `gap-2` / `p-1` / etc. The 44pt outer + 32px inner-disc structure provides all visual spacing.
- [ ] Back nav uses `<ChevronLeftTapButton href="..." variant="transparent" />` — never a separate component. No `-mx-1.5` workaround.
- [ ] Toggle buttons in a cluster use `variant={clusterCollapsed ? "transparent" : "glass"}` so the entire side goes transparent when its panels are all closed.
- [ ] Every `<Handle />` adjacent to a collapsible has `hideWhenCollapsed={["..."]}` listing its collapsible neighbors — prevents drag-to-reopen on a collapsed panel.
- [ ] Cross-component toggles (header button → panel) go through `<PanelControlProvider>` + `<RegisteredPanel>` (Context preserves across portal).
- [ ] Panel content (Sidebar, Editor, etc.) is server-rendered — passed as `children` to `<Panel>`, NOT inlined in a `'use client'` wrapper.
- [ ] Page body wrapper is `<div className="h-full overflow-hidden">` — NO `paddingTop: var(--shell-header-h)` on the outer wrapper (content extends behind the transparent header by design).
- [ ] Each panel surface decides its own top-spacing: scrolling content (chat conversations, message lists) gets NO `pt-`; static or interactive top content (titles, file tabs, terminal tabs, search inputs) gets `pt-[var(--shell-header-h)]` on its outermost element.
- [ ] Cross-portal toggles use `<PanelControlProvider>` + `<RegisteredPanel groupKey="...">` + `<ClientGroup groupKey="...">` so toggles go through `groupRef.setLayout()` and adjacent collapsibles stay independent.
- [ ] No `border-b border-border` on mini-titles inside panels.
- [ ] Header content has a `<BackChevron>` as its leftmost element pointing to the parent route.
- [ ] If panels mount/unmount conditionally with SSR persistence: server reads BOTH the toggle cookie AND the matching combo's layout cookie. `useDefaultLayout`'s `defaultLayout` is NOT used as the Group's `defaultLayout` (hydration trap). See §5 "Mount/unmount panels".

---

## §12 — Source citations (verify when in doubt)

- npm latest: <https://registry.npmjs.org/react-resizable-panels/latest>
- Exports: <https://raw.githubusercontent.com/bvaughn/react-resizable-panels/main/lib/index.ts>
- `Group` types: <https://raw.githubusercontent.com/bvaughn/react-resizable-panels/main/lib/components/group/types.ts>
- `Panel` types: <https://raw.githubusercontent.com/bvaughn/react-resizable-panels/main/lib/components/panel/types.ts>
- `Separator` types: <https://raw.githubusercontent.com/bvaughn/react-resizable-panels/main/lib/components/separator/types.ts>
- Imperative methods: <https://raw.githubusercontent.com/bvaughn/react-resizable-panels/main/lib/global/utils/getImperativePanelMethods.ts>
- Storage key fn: <https://raw.githubusercontent.com/bvaughn/react-resizable-panels/main/lib/components/group/auto-save/getStorageKey.ts>
- Next.js cookie integration page: <https://github.com/bvaughn/react-resizable-panels/tree/main/integrations/next/app>
- v3→v4 migration (CHANGELOG): <https://github.com/bvaughn/react-resizable-panels/blob/main/CHANGELOG.md> (search `# 4.0.0`)
