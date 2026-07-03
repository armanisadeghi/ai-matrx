# Modern Web Design Expert — AI Matrx Admin

> **Official guide:** `~/.arman/rules/nextjs-best-practices/nextjs-guide.md` — §13 covers styling architecture (Tailwind). Old §13 (mobile-first) and §15 (component contracts/accessibility) were removed and will get dedicated guides.

Review and apply modern web design patterns to the code at `$ARGUMENTS`.

## Project Context

- **Type:** Admin dashboard / B2B tool
- **Responsive Strategy:** Desktop-first, mobile-responsive
- **Stack:** Next.js 16 + React 19 + Tailwind CSS 4.1 + shadcn/ui + Framer Motion

## Already Aligned

| Pattern | Location |
|---------|----------|
| Tailwind v4 with `@theme inline` | `app/globals.css` |
| Design tokens (`--primary`, `--secondary`) | `app/globals.css` |
| Dark mode via `.dark` class | `@custom-variant dark` |
| `h-dvh`, `min-h-dvh`, `max-h-dvh` | Custom utilities |
| Safe area insets (`pb-safe`, `env()`) | Custom utilities |
| Lucide React icons exclusively | Enforced |
| 16px+ input font size | `1.0625rem` base |
| `next-themes` for dark mode | Configured |

## Migration Standards (New Code Must Follow)

### 1. Fluid Typography (Medium Priority)

```css
/* Use clamp() instead of fixed tokens */
h1 { font-size: clamp(2rem, 1.5rem + 2vw, 3.5rem); }
body { font-size: clamp(1rem, 0.95rem + 0.25vw, 1.125rem); }
```

Tailwind: `text-[clamp(1rem,0.9rem+0.5vw,1.25rem)]`

### 2. CSS-First Animations (Low Priority)

Use CSS `@starting-style` for entrance animations instead of Framer Motion:

```tsx
<div className="
  opacity-100 translate-y-0
  transition-all duration-300
  [@starting-style]:opacity-0 
  [@starting-style]:translate-y-4
">
```

Keep Framer Motion only for: drag gestures, physics springs, complex orchestration.

### 3. Container Queries (Medium Priority)

All reusable components should use `@container`:

```tsx
<div className="@container">
  <div className="flex flex-col @md:flex-row">...</div>
</div>
```

### 4. Component Wrappers (High Priority)

Every shadcn/ui primitive should have a project wrapper:

- Location: `components/ui/app-*.tsx` (e.g., `app-dialog.tsx`)
- Never use raw shadcn/ui imports in page code

### 5. CSS Entrance Animations (Low Priority)

```tsx
<div className="[@starting-style]:opacity-0 [@starting-style]:translate-y-4 transition-all">
```

## Project Conventions

### Header & page height (`(core)` AppShell)

Route chrome → `<PageHeader>`. Body wrapper → `h-full overflow-hidden`.

**Do not** use `h-page` or `calc(100dvh - var(--header-height))` on `(core)` routes — `.shell-main` is already full viewport.

Full pattern: `features/shell/components/header/variants/USAGE.md`

### Backgrounds
```tsx
<div className="bg-textured">      {/* Main page backgrounds */}
<div className="bg-card">          {/* Card backgrounds */}
```

### Scrollbars
Use `.scrollbar-hide` or `.scrollbar-thin` utilities.

### Layout Components
- `ResponsiveLayout` — desktop/mobile switch at 1024px
- `AdaptiveLayout` — multi-panel with canvas
- `FloatingSheet` — multi-position sheet

## Quick Reference

```tsx
// ✅ Fluid typography
<h1 className="text-[clamp(2rem,1.5rem+2vw,3.5rem)]">

// ✅ Container queries
<div className="@container"><div className="@md:flex-row">

// ✅ CSS entrance animations
<div className="[@starting-style]:opacity-0 transition-all">

// ✅ Custom wrappers
import { AppDialog } from "@/components/ui/app-dialog";

// ❌ Fixed breakpoint font sizes
<h1 className="text-2xl md:text-3xl lg:text-4xl">

// ❌ Raw shadcn/ui
import { Dialog } from "@/components/ui/dialog";

// ❌ Framer Motion for simple entrances
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
```

## Key Files

| Purpose | Location |
|---------|----------|
| Design tokens | `app/globals.css` |
| Card component | `components/ui/card.tsx` |
| Sheet component | `components/official/FloatingSheet.tsx` |
| Responsive layout | `components/layout/new-layout/ResponsiveLayout.tsx` |
| Mobile hook | `hooks/use-mobile.tsx` |
| Animation presets | `components/matrx/Entity/prewired-components/quick-reference/componentConfig.ts` |

## Migration Priorities

| Item | Priority |
|------|----------|
| Custom component wrappers | **High** |
| Fluid typography | **Medium** |
| Container queries | **Medium** |
| CSS entrance animations | **Low** |
| Framer Motion reduction | **Low** |
