# User profile menu: SSR shell vs authenticated app

This document compares the **user avatar / profile menus** in:

1. **`removed (ssr) route group — `** — the SSR-first “shell” experience (guests allowed; optional auth).
2. **`app/(authenticated)/`** — the main authenticated dashboard (server redirect if no session).

Goal: support a future **single configurable menu system** where routes can opt into subsets of options without duplicating logic.

---

## 1. SSR route (`removed (ssr) route group — `)

### 1.1 Entry points and files

| Piece | File |
|-------|------|
| Server layout (Redux seed, guest vs auth, global checkbox controls) | `app/(dev)/layout.dev.tsx` |
| Checkbox that toggles menu open state | `app/(dev)/layout.dev.tsx` — `<input type="checkbox" id="shell-user-menu" />` |
| Panel visibility (CSS `:has(#shell-user-menu:checked)`) | `removed (ssr) route group — shell.css` — selectors `.shell-user-menu-panel`, `.shell-user-menu-backdrop`, etc. |
| Header shell | `features/ssr-trials/components/Header.tsx` |
| Avatar trigger (label → checkbox) | `features/ssr-trials/components/UserMenuTrigger.tsx` |
| Menu content | `features/ssr-trials/components/UserMenuPanel.tsx` |
| Alternate trigger + lazy panel (React state, not checkbox) | `features/ssr-trials/components/UserMenuIsland.tsx` |

> **Note:** `Header.tsx` always mounts `UserMenuPanel` inside the shell header. `UserMenuIsland` is a variant used elsewhere (e.g. contexts that need a client-only dropdown) and reuses the same `UserMenuPanel` via `dynamic(..., { ssr: false })`.

### 1.2 How it opens/closes

- **Primary shell pattern:** CSS-only “checkbox hack” — `UserMenuTrigger` is a `<label htmlFor="shell-user-menu">`. A backdrop label also targets the same id. Closing is done by unchecking the input in JS (`closeMenu()` in `UserMenuPanel.tsx` via `document.getElementById("shell-user-menu")`).
- **No Radix `DropdownMenu`** in this path.

### 1.3 Data sources

- **User display:** Redux `selectUser` — hydrated from `Providers` `initialReduxState` in `app/(dev)/layout.dev.tsx` (guest gets empty mapped user).
- **Admin block:** Redux `selectIsAdmin` from `@/lib/redux/slices/userSlice` → `user.isAdmin` set at layout init from `getUserSessionData` / `mapUserData` when a session exists.
- **Profile image field:** `user.userMetadata.avatarUrl` (not `picture`).

### 1.4 Menu options (logged in)

All items are **hardcoded** in `UserMenuPanel.tsx` (no `navigation-links` import).

**Header row**

- Link: **`/ssr/settings`** — avatar, name, email.

**Quick actions** (Redux `openOverlay` — same overlay ids as `useQuickActions` elsewhere)

- Quick Note → `quickNotes`
- Quick Task → `quickTasks`
- Quick Chat → `quickChat`
- Quick Data → `quickData`
- Quick Files → `quickFiles`
- AI Results → `quickAIResults`
- Utilities Hub → `quickUtilities`

**Navigation / product**

- Direct Messages → **`/messages`**
- Notifications — button (currently only closes menu; no `NotificationDropdown` integration)
- Announcements → `openAnnouncements()` (`overlaySlice`)
- Submit Feedback → local state opens `FeedbackDialog` (`features/ssr-trials/components/FeedbackDialog.tsx`, dynamically imported `ssr: false`)

**Admin-only** (`selectIsAdmin`)

- Admin Dashboard → **`/administration`**
- Show / Hide Admin Indicator → `toggleOverlay({ overlayId: "adminIndicator" })`

**Account**

- Light / Dark mode — toggles `document.documentElement` class, `localStorage`, and **`theme` cookie** (server-visible pattern for SSR theming).
- Preferences → `openUserPreferences()` (`overlaySlice`)

**Sign out**

- `supabase.auth.signOut()` from `@/utils/supabase/client`, then **`window.location.href = "/login"`** (not `/sign-out`).

### 1.5 Menu options (guest)

- Single link: **Sign In** → **`/login`**.

### 1.6 Nested submenus

**No.** The panel is a single flat column of `<button>` / `<Link>` elements with dividers.

---

