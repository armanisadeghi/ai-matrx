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

## Where the rest of this skill lives (read only the branch your task hits)

- **Looking up a prop, imperative method, hook, exported type, or styling a custom `<Separator>`** → read [api-reference.md](api-reference.md) (§1 + §10).
- **A button/toolbar/header toggle that collapses or expands a panel, or any cross-portal toggle** → read [collapse-and-toggle.md](collapse-and-toggle.md) (§4 + `<PanelControlProvider>` / `setLayout` pivot trap).
- **Panels that mount/unmount (not just collapse), with or without SSR persistence** → read [conditional-panels.md](conditional-panels.md) (§5 + the hydration-safe two-cookie shape).
- **Building a VSCode-style nested shell or an Apple Mail / Notes multi-sidebar layout** → read [layout-recipes.md](layout-recipes.md) (§6 + §7).
- **Composing the page body under the shell header: top spacing per panel, `<PageHeader>` content** → read [page-shell-chrome.md](page-shell-chrome.md).

---

## §1 — API reference (verbatim from source)

Prop tables for `<Group>` / `<Panel>` / `<Separator>`, the required custom-Separator CSS, imperative handles, and the full hook export list.

**Looking up a prop, a handle method, or styling a custom Separator → read [api-reference.md](api-reference.md).**

---

## §2 — The smallest possible example (no persistence)

A 2-panel split. **Renders directly from a Server Component** — no `'use client'` wrapper needed because no callback props.

```tsx
// app/(dev)/demos/resizables/00-baseline/page.tsx
// SERVER COMPONENT. No 'use client'.
import { Group, Panel, Separator } from "react-resizable-panels";

export default function Page() {
  return (
    <div className="h-full overflow-hidden">
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
    <div className="h-full overflow-hidden">
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

The library remembers pre-collapse size itself (`panel.collapse()` / `panel.expand()`); Redux holds only intent; an icon flip mirrors only a boolean from `onResize`.

**Any collapse/expand toggle → read [collapse-and-toggle.md](collapse-and-toggle.md).**

---

## §5 — Conditional panels (mount/unmount, not just collapse)

`useDefaultLayout({ id, panelIds })`, the cookie storage adapter, and per-combination storage keys.

**Panels that mount/unmount → read [conditional-panels.md](conditional-panels.md).**

---

## §6 — VSCode-style nested layout

## §7 — Apple Mail / Notes multi-sidebar layout

Worked shells plus the rules for nesting Groups.

**Building either layout → read [layout-recipes.md](layout-recipes.md).**

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

### `<PageHeader>` rules (non-negotiable)

**Deciding a panel's top spacing or writing `<PageHeader>` content → read [page-shell-chrome.md](page-shell-chrome.md).**

### Cross-portal panel control via `<PanelControlProvider>` — and why it uses `setLayout`, NOT `panel.collapse()`

**Any header/toolbar toggle reaching panels in another subtree → read [collapse-and-toggle.md](collapse-and-toggle.md).**

### Mount/unmount panels (different beast — and a hydration trap)

**Conditional panels with SSR persistence → read [conditional-panels.md](conditional-panels.md).**

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
- **Mobile:** resizable panels collapse poorly on phones. Use `useIsMobile()` and swap to a stacked layout or drawer on mobile widths. (Pattern documented per CLAUDE.md "NEVER tabs on mobile, NEVER nested scrolling.")
- **Demos that prove every pattern in this skill:** [`app/(dev)/demos/resizables/`](../../../app/(dev)/demos/resizables/). Refer to a demo whose route name matches your task before writing new code.

---

## §10 — Quick TypeScript reference (verbatim from `lib/index.ts`)

**Need an exported type name → read [api-reference.md](api-reference.md).**

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
