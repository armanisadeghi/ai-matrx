## Matrx Admin UI Rules

The AI Matrx Admin dashboard is designed to give users a very powerful set of tools on a desktop so that they can do what they need quiickly. It's important, however, that when we switch to mobile, we still allow the user to be able to properly engage with all features.


### Big Rules
- Do not waste space with overly large ancilary components that gain nothing by being bigger.
    - eg. A button works the same if it's an icon or if it's a button with an icon, lots of padding and text! Opt for icons when it's a common function. Use short text if it's not an easily understood action.
- Favor flowing menus, docks, search bars and things that do not take away from the page
- Avoid nesting of components that each add more padding, more borders and more wastsed space, especially on mobile.
- Use Next.js routes properly to ensure good flow and maximized SSR.
- SHOVE client-side logic into the smallest possible chunks of code within the much larger set of server components. Nearly the entire UI on any given page or route should be almost fully built on the server so the only thing that hydrates on the client side is the custom data inside of it.
- Use our proper tailwind css vairables, ensure propoer light/dark

## Great patterns to replicate from current code:
- Prompts Module: app/(authenticated)/ai/prompts
    - Perfect example of a primary route with a clean ui
    - Beautiful search/filter/new floating glass bar
    - No space wasted for title/description (Short name and icon added to app header)
    - Beautiful individual cards for each prompt
    - Prompt cards with two variations: large with action icons, small with ... menu.
    - Clicking main card renders beautiful, mobile frindly modal/bottom drawer with full access to what the user needs.
    - Icons, actions and fonts are small and padding is limited and used where it's needed, like vscode
    - Componnts background glass effect and overall aesthetics borrow from ios, especialy for mobile
    - New action brings up beautifully designed bottom drawer with proper actions and options
    - The input properly uses our built-in microphone version (Available for input and textareas)
    - All font sizes for inputs respect the mimimum size for ios and pb-safe is properly utilized
    - Paddig propery added at the bottom to account for floating dock.
- Prompts Edit Route: app/(authenticated)/ai/prompts/edit/[id]/page.tsx
    - BY FAR the most complex page in our app, but works perfectly for both desktop and mobile!
    - The secret is in the use of small components, no nesting, no side-padding on mobile, inteligent design of a wide page on desktop, but a toggle for mobile that switches between the two sides.
    - The settings are beautifully tucked into a modal/sheet.
    - The page ensures no nested scrolling. Since the page as a whole scrolls, everything else grows to full length without exception.
Research Route: Example: app/(public)/p/research/topics/[topicId]/sources/page.tsx
    - Beautiful glass dock in the bottom (Reusable and available for you)
    - Top search, filter feature as full width on destop and automatically a drawer for mobile
    - 





### Layout & Headers
- **`(core)` routes:** inject route chrome with `<PageHeader>` (`features/shell/components/header/PageHeader.tsx`) — never a page-level title/header bar in the body (`border-b bg-card`)
- **Body wrapper:** `h-full overflow-hidden` on `(core)` AppShell routes — never `h-page` or `calc(100dvh - header)` (`.shell-main` is already full viewport)
- **Admin/legacy only:** `.h-page` or `calc(100dvh - var(--header-height))` where content sits below the header
- Full pattern: `features/shell/components/header/variants/USAGE.md`

### Scrolling
- Single scroll area only — the page scrolls, nothing nested
- Textareas that need to grow: use a `ref`-based auto-grow pattern (`height: auto` → `height: scrollHeight`) so they expand indefinitely with the page scroll, never create inner scroll

### Forms & Inputs
- Compact rows: combine related fields on one row (e.g. label + type select, tags + visibility toggle)
- No `<Label>` components above inputs — use `placeholder` instead
- All inputs `fontSize: 16px` (minimum to prevent iOS zoom)
- Inputs `h-9` not `h-10` — save the space

### Buttons & Actions
- Icon-only buttons when the icon is universally understood (`+`, save floppy, back arrow, trash)
- No text next to `+` for "add/new" actions
- Save button: icon-only, disabled when nothing changed or required fields empty
- Destructive actions: `AlertDialog` — never `confirm()`

### Cards & Navigation
- Cards are fully clickable → opens action drawer (mobile: Drawer, desktop: Dialog)
- Card click drawer shows: content preview (scrollable block), tags, then action buttons
- Clicking a card item navigates to a dedicated full-page route — not a modal/overlay

### Mobile
- Floating action bar at bottom (filter icon + search pill + `+` icon button) — `pb-safe`, `z-40`
- Desktop: search bar inline at top of content area
- Drawer (`max-h-[90dvh]`) on mobile, Dialog on desktop — always `useIsMobile()`
- Tab switching: pill buttons, not `<Tabs>` component

### Routes
- Each item gets its own route (`/[id]`) with view/edit toggle in the header
- View/edit toggle: segmented pill in the header (not tabs in the page)
- `?mode=edit` URL param to land directly in edit mode
- Duplication via `?from=[id]` on the new-item route (server fetches source, passes as default)

### Hydration
- Never use `<style jsx>` or CSS-in-JS in components rendered server-side — use Tailwind only
- Loading states: simple `<Loader2 className="animate-spin" />` not custom loaders with inline styles

