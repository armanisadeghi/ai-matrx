---
name: ios-mobile-first
description: Single source of truth for iOS-native mobile web UX. Covers viewport units, safe areas, Dialog-to-Drawer conversion, Tabs-to-vertical-stacking, touch targets, input zoom prevention, and responsive patterns. Use when building any UI component, fixing mobile issues, reviewing responsive code, or when mobile UX is mentioned.
---

# iOS Mobile-First Design

> **Official guide:** `~/.arman/rules/nextjs-best-practices/nextjs-guide.md` — See the official guide for core architecture. The old §13 (Mobile-First) was removed; mobile-first patterns in this file will move to a dedicated *Mobile & Responsive UX* guide.

Single source of truth for mobile UX. Desktop stays unchanged; mobile gets iOS-native treatment.

**Reference implementations:** `components/layout/FeedbackButton.tsx`, `components/admin/McpToolsManager.tsx`, `components/admin/ToolUiComponentEditor.tsx`

---

## Golden Rules

1. **Always `dvh`** — never `vh` or `h-screen`
2. **Always `pb-safe`** — on fixed bottom elements
3. **Always 16px inputs** — prevents iOS zoom (`text-base` + `style={{ fontSize: '16px' }}`)
4. **Always 44pt touch targets** — minimum `h-10 w-10`
5. **Always `--header-height`** — never hardcode
6. **Always Drawer on mobile** — never Dialog
7. **Never tabs on mobile** — stack vertically
8. **Never nested scrolling** — single scroll area per view
9. **Always test iOS Safari** — on real device

---

## Viewport & Layout

### Dynamic Viewport Units

```tsx
// ✅ Adapts to mobile browser chrome
<div className="h-dvh">     <div className="min-h-dvh">     <div className="max-h-dvh">

// ❌ Breaks when browser chrome hides/shows
<div className="h-screen">  <div className="min-h-screen">
```

### Safe Areas

```tsx
// ✅ Respects iPhone home indicator / notch
<div className="fixed bottom-0 pb-safe">
<div className="mb-safe">

// Utilities in globals.css:
// .pb-safe { padding-bottom: env(safe-area-inset-bottom, 1rem); }
// .mb-safe { margin-bottom: env(safe-area-inset-bottom, 1rem); }
```

### Header Height

```tsx
// ✅ Uses CSS variable (--header-height: 2.5rem)
<div className="h-[calc(100dvh-var(--header-height))]">

// ❌ Hardcoded
<div className="h-[calc(100vh-40px)]">
```

### Page Layouts

```tsx
// Full-height page below header
<div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
  <div className="flex-1 overflow-y-auto pb-safe">{/* Scrollable content */}</div>
</div>

// With fixed bottom bar
<div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
  <div className="flex-1 overflow-y-auto">{/* Content */}</div>
  <div className="flex-shrink-0 pb-safe bg-card border-t">{/* Actions */}</div>
</div>

// Standard scrollable page
<div className="min-h-dvh">
  <div className="container mx-auto py-6 px-4">{/* Content */}</div>
</div>
```

---

## Dialog = Desktop, Drawer = Mobile

**The base `DialogContent` (`@/components/ui/dialog`) AUTO-converts to a bottom sheet on mobile** — full width, bottom-anchored, `max-h-[90dvh]`, internally scrollable, `pb-safe`. So a plain `<Dialog>` is already mobile-safe: its confirm/submit control can never be pushed off-screen. This is the systematic guard against mobile "lockout" popups. Opt out with `<DialogContent mobileSheet={false}>` only for a surface that must stay centered on mobile.

**Hand-roll the explicit Drawer branch below only when you need more than the auto-sheet** — a `vaul` drag-to-close handle, or a genuinely different mobile layout (not just a reflow). For a normal dialog, do nothing extra.

```tsx
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

function MyComponent() {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerTitle className="sr-only">Title</DrawerTitle>
          <div className="flex-1 overflow-y-auto overscroll-contain pb-safe">
            {/* Content — single scroll area, no nesting */}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-[95vw] w-full lg:max-w-[1400px] max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle>Title</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto">{/* Content */}</div>
      </DialogContent>
    </Dialog>
  );
}
```

| Element | Mobile (Drawer) | Desktop (Dialog) |
|---------|----------------|-----------------|
| Max height | `max-h-[85dvh]` | `max-h-[90dvh]` |
| Max width | Full width | `max-w-[95vw]` / `lg:max-w-[1400px]` |
| Scroll | `overflow-y-auto overscroll-contain` | `overflow-y-auto` |
| Safe area | `pb-safe` | Not needed |
| Layout | Natural flow | `flex flex-col overflow-hidden` |

---

## MANDATORY: Tabs = Desktop Only

**Never use tabs on mobile.** They cause UX friction, nested scroll trapping, and hidden content.

Stack all sections vertically with visual dividers:

