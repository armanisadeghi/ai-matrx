---
name: data-dense-panels
description: Rules for building data-dense admin panels, debug inspectors, state viewers, and multi-column tool UIs. Covers color theming, font sizing, space efficiency, resizable panels, and common anti-patterns. Grounded in VSCode, macOS, and WCAG best practices. Use when creating any inspector, debug panel, state viewer, data browser, log viewer, settings panel, or multi-pane tool UI with dense information.
---

# Data-Dense Panel UI — Rules & Patterns

Rules for building VSCode-quality admin panels, debug inspectors, state viewers, and multi-column tool UIs in the AI Matrx project. Grounded in research from Microsoft Fluent 2, Apple HIG, WCAG 2.2, Edward Tufte, and Nielsen Norman Group.

---

## 0. Design Philosophy — Lessons from the Best

These principles come from VSCode's design team, Apple's Human Interface Guidelines, Tufte's information design, and NN/G usability research. They are non-negotiable.

### Density is spacing, not smaller text

> "We should decouple things like font size and activity bar labels from density. This should be about spacing, not other details." — David Dossett, VSCode design team ([GitHub #168671](https://github.com/microsoft/vscode/issues/168671))

When something doesn't fit, the answer is **tighter padding, collapsible sections, or tabs** — never smaller font sizes. VSCode's density modes affect spacing, list density, and toolbars — not typography.

### Max data, min design (Tufte)

> "Should have design minimization, not data minimization." — Richard Bejtlich, via Tufte

Strip non-data decoration: heavy borders, ornamental boxes, 3D effects, background patterns in data regions. Every pixel should either display data or create necessary separation between data.

### Progressive disclosure — max 2 levels

> "Designs that go beyond 2 disclosure levels typically have low usability because users often get lost." — Nielsen Norman Group

Show the most important information first. Offer detail on demand (expand, hover, click-to-reveal). Never more than 2 levels deep before the user has to make a new navigation choice. This is why VSCode uses Activity Bar → Sidebar → Content, not deeply nested trees.

### Apple's sidebar rule

> "In general, show no more than two levels of hierarchy in a sidebar. When deeper, use a split view with a content list between sidebar items and detail view." — Apple HIG, Sidebars

Don't cram deep hierarchies into a single column. Use the 3-column pattern: navigation → list → detail. Each column is a single level of hierarchy.

### Contrast is not optional in dense UIs

Small text at low contrast is the #1 killer of dense UI usability. WCAG requirements apply regardless of information density:

| Situation | Minimum contrast ratio |
|-----------|----------------------|
| Normal text (< 18.5px regular, < 14pt bold) | **4.5 : 1** |
| Large text (≥ 18.5px regular, ≥ 14pt bold) | **3 : 1** |
| Non-text UI elements (borders, icons, focus rings) | **3 : 1** |
| Level AAA (aspirational for primary content) | **7 : 1** |

> "Dense UIs often use small type — that does not relax the contrast requirement. Small text usually counts as normal text." — W3C Understanding SC 1.4.3

### The 4px grid (Microsoft Fluent 2)

All spacing aligns to a **4px base unit**. Fluent 2 ramp: 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48. In Tailwind terms: `gap-0.5` (2px), `gap-1` (4px), `gap-1.5` (6px), `gap-2` (8px), `p-3` (12px), `p-4` (16px). Avoid arbitrary values that break the grid.

### Hit targets can be larger than visuals

> macOS minimum interactive target: ~20×20pt. Visual density can exceed hit-target size if the clickable region meets minimums. — Apple HIG

A list item can look compact (tight text, small icon) while the actual clickable area spans the full row height. Use `py-1.5` or `py-2` on the button/link — the padding IS the hit target.

---

## 1. Color System — Theme Tokens Only

**NEVER hardcode color values.** Every color must come from the semantic theme system so light/dark mode works automatically.

### Required tokens

| Purpose | Use | Never use |
|---------|-----|-----------|
| Page/panel background | `bg-background` | `bg-zinc-900`, `bg-gray-950`, `bg-[#1a1a1a]` |
| Card/section background | `bg-card` or `bg-muted/50` | `bg-zinc-800`, `bg-gray-800` |
| Subtle section tint | `bg-muted/30` | `bg-zinc-900/50` |
| Primary text | `text-foreground` | `text-zinc-200`, `text-gray-100`, `text-white` |
| Secondary/label text | `text-muted-foreground` | `text-zinc-400`, `text-zinc-500`, `text-gray-400` |
| Borders | `border-border` | `border-zinc-700`, `border-zinc-800`, `border-gray-700` |
| Accent/link color | `text-primary` | `text-sky-400`, `text-blue-400` |
| Hover background | `hover:bg-accent` or `hover:bg-accent/50` | `hover:bg-zinc-700`, `hover:bg-zinc-800` |
| Selected/active item | `bg-accent ring-1 ring-primary/40` or `bg-primary text-primary-foreground` | `bg-sky-500/10 border border-sky-500/30` |
| Destructive/error | `text-destructive` | `text-red-400`, `text-red-500` |

### Status colors (the only place direct color values are acceptable)

Status badges need semantic meaning that the theme system doesn't cover. Use `dark:` variants to respect both modes:

```tsx
"bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"  // success/complete
"bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"              // running/streaming
"bg-destructive/15 text-destructive border-destructive/20"                          // error/failed
"bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"          // pending/warning
"bg-muted text-muted-foreground border-border"                                      // draft/default
```

### JSON tree / code value colors

When rendering JSON trees, syntax highlighting needs direct colors. Always provide light AND dark variants:

```tsx
"text-emerald-700 dark:text-emerald-300"    // strings
"text-amber-600 dark:text-amber-400"        // numbers
"text-primary"                               // object keys
"text-muted-foreground"                      // null, undefined, structural chars
"text-emerald-600 dark:text-emerald-400"    // true
"text-muted-foreground"                      // false
```

---

## 2. Font Sizing — Readable First

> "10px and often 12px are usually really small for many cases. Prefer information architecture and progressive disclosure over shrinking type to cram data." — Stéphanie Walter, UX researcher

The #1 anti-pattern: **shrinking text to make things fit instead of using space efficiently.**

### Size rules (aligned with Fluent 2 typography ramp)

| Content type | Size | Tailwind class | Fluent 2 equivalent |
|-------------|------|----------------|---------------------|
| Primary data values, content text | 14px | `text-sm` | Body 1 (14/20) |
| Labels, metadata, secondary info | 12px | `text-xs` | Caption 1 (12/16) |
| Section headers | 12px bold | `text-xs font-semibold uppercase tracking-wider` | Caption 1 bold |
| Monospace IDs, code values | 14px | `text-sm font-mono` | Body 1 mono |
| Badge labels | 11px | `text-[11px]` | Between Caption 2 and 1 |
| Footer status bar | 12px | `text-xs` | Caption 1 |

### Absolute minimums

- **Body text:** Never below `text-xs` (12px)
- **Badges:** Never below `text-[11px]`
- **No content at `text-[10px]`** — if it doesn't fit, restructure the layout
- **Numeric columns:** Use `tabular-nums` for alignment in tables and lists

### Anti-patterns

```tsx
// ❌ NEVER — text too small to read
className="text-[10px] text-zinc-600"
className="text-[11px] text-zinc-500"

// ✅ CORRECT — readable with proper contrast
className="text-xs text-muted-foreground"
className="text-sm text-foreground"
```

---

## 3. Space Efficiency — Fill, Don't Shrink

The goal is **dense but readable** — like VSCode, not like a PDF crammed to fit on one page.

### The VSCode region model

VSCode's layout is one primary focal area (editor) surrounded by peripheral containers (sidebar, panel, status bar) that dock, hide, and accept dragged views. Apply the same model:

```
┌──────────┬───────────────────────────┐
│ Nav      │ Tab bar                    │
│ sidebar  ├───────────────────────────┤
│ (dock,   │ Content area              │
│  hide,   │ (primary focus — gets     │
│  resize) │  maximum space)            │
│          ├───────────────────────────┤
│          │ Footer / status            │
└──────────┴───────────────────────────┘
```

### Layout principles

1. **One primary focus rectangle.** The detail/content panel gets the most space. Sidebars are peripheral.
2. **Use the full available height.** Content panels should `flex-1` to fill space, not leave blank areas.
3. **Scroll, don't shrink.** If content overflows, scroll it. Never reduce font size to fit.
4. **Resizable panels** for multi-column layouts — users adjust to their preference. Power-tool users consistently favor adjustable chrome.
5. **Tight padding, generous line height.** Use `py-1.5` to `py-2.5` on items, not `py-0.5`.
6. **Collapse empty sections.** If a section has no data, collapse it or show a concise empty state — don't reserve layout space for it.
7. **Thin dividers.** Apple HIG recommends 1px dividers by default. Use `border-border` (1px), not heavy separators.

### Padding scale (4px grid aligned)

```
px-2 py-1.5    — compact list items (sidebar navigation)
px-2.5 py-2    — clickable list items (instance list, agent list)
px-3 py-2.5    — expandable cards (conversation turns, request cards)
p-3            — content areas (tab content padding)
px-3 py-1.5    — info bars (breadcrumbs, summary bars)
px-3 py-1      — footer/status bars
```

### Progressive disclosure in practice

- **Level 0:** Sidebar shows agent names + instance counts (scannable at a glance)
- **Level 1:** Selecting an agent shows its instances (list with summary info)
- **Level 2:** Selecting an instance shows tabbed detail (history, state, variables, etc.)
- **Within tabs:** Expandable cards reveal full content on click (conversation turns, JSON trees)

Never show all data expanded by default. Default JSON tree collapse depth: 1 level.

---

## 4. Resizable Panels — react-resizable-panels v4

The project uses react-resizable-panels v4. The API changed completely from v1/v2.

### Critical: Use `pct()` for all sizes

```tsx
import { pct } from "@/components/matrx/resizable/pct";

// ✅ CORRECT — pct() converts to "25%" string
<ResizablePanel defaultSize={pct(25)} minSize={pct(15)} maxSize={pct(40)}>

// ❌ WRONG — bare numbers are pixels in v4
<ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
```

### v4 API key differences

| Property | v4 | v1/v2 (old) |
|----------|-----|-------------|
| Group direction | `orientation="horizontal"` | `direction="horizontal"` |
| Size values | `pct(n)` → `"n%"` string | bare number `n` |
| Panel overflow | `style={{ overflow: "hidden" }}` on Panel | `className="overflow-hidden"` |
| Separator | `<ResizableHandle />` | `<ResizableHandle />` (same) |

### Standard 3-column pattern (mirrors VSCode's sidebar → list → editor)

```tsx
<ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
    <ResizablePanel defaultSize={pct(20)} minSize={pct(12)} maxSize={pct(30)}
        style={{ overflow: "hidden" }}>
        {/* Navigation sidebar — Level 0 */}
    </ResizablePanel>
    <ResizableHandle withHandle />
    <ResizablePanel defaultSize={pct(25)} minSize={pct(15)} maxSize={pct(40)}
        style={{ overflow: "hidden" }}>
        {/* List panel — Level 1 */}
    </ResizablePanel>
    <ResizableHandle withHandle />
    <ResizablePanel defaultSize={pct(55)} minSize={pct(30)}
        style={{ overflow: "hidden" }}>
        {/* Detail panel — Level 2 (primary focus, gets most space) */}
    </ResizablePanel>
</ResizablePanelGroup>
```

### Panel content structure

Every panel must follow this pattern to prevent overflow issues:

```tsx
<div className="flex flex-col h-full min-h-0" style={{ overflow: "hidden" }}>
    <div className="shrink-0 border-b border-border">Header</div>
    <ScrollArea className="flex-1">Content</ScrollArea>
</div>
```

### Split view rules (from Apple HIG — Split Views)

- Let users **hide panes** to gain space for the primary content
- **Balance panes** — avoid a secondary pane much narrower than the primary
- Keep **navigation on one side** so the spatial mental model stays clear
- **Persist layout** across sessions where possible

---

## 5. Dialog/Overlay Compatibility

Resizable panels inside Radix Dialog/Sheet cause two known issues.

### Issue 1: Click closes the modal

Separator drag events propagate to the Dialog's dismiss handler. Fix by stopping propagation on the panel container:

```tsx
<div onPointerDown={(e) => e.stopPropagation()}>
    <ResizablePanelGroup>...</ResizablePanelGroup>
</div>
```

### Issue 2: Drag doesn't work

If the Dialog has `modal={true}` (default), pointer capture can interfere. The `onPointerDown` fix above also prevents this. If issues persist, ensure the `ResizableHandle` is not inside an element with `pointer-events-none`.

---

## 6. Component Patterns

### Badges with borders

Always include a border for definition — badges without borders look like smudges on light backgrounds:

```tsx
<span className={cn(
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none shrink-0 border",
    statusClasses(status),
)}>
```

### Boolean indicators

Use visible dots with labels, not just text:

```tsx
<div className="flex items-center gap-2">
    <span className={cn("h-2.5 w-2.5 rounded-full", value ? "bg-emerald-500" : "bg-muted-foreground/30")} />
    <span className="text-xs text-foreground">{label}</span>
</div>
```

### Key-value rows

Labels fixed width right-aligned, values left-aligned:

```tsx
<div className="flex items-baseline gap-3 py-0.5">
    <span className="text-xs font-mono text-muted-foreground shrink-0 w-40 text-right">{key}</span>
    <span className="text-sm text-foreground min-w-0 break-all">{value}</span>
</div>
```

### Expandable cards

Border + hover + cursor for clickable items:

```tsx
<div className="border border-border rounded-md p-2.5 hover:bg-accent/50 transition-colors cursor-pointer">
```

### Empty states

Centered, visible, helpful:

```tsx
<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
    {message}
</div>
```

### Tab bars

Full `text-sm` with proper active indicator:

```tsx
<button className={cn(
    "flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors shrink-0",
    isActive
        ? "border-primary text-foreground font-medium"
        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50",
)}>
```

### JSON tree viewers

Follow the WAI-ARIA Tree View pattern for accessibility:

- **Arrow keys** for navigation (up/down between siblings, right to expand, left to collapse)
- **Default collapse depth: 1** — don't expand the entire tree on mount
- **Type styling** for string/number/bool/null with collection counts (`Array(5)`, `Object(12)`)
- **Truncation** for long strings with char count shown
- **Copy path** affordance for engineers (copy the key path to clipboard)
- **Virtualize** for large trees (> 500 nodes) — lazy-expand children on demand

---

## 7. Checklist — Before Shipping a Data Panel

1. **Theme compliance:** Zero hardcoded zinc/gray/slate colors? Both light and dark mode tested?
2. **Font sizes:** Nothing below `text-xs` (12px) for body content? Primary data at `text-sm` (14px)?
3. **Contrast:** Text meets 4.5:1 against its background? Muted-foreground only for truly secondary info?
4. **Space usage:** Content fills available space? No massive blank areas? Panels are resizable?
5. **Progressive disclosure:** Max 2 levels visible at once? Detail revealed on demand?
6. **Resizable panels:** Using `pct()` for all size props? `style={{ overflow: "hidden" }}` on panels?
7. **Overlay safety:** `onPointerDown` stopPropagation if inside a Dialog/Sheet?
8. **Scroll areas:** Each panel has its own `<ScrollArea>`, not nested scrolls?
9. **Badges:** Have borders? Status colors use `dark:` variants?
10. **Empty states:** Every panel/tab has a meaningful empty state?
11. **Icons:** Lucide React only, `h-3.5 w-3.5` to `h-4 w-4` range?
12. **Grid alignment:** Spacing values on the 4px grid (Tailwind default spacing scale)?
13. **Keyboard:** Focus rings visible? Tab order logical? Tree views support arrow keys?

---

## 8. Anti-Pattern Summary

| Anti-Pattern | Fix | Source |
|-------------|-----|--------|
| `text-[10px]` everywhere | `text-xs` minimum for labels, `text-sm` for data | Stéphanie Walter, Fluent 2 |
| `text-zinc-500`, `bg-zinc-900` | `text-muted-foreground`, `bg-background` | Theme system |
| Low contrast on dense text | Verify 4.5:1 ratio for all normal text | WCAG 2.2 SC 1.4.3 |
| 80% blank space | `flex-1` + `min-h-0` + `<ScrollArea>` | VSCode region model |
| Deep sidebar nesting (3+ levels) | Split into columns: nav → list → detail | Apple HIG Sidebars |
| Everything expanded by default | Collapse depth 1, expand on demand | NN/G progressive disclosure |
| Fixed column widths (`w-[180px]`) | `ResizablePanel` with `pct()` + drag handles | Apple HIG Split Views |
| `defaultSize={25}` (bare number) | `defaultSize={pct(25)}` | react-resizable-panels v4 |
| Modal closes on panel click | `onPointerDown={(e) => e.stopPropagation()}` | Radix Dialog behavior |
| Badges without borders | Add `border` class + border color | Light mode contrast |
| Identical dim color for everything | `text-foreground` for data, `text-muted-foreground` only for labels | Visual hierarchy |
| `font-mono` on entire component | Only on IDs, code values, JSON trees | Typography best practice |
| Arbitrary spacing (7px, 13px) | Stick to 4px grid: 4, 8, 12, 16, 20, 24 | Fluent 2 Layout |
| Making text smaller to fit | Restructure layout, add tabs/sections, collapse | Dossett (VSCode team) |

---

## References

| Source | Key insight |
|--------|------------|
| [VSCode UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview) | Container/item model, view limits, anti-clutter rules |
| [GitHub #168671](https://github.com/microsoft/vscode/issues/168671) (Dossett) | Density = spacing, not font size |
| [Fluent 2 Layout](https://fluent2.microsoft.design/layout) | 4px grid, spacing ramp, progressive disclosure |
| [Fluent 2 Typography](https://fluent2.microsoft.design/typography) | Caption 12/16, Body 14/20, contrast thresholds |
| [Apple HIG — Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) | Max 2 hierarchy levels, split view for deeper |
| [Apple HIG — Split Views](https://developer.apple.com/design/human-interface-guidelines/split-views) | Thin dividers, hide panes, balance panes |
| [WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | 4.5:1 normal, 3:1 large, no exceptions for density |
| [NN/G — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Max 2 levels, clear labels, show important first |
| [Tufte — Sparklines](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/) | Max data, min design, typographic resolution |
| [Stéphanie Walter — Font sizes](https://stephaniewalter.design/blog/what-minimum-font-size-for-a-high-density-data-web-app-do-you-suggest/) | 12px practical minimum, prefer layout restructuring |
| [Evil Martians — Dev tool UI patterns](https://evilmartians.com/chronicles/keep-it-together-5-essential-design-patterns-for-dev-tool-uis) | Tabs, toolbars, sidebars, property panels, tables |
