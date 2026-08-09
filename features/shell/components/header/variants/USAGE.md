# Header Variants — Usage Guide

**Primary reference for `(core)` AppShell routes.** Read this before adding page headers or full-height wrappers. Fixing a non-conforming route? The fix workflow (failure classes, exemplars, mobile rules, browser verification) is the `core-route-headers` skill (`.claude/skills/core-route-headers/SKILL.md`).

## Shared header row

The top row is **shared space**: the shell owns the edges; the route owns the center.

| Zone | Owner | Contents |
|---|---|---|
| Far left | Shell | Hamburger / sidebar toggle |
| Center (`#shell-header-center`) | Route via `<PageHeader>` | Title, back, pickers, primary actions |
| Far right | Shell | Org reminder, canvas toggle, user avatar |

`<PageHeader>` (Server Component) portals children into `#shell-header-center` via `PageHeaderPortal`. Injected content is **one flat row** — transparent root, no `bg-card`, no `border-b`. Use `ChevronLeftTapButton` / `TapTargetButton` for icons.

**One portal is visible.** A broad route layout may pass `fallback` to `PageHeader` / `RouteHeader`; `PageHeaderPortal` hides it whenever a leaf page supplies a task-specific header. Never rely on two headers sharing the 44px slot.

**`<PageHeader>` injects into the CENTER only — it has no left slot.** A back chevron passed as its child renders mid-header, floating over the page. For anything with a back affordance or edge-anchored actions use **`RouteHeader`** (`left` / `center` / `right`), which renders its own `<PageHeader>` internally — **never nest the two** (`<PageHeader><RouteHeader/></PageHeader>` portals twice into the same slot).

**The header is legible over ANY page content.** `.shell-header::before` paints a scrim in the page's own `--background` colour, so it is invisible on flat routes and becomes the substrate wherever hero art/video scrolls under the glass (before it, a bright cover made the back button and the avatar disappear). It sits at `z-index:-1` inside the header's stacking context — below the header's own children, above the page. Don't add per-route header backgrounds to compensate.

**The shell's width is the viewport's, never its content's.** `.shell-header` carries `min-width: 0` because a grid item otherwise refuses to shrink below its content's min-content width — one long `truncate` (i.e. `white-space: nowrap`) title injected by a route stretched the entire header to 528px on a 375px phone and pushed the avatar off-screen. Injected text still needs `min-w-0 truncate`; do not rely on `max-w-*` for this (see the mobile-CSS note in `app/globals.css`: blanket `@media (max-width: 768px)` element defaults live in `@layer base` precisely so utilities win — they used to be unlayered and silently beat every `max-w-*` and every `h-*` on media).

**Never render a page-level toolbar in the body** (`<header border-b bg-card>` with title + refresh + New). That duplicates the shell row, pushes actions behind the avatar (hence `pr-12` hacks), and leaves a dead band at the bottom when combined with header-height subtraction.

Reference routes: `/chat/[conversationId]`, `/tasks`, `/agents/[id]/build`.

Audit: `pnpm check:page-headers` (strict: `pnpm check:page-headers:strict`).

## Body height — `(core)` AppShell

`.shell-main` is pulled up with `margin-top: calc(-1 * var(--shell-header-h))`, so it **already fills the viewport**. Content extends behind the transparent glass header.

**Use `h-full` on the page body wrapper — never `h-page`, `h-[calc(100dvh-var(--header-height))]`, or `calc(100dvh - 2.5rem)`.** Subtracting the header again creates an empty strip at the bottom.

| Body type | Wrapper | Top spacing |
|---|---|---|
| Scrolling surface (chat, agent run) | `h-full overflow-hidden` | None on wrapper — content scrolls behind the glass header |
| Resizable panels (`/tasks`, agent build) | `h-full overflow-hidden` | Per-panel `pt-[var(--shell-header-h)]` only where static top UI must clear the header (file tabs, titles) |
| Single full-page editor (`/tasks/[id]`) | `h-full overflow-hidden` + `paddingTop: var(--shell-header-h)` on wrapper | Whole surface starts below the header |