## 2. Authenticated route (`app/(authenticated)/`)

Authenticated chrome is **`ResponsiveLayout`** → **Desktop** (`DesktopLayout`) vs **Mobile** (`MobileLayout`). The avatar-adjacent experience **differs by breakpoint**.

### 2.1 Layout composition

| Piece | File |
|-------|------|
| Server layout: session required, Redux seed, preferences | `app/(authenticated)/layout.tsx` |
| Responsive switch (default breakpoint **1024px**) | `components/layout/new-layout/ResponsiveLayout.tsx` |
| Desktop header (sidebar, quick actions, messages, notifications, **NavigationMenu**) | `components/layout/new-layout/DesktopLayout.tsx` |
| Mobile header (**MobileUnifiedMenu** only in that slot) | `components/layout/new-layout/MobileLayout.tsx` |

### 2.2 Desktop: `NavigationMenu` (primary profile / app menu)

| Piece | File |
|-------|------|
| Main dropdown (Radix shadcn `DropdownMenu`) | `features/applet/runner/header/navigation-menu/NavigationMenu.tsx` |
| Animations hook (creator / task-driven UI flair) | `features/applet/runner/header/navigation-menu/useMenuAnimations.ts` |
| Admin subsection (nested submenus) | `features/applet/runner/header/navigation-menu/AdminMenu.tsx` |
| Creator subsection (overlays + links + layout submenu) | `features/applet/runner/header/navigation-menu/CreatorMenu.tsx` |

**Trigger UX:** Combined control — **hamburger (`Menu`) + avatar** in one pill (`mx-glass`), optional **Crown** when creator flag is on.

**Scroll behavior:** Content uses a **scrollable middle** (`max-h-[calc(100vh-4rem)]`, `overflow-y-auto`) with **fixed header** (user card) and **fixed footer** (theme, preferences, sign out).

**Default link list:** Imports `navigationLinks` from `@/constants/navigation-links` which is **`profileMenuLinks`** — i.e. all entries in `constants/navigation-links.tsx` with `profileMenu: true` (re-export: `export const navigationLinks = profileMenuLinks`).  

That is a **long, data-driven list** (20+ primary destinations), including Dashboard, Prompt Builder, Prompt Apps, Research, Chat, Notes, Tasks, Projects, Files, Transcripts, Tables, Voices, Image Search, Webscraper, Sandboxes, Messages, Settings, AI Cockpit, AI Recipes, Workflows, etc.

**Custom extension points on `NavigationMenu`:**

- `customLinks` — replace the default filtered list.
- `additionalMenuSections` — array of `{ component, props?, shouldRender? }` for extra injected sections.

**Role gates:**

- **Creator UI:** `brokerSelectors.selectValue(state, "APPLET_USER_IS_ADMIN")` — note: broker key name is “APPLET_USER_IS_ADMIN”; UI label is “Creator”.
- **Admin menu block:** `brokerSelectors.selectValue(state, "GLOBAL_USER_IS_ADMIN")`.
- **Important:** This is **not** the same selector as SSR’s `selectIsAdmin` (`user.isAdmin` on the user slice). Broker flags may hydrate later via app initialization, so **admin/creator visibility can diverge in timing** from SSR menu’s immediate `user.isAdmin`.

**Profile header row**

- Link: **`/settings/profile`**
- Photo: `user.userMetadata.picture`
- Creator badge when `userIsCreator`.

**Fixed bottom (desktop menu)**

- **Feedback** — Only rendered **inside** this dropdown when `useIsMobile()` is true (`NavigationMenu.tsx`); on desktop, feedback is a **separate header control** (`FeedbackButton` in `DesktopLayout.tsx`).
- Theme: `useTheme()` from `@/hooks/useTheme`.
- Preferences: **`/settings/preferences`**.
- Sign out: **`<Link href="/sign-out">`** (route handler flow), not inline `supabase.signOut` in the menu.

**Nested submenus (yes, desktop)**

- **`AdminMenu`:** Uses `DropdownMenuSub` / `DropdownMenuSubContent` / `DropdownMenuPortal`. Links with `category === "primary"` from `adminNavigationLinks` are flat; **other categories** become **flyout submenus** (trigger uses a custom `SubTrigger` without the default right chevron; left `ChevronLeft` icon in row).
- **`CreatorMenu`:** Flat items plus **“Layout Variations”** `DropdownMenuSub` when pathname is under **`/apps/custom/...`** (applet runner), backed by `appletLayoutOptionsArray` and `ScrollArea`.

