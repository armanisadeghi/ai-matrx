# SSR Shell Layout - Implementation Plan

## Overview

Create a brand-new, fully isolated route group `(ssr)` with a 100% server-rendered shell layout following the "Static-First Shell" architecture. This replaces all client-side layout logic with CSS-only state management, glassmorphic design tokens, and atomic Suspense boundaries.

**Route structure:** `removed (ssr) route group — dashboard` → accessible at `/dashboard` path (we'll use a different path to avoid collision - see below)

**Collision avoidance:** Since `/dashboard` already exists under `(authenticated)`, we'll use the route prefix `ssr` as a segment: `app/(dev)/demos/dashboard/page.tsx` → accessible at `/ssr/dashboard`. This keeps it fully isolated.

---

## File Structure

```
removed (ssr) route group — 
├── layout.tsx                    # Root SSR layout - server component, auth + shell
├── ssr/
│   └── dashboard/
│       ├── page.tsx              # Dashboard page - server component
│       └── components/
│           ├── DashboardGrid.tsx  # Feature icons grid (server)
│           ├── StatsCards.tsx     # Stats with Suspense (tiny client island)
│           └── ActivityFeed.tsx   # Recent activity (server)
├── _components/                  # Shell components (underscore = not a route)
│   ├── Sidebar.tsx               # Desktop sidebar (server component)
│   ├── Header.tsx                # Header wrapper (server component)
│   ├── MobileDock.tsx            # iOS-style bottom dock (server component)
│   ├── MobileSideSheet.tsx       # Off-canvas mobile nav (server component)
│   ├── AuthIsland.tsx            # Glass auth button (server, tiny client swap)
│   ├── NavItem.tsx               # Single nav link with active pill (server)
│   └── ThemeScript.tsx           # Inline <script> for FOUC prevention (server)
├── shell.css                     # All shell-specific CSS (glass, animations, geometry)
└── nav-data.ts                   # Navigation data (pure data, no React/JSX)
```

---

## Architecture Decisions

### 1. CSS-Only State Management (Zero-JS Shell)

**Sidebar Toggle (Desktop):**
- Hidden `<input type="checkbox" id="shell-sidebar-toggle" />` at shell root
- `<label htmlFor="shell-sidebar-toggle">` as the toggle button (the brand icon)
- Parent container uses `:has(#shell-sidebar-toggle:checked)` to switch between collapsed/expanded
- CSS custom properties change based on checked state
- Sidebar width transitions via `transition: width 350ms cubic-bezier(0.34, 1.56, 0.64, 1)`

**Mobile Side Sheet:**
- Hidden `<input type="checkbox" id="shell-mobile-menu" />` at shell root
- `<label htmlFor="shell-mobile-menu">` as hamburger trigger
- Side sheet slides in from left via CSS transform
- Backdrop overlay via `::before` pseudo-element on the checkbox container
- Auto-close via clicking the backdrop label

**Why this works:** The `:has()` selector is supported in all modern browsers (Chrome 105+, Safari 15.4+, Firefox 121+). Combined with CSS transitions, this gives us full interactive state without any React state or useEffect.

### 2. Glassmorphic Design System

**New CSS variables** (prefixed `--shell-` to avoid conflicts):
```css
--shell-glass-bg: rgba(255, 255, 255, 0.06)
--shell-glass-bg-hover: rgba(255, 255, 255, 0.12)
--shell-glass-border: rgba(255, 255, 255, 0.08)
--shell-glass-blur: 12px
--shell-glass-saturate: 1.4
--shell-pill-bg: rgba(59, 130, 246, 0.15)  /* active route tint */
--shell-pill-border: rgba(59, 130, 246, 0.25)
```

Dark mode overrides in `.dark` selector.

**Applied to:**
- Individual header child nodes (NOT the header wrapper - it stays transparent)
- Sidebar nav items (hover states)
- Mobile dock
- Auth island button
- Active route pill (exception: subtle color tint)

### 3. Layout Geometry (CSS Custom Properties)

```css
--shell-header-h: 3rem;
--shell-sidebar-w: 3.5rem;        /* collapsed */
--shell-sidebar-w-expanded: 14rem; /* expanded */
--shell-dock-h: 4rem;             /* mobile bottom dock */
--shell-dock-bottom: 0.75rem;     /* dock floating offset */
--shell-dock-mx: 0.5rem;          /* dock horizontal margin */
```

### 4. Auth Island (Server-Rendered)

- Server component reads auth via `createClient()` + `getUser()`
- Renders static HTML: `({Icon} Login)` or `({Avatar} UserName)`
- Glass container never changes size/shape
- Icon left, text right orientation
- For avatar: Next.js `<Image>` with the user's picture URL
- A tiny client component (`AuthIslandClient.tsx`) would only be needed if we want logout functionality — for now we link to `/login` or `/settings/profile`

### 5. Active Route "Magic Pill"

- Each `NavItem` checks `pathname` server-side (from `headers()`)
- Active item gets a special class with the tinted background pill
- **View Transitions API** for animated pill movement between routes:
  - Active item gets `style={{ viewTransitionName: 'active-nav-pill' }}`
  - CSS `@view-transition { navigation: auto; }` enables cross-document transitions
  - Pill slides with spring easing: `cubic-bezier(0.34, 1.56, 0.64, 1)`

### 6. Responsive Strategy (CSS Media Queries Only)

- `@media (min-width: 1024px)` → Desktop: sidebar + header
- `@media (max-width: 1023px)` → Mobile: dock + header + side sheet
- No JavaScript viewport detection
- CDN-cacheable (single HTML response for all viewports)

### 7. Z-Layer Architecture

```
z-50: Mobile side sheet overlay
z-40: Header child nodes, Mobile dock
z-30: Sidebar
z-10: Main content (scrolls behind everything)
```

### 8. Independent Scroll Contexts

- `<html>` / `<body>`: `overflow: hidden` (inherited from root layout)
- Main content area: `overflow-y: auto` with its own scroll context
- Sidebar middle section: Independent scroll for nav overflow
- All fixed elements (header nodes, dock, sidebar) are `position: fixed`

---

## Detailed Component Specs

### `layout.tsx` (Server Component)
- Reads auth via Supabase server client
- Reads `pathname` from headers for active route detection
- Renders the full shell structure:
  - Hidden checkboxes for CSS state
  - Theme inline script
  - Desktop sidebar
  - Header (transparent wrapper with glass child nodes)
  - Mobile dock
  - Mobile side sheet
  - Main content slot (`{children}`)
- **NO client providers** (no Redux, no ThemeProvider, no Providers wrapper)
- Imports `shell.css` for all shell styles

### `Sidebar.tsx` (Server Component)
- Full-height fixed sidebar
- Three sections:
  - **Top (Brand):** Toggle label (layout toggle icon) + "AI Matrx" logo text (visible when expanded)
  - **Middle (Nav):** Scrollable nav items, centered icons when collapsed
  - **Bottom (Footer):** Settings icon, centered when collapsed
- Content-push: when expanded, displaces main content via CSS grid/margin
- Same background as page (transparent/bg-textured) with no border when collapsed
- Icons: 20px Lucide icons, perfectly centered in collapsed rail

### `Header.tsx` (Server Component)
- Completely transparent container
- Safe-area aware (padding-top for mobile notch)
- Structure:
  - **Left:** Reserved (empty on desktop where sidebar toggle handles it; hamburger on mobile)
  - **Center:** Empty `<div id="shell-header-center" />` — injection zone for route pages
  - **Right:** Auth Island
- Glass effect on individual child nodes only
- When sidebar collapsed: ONLY toggle (left) + auth (right) visible. No other icons.

### `MobileDock.tsx` (Server Component)
- Bottom-fixed floating glass dock
- 6 primary route icons (Dashboard, Chat, Notes, Tasks, Projects, Files)
- Full-width with minimal horizontal gap from edges
- Active icon shows glass pill background
- Spring animation on active switch via View Transitions
- Content scrolls behind it

### `MobileSideSheet.tsx` (Server Component)
- Off-canvas from left, triggered by hamburger checkbox
- Mirrors full desktop nav inventory
- CSS-driven slide + overlay
- Z-indexed above content

### `AuthIsland.tsx` (Server Component)
- Immutable glass container (rounded-full)
- Layout: icon (left) + text (right)
- Pre-auth: Lucide `LogIn` icon + "Login" text, links to `/login`
- Post-auth: User avatar (or User icon fallback) + display name
- Links to `/settings/profile` when authenticated

### `NavItem.tsx` (Server Component)
- Renders an `<a>` tag with Lucide icon
- Active state: tinted pill background with `viewTransitionName`
- Hover: glass hover effect via CSS `hover:scale-105 active:scale-95`
- Tooltip on collapsed sidebar (CSS `:hover` + pseudo-element or `title` attr)

### `shell.css`
- All `--shell-*` custom properties
- Glass utility classes: `.shell-glass`, `.shell-glass-pill`, `.shell-glass-node`
- Sidebar state via `:has(#shell-sidebar-toggle:checked)`
- Mobile state via `:has(#shell-mobile-menu:checked)`
- View transition configuration
- Spring easing curves
- iOS tactile feedback (scale transforms)
- Responsive breakpoints
- Z-layer stacking
- Independent scroll contexts

### `nav-data.ts`
- Pure TypeScript data (no JSX, no React imports)
- Icon names as strings (mapped to Lucide components in NavItem)
- Navigation items: `{ label, href, iconName, section, dockOrder? }`
- Exported arrays: `primaryNavItems`, `adminNavItems`, `dockItems`

---

## Dashboard Page (`ssr/dashboard/page.tsx`)

Server component that renders:
1. **Feature Grid:** iOS-style squircle icons from navigation data (all server-rendered)
2. **Quick Access Cards:** 3 horizontal cards for key workflows
3. **Activity Feed:** Recent features/updates (static data, server-rendered)
4. **Stats Section:** Wrapped in `<Suspense>` with a tiny client island that fetches user stats
5. **User Profile Card:** Server-rendered from auth data (name, email, avatar)

Only the stats fetching uses a client component — everything else is pure server HTML.

---

## Proxy Consideration

The current `proxy.ts` matcher will catch `/ssr/dashboard` and require auth. This is correct — authenticated users will be able to access it. No proxy changes needed.

---

## What This Does NOT Touch

- No changes to `(authenticated)` layout or any existing components
- No changes to `globals.css` (all new CSS in `shell.css`)
- No changes to Redux, Providers, or any existing state management
- No changes to navigation-links.tsx (we create our own `nav-data.ts`)
- No changes to proxy.ts or middleware

---

## Implementation Order

1. Create `shell.css` with all CSS custom properties, glass effects, state selectors, animations
2. Create `nav-data.ts` with navigation items (pure data)
3. Create `NavItem.tsx` (server component)
4. Create `AuthIsland.tsx` (server component)
5. Create `Sidebar.tsx` (desktop sidebar)
6. Create `Header.tsx` (transparent header)
7. Create `MobileDock.tsx` (bottom dock)
8. Create `MobileSideSheet.tsx` (off-canvas nav)
9. Create `layout.tsx` (assembles everything)
10. Create dashboard page components (DashboardGrid, ActivityFeed, StatsCards)
11. Create `ssr/dashboard/page.tsx` (assembles dashboard)
12. Test, verify no client-side JS in shell, verify isolation

---

## Key Constraints Checklist

- [ ] 100% server-rendered shell (no "use client" on layout components)
- [ ] CSS-only sidebar toggle (`:has(:checked)` pattern)
- [ ] CSS-only mobile menu (same pattern)
- [ ] Glassmorphic design on all interactive nodes
- [ ] No solid backgrounds (all translucent glass)
- [ ] Transparent header container (glass on children only)
- [ ] Active route pill with View Transitions API
- [ ] iOS-grade spring easing on all transitions
- [ ] Tactile hover/active scale transforms
- [ ] Independent scroll contexts
- [ ] 6 icons in mobile dock, no text
- [ ] Auth island: immutable glass container, icon left + text right
- [ ] No impact on existing `(authenticated)` routes
- [ ] Separate CSS file (shell.css) with `--shell-*` prefix
- [ ] Lucide React only for icons
