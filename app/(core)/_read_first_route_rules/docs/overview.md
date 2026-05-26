Here is a comprehensive breakdown of everything found.

---

## Directory Structure of `features/shell/`

```
features/shell/
├── components/
│   ├── DeferredShellData.tsx
│   ├── GlassPortal.tsx
│   ├── IconButton.tsx
│   ├── NavActiveSync.tsx
│   ├── ShellIcon.tsx
│   ├── ThemeScript.tsx
│   ├── VisualViewportSync.tsx
│   ├── controls/
│   │   ├── SidebarAdminIndicatorToggle.tsx
│   │   ├── SidebarEnvToggle.tsx
│   │   └── SidebarVoicePadToggle.tsx
│   ├── dev/
│   │   └── DevPerfOverlay.tsx
│   ├── dock/
│   │   ├── MobileDock.tsx
│   │   ├── MobileDockItems.tsx
│   │   ├── MobileDockShell.tsx
│   │   └── MobileDockVoiceButton.tsx
│   ├── header/
│   │   ├── Header.tsx
│   │   ├── PageHeader.tsx
│   │   ├── PageHeaderPortal.tsx
│   │   ├── header-left-menu/
│   │   │   └── HamburgerButton.tsx
│   │   ├── header-right-menu/
│   │   │   ├── AdminIndicatorMenuItem.tsx
│   │   │   ├── LinkMenuItem.tsx
│   │   │   ├── MenuGroup.tsx
│   │   │   ├── NotificationsMenuItem.tsx
│   │   │   ├── OverlayMenuItem.tsx
│   │   │   ├── SignOutMenuItem.tsx
│   │   │   ├── ThemeToggleMenuItem.tsx
│   │   │   ├── UserMenuPanel.tsx
│   │   │   ├── UserMenuTrigger.tsx
│   │   │   ├── UserProfileHeader.tsx
│   │   │   ├── menuIconRegistry.ts
│   │   │   ├── menuItemClass.ts
│   │   │   └── userMenuItems.constants.ts
│   │   ├── not-used/
│   │   │   ├── AuthIsland.tsx
│   │   │   ├── HamburgerIsland.tsx
│   │   │   └── UserMenuIsland.tsx
│   │   └── variants/
│   │       ├── USAGE.md
│   │       ├── header-variants.css
│   │       ├── index.ts
│   │       ├── types.ts
│   │       ├── shared/
│   │       │   ├── BottomSheet.tsx
│   │       │   ├── GlassButton.tsx
│   │       │   ├── GlassDropdown.tsx
│   │       │   ├── HeaderActions.tsx
│   │       │   ├── HeaderBack.tsx
│   │       │   └── LucideIcon.tsx
│   │       └── variants/
│   │           ├── HeaderIconTitle.tsx
│   │           ├── HeaderPills.tsx
│   │           ├── HeaderStructured.tsx
│   │           ├── HeaderTabs.tsx
│   │           └── HeaderToggle.tsx
│   ├── mobile-sheet/
│   │   ├── MobileSheetNavLink.tsx
│   │   └── MobileSideSheet.tsx
│   └── sidebar/
│       ├── AdminNavInjector.tsx
│       ├── NavItem.tsx
│       ├── Sidebar.tsx
│       └── SidebarContextSelector.tsx
├── constants/
│   └── nav-data.ts
├── hooks/
│   └── useSidebarExpanded.ts
└── islands/
    ├── AdminIndicatorIsland.tsx
    ├── DeferredIslands.tsx
    ├── DevPerfOverlayIsland.tsx
    ├── LazyMessagingIsland.tsx
    └── VoicePadIsland.tsx
```

---

## Architecture Overview

The shell is a **zero-JS-first, CSS-checkbox-driven layout** that uses the grid:

```
sidebar | header
sidebar | main
```

The `app/(a)/layout.tsx` is the root — it's an async Server Component that:
1. Fetches the Supabase session and user data
2. Builds `initialReduxState` and wraps everything in `<Providers>`
3. Renders the `.shell-root` div containing hidden checkboxes for CSS-driven state, then `<Sidebar>`, `<Header>`, `<main>`, and `<MobileSideSheet>`
4. Portals `<MobileDock>` into `#glass-layer` (outside `.shell-root`) via `<GlassPortal>`
5. Mounts zero-footprint client components: `NavActiveSync`, `VisualViewportSync`, `DeferredIslands`