**Desktop-only related header controls (not inside NavigationMenu but same “chrome”)**

- **`QuickActionsMenu`** — separate zap icon dropdown; duplicates the *concept* of SSR’s inline quick actions list (`features/quick-actions/components/QuickActionsMenu.tsx`, hook `features/quick-actions/hooks/useQuickActions.ts` — same `openOverlay` ids).
- **`MessageIcon`**, **`NotificationDropdown`** — real notification UI wiring in desktop header.

### 2.3 Mobile: `MobileUnifiedMenu`

| Piece | File |
|-------|------|
| Mobile avatar dropdown | `components/layout/new-layout/MobileUnifiedMenu.tsx` |

**Behavior:**

- Radix `DropdownMenu`; avatar-only trigger (no hamburger in the trigger — hamburger is for the **sidebar** in `MobileLayout`).
- Profile header: **`/settings/profile`**, photo from `picture`, **Creator** badge from broker `APPLET_USER_IS_ADMIN`.
- **Quick actions** are **inside this menu** (same seven as SSR / `useQuickActions`).
- Feedback via **`FeedbackButton`** + hidden trigger pattern.
- Notifications item uses **local React state** `notifications` (placeholder array) — not the desktop `NotificationDropdown` data path.
- Theme: `useTheme()`.
- Preferences: **`/settings/preferences`**.
- Sign out: **`/sign-out`**.
- **Does not** include `navigationLinks` grid, **CreatorMenu**, or **AdminMenu** — mobile users rely on the **slide-out sidebar** for primary/admin links (`MobileLayout.tsx` maps `primaryLinks` / `secondaryLinks`).

### 2.4 Single source of truth for “which destinations exist”

| Constant / export | File | Role |
|-------------------|------|------|
| `allNavigationLinks`, `profileMenu`, `NavigationLink` | `constants/navigation-links.tsx` | Defines `profileMenu: true` entries + admin links with `category` |
| `navigationLinks` / `profileMenuLinks` | same | Consumed by `NavigationMenu` for desktop dropdown |
| `adminNavigationLinks` / `adminLinks` | same | Consumed by `AdminMenu` |
| `appSidebarLinks`, `adminSidebarLinks` | same | Passed from `app/(authenticated)/layout.tsx` into `ResponsiveLayout` for sidebars |

---

## 3. Side-by-side comparison

### 3.1 Options coverage

| Capability | SSR `UserMenuPanel` | Auth desktop `NavigationMenu` | Auth mobile `MobileUnifiedMenu` |
|-----------|---------------------|-------------------------------|----------------------------------|
| Data-driven app destinations (`navigation-links`) | No | Yes (full `profileMenu` set) | No (sidebar only) |
| Quick actions (overlays) | Yes (inline) | Yes (separate `QuickActionsMenu`) | Yes (inline) |
Creator tools (`CreatorMenu`, layout submenu) | No | Yes (broker-gated) | No |
| Admin nested categories (`AdminMenu`) | No (single flat admin row) | Yes (broker-gated) | No |
| Profile/settings URL | `/ssr/settings` | `/settings/profile` (+ `/settings/preferences`) | `/settings/profile`, `/settings/preferences` |
| Announcements | Yes (`openAnnouncements`) | Via `DynamicAnnouncementProvider` / not in this menu slice — **not duplicated in NavigationMenu** | No in this component |
| User preferences overlay | Yes (`openUserPreferences`) | Preferences link to route | Same as desktop |
| Theme | Manual DOM + cookie | `useTheme()` | `useTheme()` |
| Sign out | Client `signOut` + `/login` | `/sign-out` link | `/sign-out` link |
| Notifications | Placeholder button | `NotificationDropdown` in header | Placeholder state in menu |
| Messages | Link `/messages` | `MessageIcon` in header | Not in menu (sidebar has Messages link) |
| Feedback | SSR `FeedbackDialog` | `FeedbackButton` in header; menu item mobile-only in `NavigationMenu` | `FeedbackButton` in menu |
| Guest mode | Yes | N/A (layout redirects) | N/A |

### 3.2 Architecture: how they are the same