Sub-toolbars **below** the header zone (filters, search) are fine. Forbidden: a **page title bar** in the body.

**Exceptions:** `/administration/*` and `(transitional)`/`(legacy)` `ResponsiveLayout` — content sits below the header, not behind it. There, `.h-page` / `calc(100dvh - var(--header-height))` is correct. Do not apply those wrappers to `(core)` routes.

## Route pages — required pattern

```tsx
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

export default function MyPage() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0">
          <ChevronLeftTapButton href="/back" variant="transparent" ariaLabel="Back" />
          <h1 className="ml-2 text-sm font-medium text-foreground truncate">My Page</h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        {/* page body — no faux headers, no header-height calc */}
      </div>
    </>
  );
}
```

Center injection zone rules:
- **Exact shell header height** — one flat row (`text-sm` title + tap targets).
- **Transparent root** — no `bg-card`, borders, or extra padding on the inject row.
- **Tap targets** — `ChevronLeftTapButton` / `TapTargetButton`; don't wrap them in extra `p-*` / `gap-*`.
- Use `HeaderStructured` / variants only when you need dropdown center, pills, or tabs — not for a simple back + title row.

---

## Setup

```tsx
// Import the CSS once in your layout or globals:
import "@/components/header-variants/header-variants.css";
```

All variants are `"use client"` components designed to be passed as children to `<PageHeader>`, which portals them into the header center slot.

---

## Variant 2 — Structured

Back + title + dropdown + responsive actions.

```tsx
import { PageHeader } from "@/components/PageHeader";
import { HeaderStructured, type HeaderAction } from "@/components/header-variants";

const actions: HeaderAction[] = [
  { icon: "Plus",              label: "New Item",  onPress: () => {} },
  { icon: "SlidersHorizontal", label: "Filter",    onPress: () => {} },
  { icon: "Trash2",            label: "Delete",    onPress: () => {}, destructive: true },
];

// Simple title + actions
<PageHeader>
  <HeaderStructured back title="Inventory" actions={actions} />
</PageHeader>

// Dropdown instead of static title
<PageHeader>
  <HeaderStructured
    dropdown={{
      options: [
        { label: "Grid",   value: "grid",   icon: "LayoutGrid" },
        { label: "List",   value: "list",   icon: "List" },
        { label: "Kanban", value: "kanban", icon: "Columns3" },
      ],
      selected: currentView,
      onSelect: setCurrentView,
    }}
    actions={actions}
  />
</PageHeader>
```

---

## Variant 3 — Toggle

Two-way toggle (like Apple Notes).

```tsx
import { HeaderToggle } from "@/components/header-variants";

<PageHeader>
  <HeaderToggle
    back
    options={[
      { icon: "StickyNote", label: "Notes",   value: "notes" },
      { icon: "Folder",     label: "Folders", value: "folders" },
    ]}
    active={view}
    onChange={setView}
    actions={[{ icon: "Search", label: "Search", onPress: openSearch }]}
  />
</PageHeader>
```

---

## Variant 4 — Icon & Title

Branded center lockup.

```tsx
import { HeaderIconTitle } from "@/components/header-variants";

// Minimal — no back, no actions
<PageHeader>
  <HeaderIconTitle icon="LayoutDashboard" title="Dashboard" />
</PageHeader>

// Full
<PageHeader>
  <HeaderIconTitle
    back
    icon="Settings"
    title="Settings"
    actions={[{ icon: "RotateCcw", label: "Reset All", onPress: handleReset }]}
  />
</PageHeader>
```

---

## Variant 5 — Pills

Four category pills. Fills the full zone — no back or actions.

```tsx
import { HeaderPills } from "@/components/header-variants";

<PageHeader>
  <HeaderPills
    options={[
      { icon: "Layers",        label: "All",   value: "all", badge: 12 },
      { icon: "MessageCircle", label: "Msgs",  value: "msgs" },
      { icon: "SquareCheck",   label: "Tasks", value: "tasks", badge: 3 },
      { icon: "File",          label: "Files", value: "files" },
    ]}
    active={category}
    onChange={setCategory}
  />
</PageHeader>
```