---

## Key Files — Complete Contents

### `app/(a)/layout.tsx`

The root layout. Reads pathname from `x-pathname` header (set by `proxy.ts`), fetches the user, builds Redux state, then renders the full shell. Passes `pathname` to `<Sidebar>` and `userData` to `<Header>`.

```122:148:app/(a)/layout.tsx
  return (
    <Providers initialReduxState={initialReduxState}>
      <div className="shell-root" data-pathname={pathname}>
        <input type="checkbox" id="shell-sidebar-toggle" aria-hidden="true" />
        <input type="checkbox" id="shell-mobile-menu" aria-hidden="true" />
        <input type="checkbox" id="shell-user-menu" aria-hidden="true" />
        <input type="checkbox" id="shell-panel-toggle" aria-hidden="true" />
        <input type="checkbox" id="shell-panel-mobile" aria-hidden="true" />

        <Sidebar pathname={pathname} />
        <Header userData={userData} />

        <main className="shell-main">{children}</main>

        <MobileSideSheet />
      </div>

      <GlassPortal>
        <MobileDock />
      </GlassPortal>

      <NavActiveSync />
      <VisualViewportSync />
      <DeferredIslands />
    </Providers>
  );
```

---

### `Header.tsx` — Pure Server Component

Accepts only `userData: UserData`. Three regions:
- **Left**: `<HamburgerButton>` — a `<label htmlFor="shell-mobile-menu">` (mobile only, hidden on desktop via CSS)
- **Center**: `<div id="shell-header-center" />` — an empty DOM slot that `PageHeader`/`PageSpecificHeader` portal content into
- **Right**: `<UserMenuTrigger>` + a backdrop `<label>` + `<div class="shell-user-menu-panel">` containing `<UserMenuPanel>`

```6:30:features/shell/components/header/Header.tsx
interface HeaderProps {
  userData: UserData;
}

export default function Header({ userData }: HeaderProps) {
  return (
    <header className="shell-header">
      <HamburgerButton />

      <div className="shell-header-center" id="shell-header-center" />

      <div className="shell-user-menu-wrapper">
        <UserMenuTrigger userData={userData} />
        <label
          htmlFor="shell-user-menu"
          className="shell-user-menu-backdrop"
          aria-hidden="true"
        />
        <div className="shell-user-menu-panel">
          <UserMenuPanel userData={userData} />
        </div>
      </div>
    </header>
  );
}
```

The user menu is **CSS-checkbox-driven** — `#shell-user-menu:checked` toggles `.shell-user-menu-panel` visibility via CSS (see `styles/shell.css` lines 1060–1132). No JS state needed.

---

### `Sidebar.tsx` — Pure Server Component

Three sections: brand (toggle button), nav (scrollable), footer (controls + settings). The sidebar expansion is CSS-driven by `#shell-sidebar-toggle:checked`. `pathname` is used only to determine initial active states — CSS takes over after that via `NavActiveSync`.

Key features:
- `<SidebarContextSelector />` at top of nav (client component, uses Redux for hierarchy)
- `primaryNavItems` mapped to `<NavItem>` components
- `<div id="admin-nav-slot" />` — empty slot for `AdminNavInjector` to portal admin items into post-hydration
- Footer: `SidebarEnvToggle` → `SidebarAdminIndicatorToggle` → `SidebarWindowToggle` → `SidebarNotesToggle` → `SidebarVoicePadToggle` → `NavItem` (settings)

---

### `NavItem.tsx` — Pure Server Component

Dead-simple: a Next.js `<Link>` with `data-nav-href={item.href}` attribute. Active state is entirely CSS-driven via `.shell-root[data-pathname^="..."] [data-nav-href="..."]` selectors in `shell.css`. The `isActive` prop is accepted but unused (leftover from a previous approach — the CSS handles it).

---

### `SidebarContextSelector.tsx` — Client Component

Uses `useSidebarExpanded()` (listens to `#shell-sidebar-toggle` checkbox) to switch between two modes:
- **Collapsed**: A `<Popover>` trigger (just the Globe icon) that opens a `PopoverContent` to the right
- **Expanded**: An inline `<HierarchyCommand>` combobox rendered directly in the nav