- Both ultimately depend on **Redux user** (and overlays) for actions.
- Quick actions share the **same overlay ids** (`quickNotes`, `quickTasks`, etc.) — SSR dispatches `openOverlay` directly; authenticated code uses `useQuickActions()` which dispatches the same.
- Both can show **admin indicator** toggle via `overlaySlice` / `adminIndicator`.
- **Initial admin flag on user slice** is populated from server session data in both layouts when the user is logged in (`getUserSessionData` / `mapUserData`).

### 3.3 Architecture: how they differ

| Topic | SSR shell | Authenticated |
|-------|-----------|---------------|
| Menu UI primitive | Custom div + checkbox CSS | Radix `DropdownMenu` (shadcn) |
| Configurability | None (hardcoded JSX) | Desktop menu: `constants/navigation-links.tsx` + injectable `additionalMenuSections` / `customLinks` |
| Admin detection in menu | `selectIsAdmin` (`user.isAdmin`) | `GLOBAL_USER_IS_ADMIN` **broker** value |
| Creator detection | None | `APPLET_USER_IS_ADMIN` broker |
| Profile photo field | `avatarUrl` | `picture` |
| Layout coupling | Shell `Header` + `shell.css` | `ResponsiveLayout` / `DesktopLayout` / `MobileLayout` split |
| SSR / hydration | Server passes `avatarUrl` / `name` into header; trigger can show before Redux | Server builds full `initialReduxState`; viewport hint `serverIsMobile` reduces flash |
| Nested menus | Not supported | Supported (`AdminMenu`, `CreatorMenu`) |
| Related header widgets | Mostly folded into one panel | Desktop splits **NavigationMenu**, **QuickActionsMenu**, **FeedbackButton**, **MessageIcon**, **NotificationDropdown** |

---

## 4. Implications for merging into one system

1. **Unify the “menu model”** (array or tree of items: `{ id, label, icon, href?, overlayId?, roles?, section?, children? }`) and drive both shells from it — replacing SSR hardcoding and consolidating `navigation-links` + ad-hoc rows.
2. **Normalize admin/creator gates** — decide whether menus use `user.isAdmin`, broker keys, or both with a clear precedence to avoid “admin in one place but not the other.”
3. **Normalize profile/settings/sign-out** — single policy for `/ssr/settings` vs `/settings/profile`, and `/sign-out` vs inline `signOut`.
4. **Normalize avatar metadata** — `avatarUrl` vs `picture` in mappers and UI.
5. **Checkbox shell vs Radix** — merging likely means either adopting **`DropdownMenu` everywhere** or abstracting a headless “open/close” that works for SSR shell CSS and for Radix (mobile rules may prefer Drawer over Dialog for complex flows; nested dropdowns need careful touch behavior).
6. **Desktop split vs unified panel** — authenticated desktop currently separates **quick actions** from **NavigationMenu**; SSR combines them. A merged design should decide whether quick actions stay a separate affordance or fold in (product decision).
7. **Guest mode** — only SSR menu needs a non-empty guest experience today.

---

## 5. File index (quick reference)

**SSR**

- `app/(dev)/layout.dev.tsx`
- `removed (ssr) route group — shell.css`
- `features/ssr-trials/components/Header.tsx`
- `features/ssr-trials/components/UserMenuTrigger.tsx`
- `features/ssr-trials/components/UserMenuPanel.tsx`
- `features/ssr-trials/components/UserMenuIsland.tsx`
- `features/ssr-trials/components/FeedbackDialog.tsx`

**Authenticated**

- `app/(authenticated)/layout.tsx`
- `components/layout/new-layout/ResponsiveLayout.tsx`
- `components/layout/new-layout/DesktopLayout.tsx`
- `components/layout/new-layout/MobileLayout.tsx`
- `components/layout/new-layout/MobileUnifiedMenu.tsx`
- `features/applet/runner/header/navigation-menu/NavigationMenu.tsx`
- `features/applet/runner/header/navigation-menu/AdminMenu.tsx`
- `features/applet/runner/header/navigation-menu/CreatorMenu.tsx`
- `features/applet/runner/header/navigation-menu/useMenuAnimations.ts`
- `features/quick-actions/components/QuickActionsMenu.tsx`
- `features/quick-actions/hooks/useQuickActions.ts`
- `constants/navigation-links.tsx`

---

*Last updated: 2026-04-01 — reflects codebase as of this repository snapshot.*
