
# Project CSS/Design Conventions — AI Matrx Admin

> Formerly the `modern-web-design-expert` skill; folded into `ui-sharp` in the Wave 4 doc consolidation. Applies to ALL UI work (any ui-* posture), not just ui-sharp.

> **Official guide:** `~/.arman/rules/nextjs-best-practices/nextjs-guide.md` — §13 (Styling Architecture) covers the Tailwind design-system mandate. The old §15 (Component Contracts & Accessibility) was removed and will get a dedicated guide. This skill covers project-specific migration state and priorities.

This skill extends the **official Next.js best practices guide**. Read that first for best practices. This document covers:

1. What AI Matrx Admin already does correctly
2. What needs migration to best practices
3. Project-specific conventions

> **Shared UI surface rules:** The platform-wide rules for one coherent control, icon/title
> rows, shared route navigation, intentional spacing, tap targets, and live responsive
> certification live in [common-docs/policies/ui-surface-rules.md](/policies/ui-surface-rules.md).
> Read and apply that policy before changing any page or shared UI primitive; this file
> supplies the frontend-specific mechanics and migration notes.

> **📱 For mobile-specific guidelines:** See `.claude/skills/ios-mobile-first/SKILL.md`
> 
> The ios-mobile-first skill covers viewport units, safe areas, touch targets, responsive patterns, and iOS-native UX. Use that skill for all mobile layout and interaction work.

---

## Project Context

**Type:** Admin dashboard / B2B tool  
**Responsive Strategy:** Desktop-first, mobile-responsive  
**Stack:** Next.js 16 + React 19 + Tailwind CSS 4.1 + shadcn/ui + Framer Motion

---

## ✅ Already Aligned with Best Practices

| Pattern | Status | Location |
|---------|--------|----------|
| Tailwind v4 with `@theme inline` | ✅ Correct | `app/globals.css` |
| Design tokens (`--primary`, `--secondary`) | ✅ Correct | `app/globals.css` |
| Dark mode via `.dark` class | ✅ Correct | `@custom-variant dark` |
| `h-dvh`, `min-h-dvh`, `max-h-dvh` | ✅ Correct | Custom utilities in globals |
| Safe area insets (`pb-safe`, `env()`) | ✅ Correct | Custom utilities in globals |
| Lucide React icons exclusively | ✅ Correct | Project rule enforced |
| 16px+ input font size | ✅ Correct | `1.0625rem` in base styles |
| `next-themes` for dark mode | ✅ Correct | Installed and configured |

---

## 🔄 Migration Required — New Code Must Use Best Practices

### 1. Typography: Fixed Tokens → Fluid `clamp()`

**Current (Legacy):**
```css
/* Fixed font size tokens in globals.css */
--font-size-2xs: 0.6rem;
--font-size-xs: 0.8rem;
--font-size-sm: 0.85rem;
/* ... etc */
```

**Best Practice:**
```css
/* Fluid typography with clamp() */
h1 { font-size: clamp(2rem, 1.5rem + 2vw, 3.5rem); }
h2 { font-size: clamp(1.5rem, 1.25rem + 1.5vw, 2.5rem); }
body { font-size: clamp(1rem, 0.95rem + 0.25vw, 1.125rem); }
```

**Action:**
- **New code:** Use `clamp()` for all typography via Tailwind arbitrary values
- **Migration priority:** Medium — can migrate incrementally per component
- **Example:** `text-[clamp(1rem,0.9rem+0.5vw,1.25rem)]`

---

### 2. Animations: Framer Motion Heavy → CSS-First

**Current (Legacy):**
- Heavy use of Framer Motion (`motion` package) for all animations
- `AnimatePresence` for entrance/exit animations

**Best Practice:**
- CSS `@starting-style` for entrance animations
- CSS `transition` for hover/focus effects
- Framer Motion only for gesture-based or complex orchestration

**Action:**
- **New code:** Use CSS `@starting-style` for entrance animations
- **Migration priority:** Low — existing Framer Motion works fine, optimize new code
- **When to use Framer Motion:** Drag gestures, physics-based springs, staggered lists with complex timing

---

### 3. Container Queries: Minimal → Expand Usage

**Current:**
- ~40 files use `@container` (2026-09-26).