---

## Variant 6 — Tabs

Three underline tabs. Fills the full zone — no back or actions.

```tsx
import { HeaderTabs } from "@/components/header-variants";

<PageHeader>
  <HeaderTabs
    options={[
      { label: "Recent",  value: "recent", badge: 5 },
      { label: "Starred", value: "starred" },
      { label: "Archive", value: "archive" },
    ]}
    active={filter}
    onChange={setFilter}
  />
</PageHeader>
```

---

## Using Shared Primitives Standalone

You can use the building blocks independently:

```tsx
import { GlassButton, BottomSheet, GlassDropdown } from "@/components/header-variants";

// Glass button anywhere (44px tap target, 30px glass inner)
<GlassButton icon="Bell" onClick={toggleNotifications} ariaLabel="Notifications" />

// Bottom sheet anywhere
<BottomSheet
  open={isOpen}
  onClose={() => setOpen(false)}
  actions={myActions}
  title="Choose an action"
/>

// Glass dropdown on any trigger
<div style={{ position: "relative" }}>
  <button onClick={() => setOpen(true)}>Open menu</button>
  <GlassDropdown
    mode="actions"
    actions={myActions}
    open={isOpen}
    onClose={() => setOpen(false)}
    align="left"
  />
</div>
```

---

## Design Principles Enforced

| Principle | How it's enforced |
|---|---|
| No background on header | All variant roots have `background: transparent !important` |
| Glass only on interactive children | Only `.shell-glass`, `.hdr-glass-btn-inner`, and explicit glass classes carry `backdrop-filter` |
| 44×44 tap targets | `.hdr-glass-btn` is always 2.75rem transparent; inner is 1.875rem glass |
| Mobile → bottom sheet | `HeaderActions` renders `BottomSheet` on `<lg`, inline on `lg+` |
| Desktop → glass dropdown | Overflow actions use `GlassDropdown` positioned below trigger |
| Token consistency | All colors, shadows, blurs reference `--shell-*` tokens from `shell.css` |
| Spring physics | All interactive transitions use `--shell-ease-spring` |
| Nav degrades in three stages | `RouteModeNav` measures and steps all icon+text → active icon+text with inactive icons → one menu; hidden measurers carry `w-max`, fit test reserves a 32px flank gutter, desktop uses a dropdown, and mobile uses a bottom sheet |
| Selection visible in both themes | Selected nav items use `--shell-nav-selected-bg/-text/-shadow` + `--shell-nav-unselected-text` — **never** `--matrx-glass-bg-active`, which disappears on light-mode glass |
| Icon-only items name themselves via `NavItemTooltip` | `NavTooltipProvider` + `NavItemTooltip` (`header/NavItemTooltip.tsx`): fast styled tooltip below the pill, instant when scanning siblings, zero layout shift. Never a native `title=` (slow, unstyled, doubles up), never a hover-expanding inline label (labels differ in width, so expansion always shifts the pill). Labels CSS-hidden below a breakpoint gate the tooltip with `contentClassName` (e.g. `xl:hidden`) |

---

## File Tree

```
header-variants/
├── index.ts                    # Barrel exports
├── types.ts                    # Shared TypeScript types
├── header-variants.css         # All component styles (import once)
├── shared/
│   ├── LucideIcon.tsx          # Dynamic icon from string name
│   ├── GlassButton.tsx         # Atomic 44px tap-target + glass inner
│   ├── HeaderBack.tsx          # Back chevron
│   ├── HeaderActions.tsx       # Responsive actions (desktop inline / mobile sheet)
│   ├── BottomSheet.tsx         # iOS-style glass bottom drawer
│   └── GlassDropdown.tsx       # Desktop floating glass menu
└── variants/
    ├── HeaderStructured.tsx    # V2: back + title/dropdown + actions
    ├── HeaderToggle.tsx        # V3: two-way toggle center
    ├── HeaderIconTitle.tsx     # V4: icon + title lockup center
    ├── HeaderPills.tsx         # V5: four pill buttons
    └── HeaderTabs.tsx          # V6: three underline tabs
```
