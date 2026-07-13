---
name: core-route-headers
description: Bring any (core) route into conformance with the AppShell header + body-height + mobile doctrine — the repeatable fix recipe for the campaign to kill faux in-body headers, banned viewport-height calcs, avatar collisions, and mobile menus that vanish instead of collapsing into bottom sheets. Use whenever a task touches a (core) route's header, page chrome, title bar, back button, breadcrumbs, sub-route nav, body wrapper height, or mobile header behavior; whenever a page's buttons hide behind the shell avatar or float over the glass header; on "fix the header on /X", "route conformance", "PageHeader", "shell header", "h-page / calc(100dvh…) on a core route", or a fleet assignment from the header-conformance campaign. NOT for /administration/* or (transitional)/(legacy) routes — those sit BELOW the header by design.
---

# core-route-headers — (core) shell header + page conformance

**Read `features/shell/components/header/variants/USAGE.md` first** — it is the canonical spec for the injection zone, variants, and body-height table. This skill is the *fix workflow*: how to classify a broken route, which exemplar to copy, and how to verify in the browser on desktop AND mobile.

## The mental model (one paragraph)

The shell header is a **transparent glass strip** over the page. The shell owns the far edges (hamburger left, org/canvas/avatar right); the route owns ONLY the center zone via `<PageHeader>` (`features/shell/components/header/PageHeader.tsx` — Server Component, portals into `#shell-header-center`; `desktop=` / `mobile=` props for per-breakpoint content). `.shell-main` is pulled up under the header with a negative margin, so the page body **already fills the viewport** and content scrolls *behind* the glass. Everything broken in this repo is one of two sins: rendering header chrome **in the body**, or **subtracting the header height** from the body.

## Gold standards — copy these, don't invent

| Route | What it proves | Key files |
|---|---|---|
| `/agents/all` | List page: `PageHeader` + injected list header, body scrolls behind glass | `app/(core)/agents/all/page.tsx`, `features/agents/components/shell/AgentsListHeader.tsx` |
| `/agents/[id]/build` | The masterpiece: back tap-target + `[id]` dropdown selector + measurement-collapsing mode nav + save/options — **no title/description block** | `features/agents/components/shared/AgentHeader.tsx`, `AgentModeController.tsx` |
| `/chat/[conversationId]` | Scroll-behind-glass body + left/right icons + **route-injected sidebar menu** (no double menu) | `app/(core)/chat/[conversationId]/page.tsx`, `features/shell/constants/route-menu-registry.ts` |
| `/organizations/[orgId]/scopes/**` | Best breadcrumb nav: full-path breadcrumb, per-level sibling dropdowns, mobile drawer — mounted ONCE at the layout | `features/scope-system/components/ScopesRouteHeader.tsx`, mounted in `app/(core)/organizations/[orgId]/layout.tsx` |
| `/tasks` | Resizable panels: per-panel `pt-[var(--shell-header-h)]` only where static top UI must clear the glass | `app/(core)/tasks/` |

**Anti-examples** (study, then kill the pattern):
- `app/(core)/cms/page.tsx` — the full disease: `"use client"` page, in-body header bar (`bg-background/80 backdrop-blur` — invisible to the audit script), `h-[calc(100dvh-var(--shell-header-h))]`, title in the body, buttons colliding with the avatar, spinner-only loading.
- `app/(core)/cms/html-pages/page.tsx` — a *half* fix: `PageHeader` used, but hardcoded `pt-12` (not `var(--shell-header-h)`), bespoke `ml-auto` action row instead of `HeaderActions` (no mobile bottom-sheet collapse), spinner fallback.

## Failure classes — classify before you touch anything

1. **Faux in-body header** — a body-rendered bar with title + actions (`border-b` + `bg-card`/`bg-background/*`). Move controls into `<PageHeader>`; delete the bar.
2. **Banned height math** — `h-[calc(100dvh-…)]`, `h-page`, `h-screen`, `min-h-screen` on a (core) body. Replace with `h-full overflow-hidden` (see USAGE.md body-type table).
3. **Title/description block in a dashboard page** — marketing copy inside app chrome. **Delete it**; the header center carries a `text-sm` title at most.
4. **Missing top clearance for floating/static content** — content that must NOT slide behind the glass (grid of cards with action buttons, sticky toolbars) needs `pt-[var(--shell-header-h)]` (never a hardcoded `pt-12`); freely-scrolling content gets **no** top padding so it floats behind the glass. This is the `/agents/all` mobile bug: card buttons float up into the header.
5. **Desktop actions vanish on mobile** — `hidden lg:flex` with no mobile counterpart. The rule: desktop actions collapse into one or two **bottom sheets** on mobile (`HeaderActions` in `components/header-variants/` renders `BottomSheet` below `lg`; or `components/official/bottom-sheet/BottomSheet.tsx` directly). `features/agents/components/shared/AgentHeaderMobile.tsx` exists but is commented out in `AgentHeader.tsx` — that class of gap.
6. **Double menus** — a page-level nav next to the sidebar. Large routes register ONE menu in `features/shell/constants/route-menu-registry.ts` (desktop `RouteMenuSlot` + `MobileRouteMenuSlot` come free).
7. **Avatar collision** — `ml-auto` / `justify-between` actions in the body drifting behind the fixed avatar (the old `pr-14` hack). Fixed automatically by moving actions into the bounded center zone.

## Fix recipe by route archetype

- **List/gallery page** → copy `/agents/all`: `PageHeader` with a small injected header (search / filters / New), body `h-full overflow-hidden`, scroll container inside, floating grid content gets `pt-[var(--shell-header-h)]` if it has interactive elements at the top.
- **Detail/editor `[id]` page** → copy `/agents/[id]/build`: `ChevronLeftTapButton` back (from `components/icons/tap-buttons.tsx`), entity **dropdown** (not a static title) for `[id]` routes, actions right. No title/description prose.
- **Sub-mode family** (build/run/templates…) → `RouteModeNav` (`features/shell/components/header/RouteModeNav.tsx`) — measurement-driven full → icons → menu collapse. It is the ONE control for mode switching; never pair it with a second selector.
- **Drill-down hierarchy** (org → type → item…) → `ScopesRouteHeader` pattern: one layout-level breadcrumb header, pathname-gated, per-level sibling dropdowns, mobile drawer.
- **Actions overflow** → `HeaderStructured` / `HeaderActions` (see USAGE.md variants) — inline on `lg+`, glass dropdown for overflow, `BottomSheet` on mobile.
- **Right slot** (save status, page-scoped icons) → `PageHeaderRightPortal` (`features/shell/components/header/PageHeaderRightPortal.tsx`).

Per-breakpoint content: `<PageHeader desktop={…} mobile={…} />`. Mobile never gets *nothing* — at minimum back + title + one sheet trigger holding the desktop actions.

## Detection — finding offenders

```bash
pnpm check:page-headers            # faux-header markers (KNOWN NARROW — misses bg-background/* bars)
grep -rln "calc(100dvh\|calc(100vh\|h-screen\|h-page" app/\(core\) --include="*.tsx"
grep -rLn "PageHeader" <route dir>  # route family never injecting the header
grep -rn "pt-12\|pt-10\|pt-8" <route dir>  # hardcoded header offsets → var(--shell-header-h)
```
Find a new faux-header class combo? **Add it to `FAUX_HEADER_MARKERS` in `scripts/check-page-headers.ts`** in the same change — the guard must learn what you learned.

## Verify in the browser — mandatory, both viewports

1. Reuse a running dev server (`pnpm dev:status`) or `preview_start`; log in via `/login` with `admin@admin.com` / `Password1234#`.
2. Navigate to the route. **Desktop (1280×800):** no in-body title bar; actions in the header center; nothing behind the avatar; no dead strip at the bottom; content scrolls behind the glass.
3. **Mobile (375×812 via `resize_window`):** every desktop action reachable (bottom sheet, not vanished); no interactive element floating into the glass header; single scroll area.
4. Screenshot both. A visible flaw in your own screenshot is a failure — fix it, don't present it.

## Do not break

- `/administration/*` and `(transitional)`/`(legacy)` sit **below** the header — `h-page`/header-calc is *correct* there. Never "fix" them with this recipe.
- The rules in `app/(core)/_read_first_route_rules/` and the scaffold in `.cursor/skills/new-route-scaffold/SKILL.md` (SSR, hydrators, skeleton `loading.tsx` — no spinners).
- Mobile rules in `.cursor/skills/ios-mobile-first/SKILL.md` (`h-dvh` not `h-screen` for non-shell pages, `pb-safe`, drawer-not-dialog).
- Lucide only, no emojis, semantic color classes, component-library loading states.
