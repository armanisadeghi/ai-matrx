# Design-System Anchors — AI Matrx Admin

The concrete, real things to reuse instead of inventing. Paths are relative to repo root. When in doubt, grep before building — this list is a starting point, not the full catalogue.

> **Verify before relying.** Components move. If a path 404s, search (`components/official/`, `components/generic-table/`, `app/globals.css`) rather than hand-rolling a replacement.

## Tokens & utilities (`app/globals.css`)

| Need | Use | Never |
|---|---|---|
| Color | semantic classes: `bg-background bg-card bg-muted bg-accent text-foreground text-muted-foreground text-primary border-border` + status `text-destructive/success/warning/info` | raw hex, `bg-zinc-800`, `text-gray-500` |
| Depth / layering | `--elevation-1/2/3` (via `bg-elevation-1` etc.) | random `shadow-2xl` stacks |
| Glass (see below) | `bg-glass` `hover:bg-glass-hover` `active:bg-glass-active` `border border-glass-edge` `backdrop-blur-glass` `backdrop-saturate-glass` `shadow-glass`/`shadow-glass-lg` | hand-rolled `bg-white/10 backdrop-blur-md` |
| Page background | `bg-textured` | flat `bg-white`/`bg-black` |
| Card background | `bg-card` (or `bg-card-textured`) | nested opaque boxes |
| Gradients (sparingly) | `--gradient-1/2/3` | invented purple→blue |
| Full-height page | `.h-page` / `.min-h-page` / `.max-h-page` (auto-subtract `--header-height`, 2.5rem) | `h-screen`, `h-[calc(100vh-40px)]` hardcoded |
| Scrollbars | `.scrollbar-thin` / `.scrollbar-hide` | default chunky bars |
| Safe area (mobile fixed bottom) | `.pb-safe` `.mb-safe` | nothing |

## Glass — *our* glass, not generic frosted

Glass is a first-class part of this app. Use it; just use ours.

- Utility classes (compose directly): `bg-glass border border-glass-edge backdrop-blur-glass backdrop-saturate-glass shadow-glass`. Dark mode flows automatically through the `--matrx-glass-*` tokens.
- `components/ui/GlassContainer.tsx` — configurable glass surface (opacity, blur, glow, shimmer, hover scale) for richer panels.
- `features/shell/components/GlassPortal.tsx` — renders glass into `#glass-layer` at body root to escape `backdrop-filter` stacking-context bugs. Use for docks, floating panels, sheets that must blur content behind them.

## Tables & lists

- `components/generic-table/GenericDataTable.tsx` (+ `GenericTableHeader.tsx`, `GenericTablePagination.tsx`) — reusable data table with **filter + sort + pagination** already built. Reach for this before writing a `<table>`.
- `components/official/unified-list/UnifiedListLayout.tsx` — list layout with filtering/pagination.
- `components/official/card-and-grid/{Card,Grid,List,HorizontalCard}.tsx`, `components/official/cards/{SimpleCard,SectionCard,EmptyStateCard,CardGrid}.tsx` — when cards/boards/galleries are the right tool.

## Layout & responsive

- `components/layout/adaptive-layout/AdaptiveLayout.tsx` — two-column + optional resizable canvas, full-height, stacks on mobile (~950px). The workhorse for app surfaces.
- `components/layout/new-layout/ResponsiveLayout.tsx`, `DesktopLayout.tsx` — alternative shells.
- `components/official/PageTemplate.tsx` — page wrapper (header/sidebar/content).
- `hooks/use-mobile.tsx` → `useIsMobile()` (breakpoint 768px) for branch-on-mobile logic.
- `features/shell/components/header/PageHeader.tsx` — page header / breadcrumbs.
- **Shell-avatar gotcha:** the app shell renders a fixed 44×44 user-menu avatar at the top-right of the viewport. It overlaps anything on your header's right edge. Add `pr-14` to your header row to clear it.

## Sheets & overlays

- `components/official/FloatingSheet.tsx` — sheet from any of 4 sides, mobile-aware, respects header.
- `components/official/FullScreenOverlay.tsx`, `SplitScreenOverlay.tsx`, `bottom-sheet/BottomSheet.tsx`, `MobileOverlayWrapper.tsx`.
- For *opening* overlays (dialogs/sheets/windows via dispatch), use the **overlay-system** skill; for the draggable window frame, the **window-panels** skill.

## Loading / empty / error (never plain "Loading…")

- `components/matrx/LoadingComponents.tsx` — `Small/Medium/Large/FullPageLoading`, `CardLoading`, `TableLoadingComponent`, `MatrxTableLoading`, `FormLoading*`, `SidebarLoading`, `EmptySidebar` (pulsing skeletons).
- `components/official/cards/EmptyStateCard.tsx` — empty state.

## Dialogs & toasts (`window.confirm`/`alert`/`prompt` are banned)

- Imperative confirm: `confirm({...})` from `components/dialogs/confirm/ConfirmDialogHost.tsx` → returns `Promise<boolean>`.
- Inline destructive confirm with busy state: `<ConfirmDialog />` from `@/components/ui/confirm-dialog`.
- Single-string input: `components/dialogs/text-input/TextInputDialog.tsx` (drawer on mobile, dialog on desktop).
- Toast: `toast.success/.error/.info` (sonner) via `providers/toast-context.tsx`.

## Buttons & controls

- `components/official/{IconButton,TextIconButton,ResponsiveIconButtonGroup}.tsx`, `SearchInput.tsx`, `ProTextarea.tsx`, `AdvancedMenu.tsx`, `IconDropdownMenu.tsx`.
- `components/official/mobile-action-bar/{MobileActionBar,MobileFilterDrawer}.tsx` — mobile action surfaces.

## Sibling skills to defer to (don't duplicate them)

- **`ios-mobile-first`** (`.cursor/skills/ios-mobile-first/SKILL.md`) — all mobile mechanics: viewport units, safe areas, touch targets, drawer-not-dialog, single scroll area.
- **`web-design` / `modern-web-design-expert`** — the Tailwind *migration checklist* (fluid `clamp()` type, `@container`, `@starting-style` animations, component wrappers). That's the "how to write conformant CSS" layer; this skill is the "what to build and why" layer.
- **`overlay-system`**, **`window-panels`** — opening/rendering overlays and the window frame.
- Official Next.js/React/Tailwind guide: `~/.arman/rules/nextjs-best-practices/nextjs-guide.md`.