```tsx
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function MyForm() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("basic");

  if (isMobile) {
    return (
      <div className="space-y-6 p-4">
        {/* Section 1 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <div className="h-6 w-1 bg-primary rounded-full" />
            Basic Info
          </h3>
          {/* Fields */}
        </div>

        {/* Section 2 */}
        <div className="space-y-4 pt-4 border-t border-border">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <div className="h-6 w-1 bg-primary rounded-full" />
            Advanced
          </h3>
          {/* Fields */}
        </div>

        {/* Full-width actions */}
        <div className="flex flex-col gap-3 pt-4 border-t border-border pb-safe">
          <Button className="w-full">Save</Button>
          <Button variant="outline" className="w-full">Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="basic">Basic Info</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
      </TabsList>
      <TabsContent value="basic">{/* Fields */}</TabsContent>
      <TabsContent value="advanced">{/* Fields */}</TabsContent>
    </Tabs>
  );
}
```

**Mobile stacking features:** accent bars (`h-6 w-1 bg-primary`), border separators, single scroll area, full-width buttons, `pb-safe`.

---

## iOS Zoom Prevention

```tsx
// ✅ All inputs MUST have ≥16px font size
<Input className="text-base" style={{ fontSize: '16px' }} />
<Textarea className="text-base" style={{ fontSize: '16px' }} />
<SelectTrigger className="text-base" style={{ fontSize: '16px' }} />

// ❌ Will trigger iOS auto-zoom on focus
<Input className="text-sm" />
```

**Prevent input auto-zoom with ≥16px fonts ONLY — never by disabling pinch-zoom.** `app/config/viewport.ts` keeps `userScalable: true` (`maximumScale: 5`) on purpose: pinch-zoom is the user's universal escape hatch when any surface overflows. **Never set `userScalable: false` / `maximumScale: 1`** — it removes the only way out of a mobile lockout.

---

## Responsive Components

### Flex Layouts
```tsx
<div className="flex flex-col sm:flex-row gap-4">
<div className="flex flex-col sm:flex-row items-start sm:items-center">
<div className="flex flex-wrap gap-2">
```

### Conditional Display
```tsx
// Icon-only on mobile, icon+text on desktop
<Button>
  <Icon className="h-4 w-4 sm:mr-2" />
  <span className="hidden sm:inline">Label</span>
</Button>
```

### Touch Targets (44pt minimum)
```tsx
// ✅ Proper touch sizing
<Button variant="ghost" className="h-10 w-10 p-0">
  <Icon className="h-5 w-5" />
</Button>
<Switch className="scale-90 sm:scale-100" />

// ❌ Too small
<Button className="h-6 w-6 p-0">
```

### Responsive Widths
```tsx
<div className="w-full sm:w-48">
<SelectTrigger className="w-full sm:w-48">
```

### Spacing
```tsx
<div className="space-y-4 sm:space-y-6">
<div className="p-4 sm:p-6">
<div className="container mx-auto px-4 sm:px-6 lg:px-8">
```

### Grids
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
<div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
```

### Typography
```tsx
<h1 className="text-[clamp(2rem,1.5rem+2vw,3.5rem)]">
<p className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)]">
<span className="truncate max-w-[150px] sm:max-w-none">
<p className="line-clamp-2">
```

---

## Nested Scrolling Prevention

```tsx
// ❌ Scroll trapping — user gets stuck in inner area
<div className="overflow-y-auto">
  <div className="overflow-y-auto max-h-[300px]">{/* Trap */}</div>
</div>

// ✅ Single scroll area — content flows naturally
<div className="overflow-y-auto">
  <div className="space-y-4">{/* All content */}</div>
</div>
```

---

## Component Audit Checklist

### Layout
- [ ] `dvh` not `vh`/`screen`; fixed bottom has `pb-safe`; header uses `--header-height`
- [ ] No nested scrolling; proper overflow management

### Dialogs & Modals
- [ ] `useIsMobile()` conditional: mobile=Drawer, desktop=Dialog
- [ ] Drawer: `max-h-[85dvh]`, `overscroll-contain`, `pb-safe`
- [ ] Dialog: `max-h-[90dvh]`, `overflow-hidden flex flex-col`

### Tabs & Sections
- [ ] Mobile: vertical stack with accent bars; Desktop: tabs OK (max 5)

### Inputs & Forms
- [ ] All inputs/textareas: `text-base` + `style={{ fontSize: '16px' }}`

### Touch & Interaction
- [ ] Touch targets ≥44pt (`h-10 w-10`); no hover-only interactions
- [ ] Action buttons full-width on mobile

### Responsive
- [ ] `flex-col sm:flex-row`; icon-only buttons on mobile; spacing adjusts

---

## Decision Tree

```
Modal content needed?
├── Mobile → Drawer (max-h-[85dvh], pb-safe, overscroll-contain)
└── Desktop → Dialog (max-h-[90dvh], flex flex-col)

Multiple sections?
├── Mobile → Stack vertically (accent bars + border separators)
└── Desktop → Tabs OK

Scrollable content?
├── Mobile → Single scroll area only
└── Desktop → Nested OK but avoid when possible
```

---

## Project Conventions

```tsx
// Design tokens
<div className="bg-textured">    // Main backgrounds
<div className="bg-card">         // Cards

// Layout components
import { ResponsiveLayout } from "@/components/layout/new-layout/ResponsiveLayout";
import { FloatingSheet } from "@/components/official/FloatingSheet";
import { useIsMobile } from "@/hooks/use-mobile";

// Animations — CSS-first
<div className="transition-all duration-300 [@starting-style]:opacity-0 [@starting-style]:translate-y-4">
// Framer Motion only for gestures/physics
```