**Best Practice:**
- All reusable components should use container queries
- Cards, profile components, widgets should respond to container, not viewport

**Action:**
- **New code:** Use `@container` for all reusable components
- **Migration priority:** Medium — improves component reusability
- **Pattern:** `<div className="@container"><div className="@md:flex-row">...</div></div>`

---

### 4. Primitives come from the design system

Dialog, Sheet, Button, Input, Skeleton, the data table and the rest ship from
`@ai-matrx/design-system`; `components/ui/*.tsx` are thin host re-exports of the
same components. Import either — never write a local wrapper around a primitive
(no `AppDialog`-style layer: a second implementation of something we own is a
defect). A fix to a primitive is made in the package.

---

### 5. Entrance Animations: JS-Triggered → `@starting-style`

**Current:**
- Many components use JS/Framer Motion to trigger entrance animations
- Class toggling or `AnimatePresence` for fade-ins

**Best Practice:**
```tsx
<div className="
  opacity-100 translate-y-0
  transition-all duration-300
  [@starting-style]:opacity-0 
  [@starting-style]:translate-y-4
">
```

**Action:**
- **New code:** Use `@starting-style` for all entrance animations
- **Migration priority:** Low — existing animations work, optimize new code

---

## 📍 Project-Specific Conventions

### Header & page height (`(core)` AppShell)

```css
--header-height: 2.5rem; /* legacy/admin — see --shell-header-h in shell.css */
```

**Full-height `(core)` pattern:**
```tsx
<>
  <PageHeader>{/* route chrome */}</PageHeader>
  <div className="h-full flex flex-col overflow-hidden">{/* body */}</div>
</>
```

See `features/shell/components/header/variants/USAGE.md`. Use `.h-page` / header subtraction only on `/administration/*` and legacy layouts.

### Textured Backgrounds

This project uses subtle texture overlays:

```tsx
<div className="bg-textured">      {/* Main page backgrounds */}
<div className="bg-card">          {/* Card backgrounds with card-texture */}
```

### Scrollbar Styling

Custom thin scrollbars are defined globally:

```css
--scrollbar-track: /* defined per theme */
--scrollbar-thumb: /* defined per theme */
```

Use `.scrollbar-hide` or `.scrollbar-thin` utilities.

### Layout Components

- `ResponsiveLayout`: Switches between desktop/mobile layouts at 1024px
- `AdaptiveLayout`: Multi-panel layout with canvas support
- `FloatingSheet`: Multi-position sheet component (right, left, top, bottom, center)

---

## 📁 Key Files Reference

| Purpose | Location |
|---------|----------|
| Design tokens & utilities | `app/globals.css` |
| Base card component | `components/ui/card.tsx` |
| Sheet component | `components/official/FloatingSheet.tsx` |
| Responsive layout | `components/layout/new-layout/ResponsiveLayout.tsx` |
| Mobile detection hook | `hooks/use-mobile.tsx` |

---

## 🚨 Migration Priorities Summary

| Item | Priority | Approach |
|------|----------|----------|
| Fluid typography | **Medium** | Use `clamp()` in new code, migrate existing incrementally |
| Container queries | **Medium** | Use `@container` in new reusable components |
| CSS entrance animations | **Low** | Use `@starting-style` in new code |
| Framer Motion reduction | **Low** | Keep existing, use CSS for new simple animations |

---

## Quick Reference: New Code Standards

When writing new UI code in this project:

```tsx
// ✅ DO: Fluid typography
<h1 className="text-[clamp(2rem,1.5rem+2vw,3.5rem)]">

// ✅ DO: Container queries for reusable components
<div className="@container">
  <div className="flex flex-col @md:flex-row">

// ✅ DO: CSS entrance animations
<div className="[@starting-style]:opacity-0 [@starting-style]:translate-y-4 transition-all">

// ✅ DO: Design-system primitives (host re-export or the package)
import { Dialog } from "@/components/ui/dialog";

// ❌ DON'T: Fixed font sizes with breakpoints
<h1 className="text-2xl md:text-3xl lg:text-4xl">

// ❌ DON'T: A local wrapper around a design-system primitive

// ❌ DON'T: Framer Motion for simple entrance animations
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}> // Use @starting-style
```
