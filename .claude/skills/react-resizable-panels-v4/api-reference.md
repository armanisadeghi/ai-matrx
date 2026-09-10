# react-resizable-panels v4 — API reference

## Contents

- §1 — API reference (verbatim from source): `<Group>`, `<Panel>`, `<Separator>`, imperative handles, hooks
- §10 — Quick TypeScript reference (verbatim from `lib/index.ts`)

## §1 — API reference (verbatim from source)

### `<Group>` — replaces v3 `<PanelGroup>`

```tsx
import { Group, type GroupProps } from "react-resizable-panels";
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `id` | `string \| number` | `useId()` fallback | **Pass an explicit, stable `id` always.** Storage key uses it. |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | (v3 was `direction`) |
| `defaultLayout` | `{ [panelId: string]: number }` (percentages 0..100) | undefined | Pair with `onLayoutChanged` for persistence. **The server render treats a `0` entry as missing** — that panel paints at its `defaultSize` and snaps to 0 on client mount (see collapse-and-toggle.md, server paint). |
| `onLayoutChange` | `(layout) => void` | undefined | Fires every pointer move during drag. **Avoid for persistence — use the past-tense one.** |
| `onLayoutChanged` | `(layout, meta: LayoutChangedMeta) => void` | undefined | Fires on pointer-up, resize keys, imperative `setLayout`, constraint recompute, and initial mount; `meta.isUserInteraction` is `true` only for a separator drag or key. **Use this for cookie writes.** |
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

In this codebase: use `ResizableHandle` from [`components/ui/resizable.tsx`](../../../components/ui/resizable.tsx) — a host re-export of `@ai-matrx/design-system` (orientation-aware cursor, thickness via `size="xs".."4xl"`, 44px grab target on touch) — OR import the shared `Handle` from [`features/resizable-panels/Handle.tsx`](../../../features/resizable-panels/Handle.tsx), which is orientation-aware and adds `hideWhenCollapsed` for `<PanelControlProvider>` pages. Don't reinvent the class string in every demo.

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

## §10 — Quick TypeScript reference (verbatim from `lib/index.ts`)

```ts
import type {
  GroupProps,
  GroupImperativeHandle,
  Layout,                 // { [panelId: string]: number }   — percentages 0..100
  LayoutChangedMeta,      // { isUserInteraction: boolean } — 2nd arg of onLayoutChanged
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