---

### `PageHeader` + `PageHeaderPortal` — The Header Injection System

`PageHeader` is a **Server Component wrapper** that accepts `children`, `desktop`, and `mobile` props. Internally it renders `PageHeaderPortal`, the client boundary. The portal uses `useEffect` to find `#shell-header-center` and then uses `createPortal()` to inject content there.

```39:41:features/shell/components/header/PageHeaderPortal.tsx
export default function PageHeaderPortal({ desktop, mobile, children }: PageHeaderPortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("shell-header-center"));
  }, []);
```

This is the **canonical way** to put content in the header center slot from any page or feature.

---

### `PageSpecificHeader` — The Older / Authenticated-Layout Pattern

Found in `components/layout/new-layout/PageSpecificHeader.tsx`. This is an older pattern that tries both `shell-header-center` (SSR shell) and `page-specific-header-content` (authenticated layout fallback). It also contains **many pre-wired header portals** for specific features (Chat, Prompts, Notes, Recipes, Transcripts, Messages, etc.) that dynamically import their compact header components via `useEffect` + `import()`.

**The two systems coexist**: `PageHeader` (in `features/shell/`) is the newer, cleaner approach. `PageSpecificHeader` (in `components/layout/`) is older and used by the `(authenticated)` layout routes. Both ultimately portal into `#shell-header-center` when in the `(a)` shell.

---

### Controls (`controls/` folder)

All three are client components that render as `shell-nav-item` buttons:

| Component | Redux Dependency | Shows When |
|---|---|---|
| `SidebarEnvToggle` | `selectActiveServer`, `switchServer`, `selectIsAdmin` | Admin only — toggles localhost/production |
| `SidebarAdminIndicatorToggle` | `selectIsAdmin`, `selectIsOverlayOpen`, `toggleOverlay` | Admin only — shows/hides the admin debug indicator |
| `SidebarVoicePadToggle` | `useVoicePad()` hook | Always visible — toggles voice pad overlay |

---

### CSS Architecture (`styles/shell.css` — 1718 lines)

Key design decisions:

1. **Grid layout** (`.shell-root`): `grid-template-columns: var(--shell-sidebar-w) 1fr` with rows `header | main`. Sidebar column expands CSS-only via `:has(#shell-sidebar-toggle:checked)`.

2. **Header is transparent** (`.shell-header`): `background: transparent; pointer-events: none` — content scrolls behind it. The center slot (`#shell-header-center`) is where all page-specific chrome appears.

3. **Main area margin trick** (`.shell-main`): `margin-top: calc(-1 * var(--shell-header-h))` — main content starts behind the header, letting pages decide their own top offset.

4. **Active nav state** — entirely CSS-driven. Layout stamps `data-pathname` on `.shell-root`. `NavActiveSync` keeps it live. CSS `:where()` selectors match `[data-pathname^=...] [data-nav-href=...]` — one place in CSS updates sidebar, mobile sheet, and dock simultaneously.

5. **Five checkboxes** manage all interactive state without JS:
   - `#shell-sidebar-toggle` — desktop sidebar expand/collapse
   - `#shell-mobile-menu` — mobile side sheet
   - `#shell-user-menu` — user menu dropdown
   - `#shell-panel-toggle` — secondary panel sidebar (desktop)
   - `#shell-panel-mobile` — secondary panel sidebar (mobile drawer)

6. **Route-level controls** via sentinel elements: `<span class="shell-hide-dock">` and `<span class="shell-hide-sidebar">` — routes drop invisible zero-size spans; shell detects them with `:has()` and adjusts layout globally.

7. **Glass tokens** are defined in `--shell-glass-*` (single source of truth in `app/globals.css`). The four canonical utility classes are `.shell-glass`, `.shell-glass-dock`, `.shell-glass-sheet`, and `.shell-glass-card`. Modal/overlay variants (`.shell-glass-overlay`, `.shell-glass-modal`) live outside `@layer utilities` with `!important` to win the cascade against Radix-injected inline styles.

8. **Panel sidebar system** (section 17b): Routes can opt into a secondary sidebar by rendering `<aside class="shell-panel">`. The shell splits `shell-main` into a two-column grid automatically. Desktop uses `#shell-panel-toggle`; mobile uses `#shell-panel-mobile` as a drawer.