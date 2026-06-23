---
name: route-metadata-favicons
description: Add or update Next.js route metadata, custom per-route favicons, OpenGraph, and Twitter card social sharing for any route or subroute tree in matrx-admin. Use when adding a new route, wiring up metadata for a layout, adding a favicon to a route, setting up social share images, auditing missing metadata, or understanding the tab-title naming convention. Triggers on: createRouteMetadata, createDynamicRouteMetadata, generateFaviconMetadata, navigation-links, favicon, openGraph, twitter card, metadata layout, titlePrefix.
---

# Route Metadata & Favicons

## Architecture Overview

| File | Role |
|------|------|
| `constants/navigation-links.tsx` | Master registry — `favicon: { color, letter }` per route |
| `utils/favicon-utils.ts` | Generates inline SVG favicon as `data:image/svg+xml` URI; holds system-route overrides |
| `utils/route-metadata.ts` | `createRouteMetadata` / `createDynamicRouteMetadata` helpers |
| `config/extras/site.ts` | `siteConfig.ogImage`, `siteConfig.description` — global social defaults |
| `app/(a)/layout.tsx` | Root template: `"%s — AI Matrx"` — sets the brand suffix automatically |

---

## Critical: Tab Title Rule

**Specific word FIRST. Category LAST. Brand handled by root template.**

```
✅  "Build | Agents — AI Matrx"    ← first word differs — easy to scan 20 tabs
✅  "Run | Agents — AI Matrx"
✅  "Edit | My Note — AI Matrx"
❌  "Agents Build — AI Matrx"      ← all Agents tabs start with "Agents" — unreadable
❌  "Agents | AI Matrx"            ← redundant brand in middle position
```

**Never append `| AI Matrx` inside the helpers** — the root layout template does it.
The helpers only set the `%s` portion of `"%s — AI Matrx"`.

---

## System-Route Color Families

Three route trees have a **fixed color** in `utils/favicon-utils.ts`. The color is locked — the **letter is always unique per subroute**.

| Route tree | Color | Fallback letter | Rule |
|------------|-------|-----------------|------|
| `/demo`, `/demos`, `/component-demo`, `/p/demo` | `#ca8a04` warm yellow | path-derived | Every demo route MUST pass its own unique `letter` |
| `/tests`, `/beta`, `/experimental` | `#65a30d` lime green | path-derived | Every test route MUST pass its own unique `letter` |
| `/administration`, `/admin` | `#4338ca` deep indigo | path-derived | Every admin route MUST pass its own unique `letter` |

**The point:** 20 yellow tabs in one browser window must each show a different 2-char badge so you can tell them apart. The color tells you "this is a demo tab" and the letter tells you *which* demo.

```
✅  Yellow "GH" = Glass Header demo
✅  Yellow "AC" = Accordion demo
✅  Yellow "SB" = Sortable demo
❌  Yellow "De" × 20 tabs = completely useless
```

**Do not add `favicon` to nav entries for these paths** — the system color is applied automatically. Just always pass `letter` in the metadata helpers.

---

## Favicon Design Rules for Primary Routes

### 2-Letter Format (Required for routes with 7+ subroutes)

All primary routes use 2-letter favicon codes. The pattern:
- First letter = section initial
- Second letter = differentiator (avoids collision)
- Color = unique, high-contrast, not used by any other route

**Current primary route assignments** (copy this table when adding new routes):

| Route | Letter | Hex Color | Notes |
|-------|--------|-----------|-------|
| `/dashboard` | `Db` | `#0ea5e9` | Sky blue |
| `/agents` | `Ag` | `#f43f5e` | Rose red |
| `/ai/prompts` | `Pb` | `#a855f7` | Purple |
| `/prompt-apps` | `Pa` | `#059669` | Dark emerald |
| `/p/research` | `Rs` | `#7c3aed` | Violet |
| `/chat` | `Ch` | `#2563eb` | Deep blue |
| `/notes` | `No` | `#d97706` | Amber |
| `/tasks` | `Tk` | `#16a34a` | Green |
| `/projects` | `Pj` | `#4f46e5` | Indigo |
| `/files` | `Fi` | `#0284c7` | Sky-700 |
| `/transcription/processor` | `Tr` | `#9333ea` | Purple-600 |
| `/transcription/studio` | `Ts` | `#9333ea` | Purple-600 |
| `/data` | `Da` | `#0891b2` | Cyan-600 |
| `/demo/voice/voice-manager` | `Vo` | `#ea580c` | Orange-600 |
| `/image-editing` | `Im` | `#0d9488` | Teal-600 |
| `/scraper` | `Ws` | `#3730a3` | Indigo-800 |
| `/sandbox` | `Sb` | `#c2410c` | Orange-700 |
| `/messages` | `Mg` | `#db2777` | Pink-600 |
| `/settings` | `St` | `#475569` | Slate-600 |
| `/ai/cockpit` | `Ac` | `#7c3aed` | Violet-700 |
| `/ai/recipes` | `Rc` | `#c026d3` | Fuchsia-600 |
| `/ai/runs` | `Ru` | `#0e7490` | Cyan-700 |
| `/workflows` | `Wf` | `#6d28d9` | Violet-700 |
| `/apps` | `Ah` | `#14532d` | Green-900 — Apps hub |
| `/apps/app-builder` | `Ab` | `#4c1d95` | Purple-950 — App Builder |
| `/apps/demo` | `Ad` | `#be123c` | Rose-700 — Applet demo |
| `/apps/builder/hub` | `Bh` | `#1e3a8a` | Indigo-900 — Builder hub |
| `/demo/*` | `De` | `#ca8a04` | **System override** |
| `/tests/*` | `Tx` | `#65a30d` | **System override** |
| `/administration/*` | `Ad` | `#4338ca` | **System override** |

### Color Selection Rules
- Never reuse a color already in this table
- Colors that look alike at 16px: avoid `#6366f1` near `#4f46e5`, `#7c3aed` near `#6d28d9`
- Prefer distinct hue families — if Agents is rose, the next red-family route should be orange or pink, not another rose
- High saturation helps at small sizes — pastels disappear

---

## Step 1: Register in navigation-links.tsx

```typescript
{
  label: "My Feature",
  href: "/my-feature",
  favicon: { color: "#10b981", letter: "Mf" }, // unique color + 2-char letter
  ...
}
```

The favicon lookup is **prefix-based** — `/my-feature/[id]/build` inherits `/my-feature`'s favicon automatically. Always pass the root path to the helpers.

---

## Step 2A: Static Route Layout

```typescript
// app/(a)/my-feature/layout.tsx  ← root section layout
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/my-feature", {
  title: "My Feature",
  description: "One-line description",
  additionalMetadata: { keywords: ["keyword1", "keyword2"] },
  // letter not needed — comes from navigation-links.tsx entry
});
```

```typescript
// app/(a)/my-feature/[id]/build/layout.tsx  ← sub-page layout, unique badge
export const metadata = createRouteMetadata("/my-feature", {
  titlePrefix: "Build",   // ← goes FIRST in the tab
  title: "My Feature",
  description: "Build and configure a my-feature item",
  letter: "MFB",          // "My Feature Build" — unique across open tabs
});
// Tab: "Build | My Feature — AI Matrx"
```

```typescript
// app/(authenticated)/demo/component-demo/glass-header/layout.tsx
export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Glass Header",
  title: "Demo",
  description: "Glass header component demo",
  letter: "GH",   // REQUIRED — unique per demo; yellow color applied automatically
});
// Tab: "Glass Header | Demo — AI Matrx"  +  yellow "GH" favicon
```

---

## Step 2B: Dynamic [id] Route Layout

```typescript
// app/(a)/my-feature/[id]/layout.tsx
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  return createDynamicRouteMetadata("/my-feature", {
    title: item.name,                                  // fetched name
    description: item.description?.slice(0, 120),     // max ~120 chars
    // letter optional for primary routes — comes from nav-links.tsx
  });
}

// Sub-page with action context — specific word first, unique badge:
return createDynamicRouteMetadata("/agents", {
  titlePrefix: "Build",
  title: agent.name,
  description: `Configure ${agent.name}`,
  letter: "AB",         // "Agent Builder" tab — unique vs "AR" (Agent Runner)
  ogImage: agent.coverUrl,   // optional per-entity OG image
});
```

---

## Step 3: Sub-pages — No Action Required

Sub-pages (`page.tsx` inside `[id]/run/`, `[id]/build/`, etc.) inherit from the nearest layout that exports `metadata` or `generateMetadata`. Only add metadata at the sub-page level if the sub-page needs a distinct title (use `titlePrefix`).

---

## Administration Layouts

Admin layouts use `createRouteMetadata("/administration", ...)`. The deep-indigo color is applied automatically. **Always pass a unique `letter`** so 10+ admin tabs are distinguishable.

```typescript
// app/(authenticated)/(admin-auth)/administration/schema-manager/layout.tsx
export const metadata = createRouteMetadata("/administration", {
  title: "Schema Manager",
  description: "...",
  letter: "SM",   // REQUIRED — unique across all open admin tabs
});
// Tab: "Schema Manager — AI Matrx"  +  deep-indigo "SM" favicon
```

---

## Demo & Test Layouts

Same rule — color is automatic, **letter is required and must be unique per route**.

```typescript
// Accordion demo
export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Accordion",
  title: "Demo",
  description: "Accordion component demo",
  letter: "AC",   // unique — no other demo should use "AC"
});

// Sortable demo
export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Sortable",
  title: "Demo",
  description: "Drag and sort component demo",
  letter: "So",   // different from "AC", "GH", etc.
});

// Test route
export const metadata = createRouteMetadata("/tests", {
  title: "Form Tests",
  description: "...",
  letter: "FT",   // unique across test tabs
});
```

---

## Route Discovery System Integration

When `RouteIndexPage` is used for a section index page, it automatically:
1. Resolves the favicon for the `basePath`
2. Renders the favicon badge next to the page title
3. Uses the favicon color as a left-border accent on group cards in `GroupedCardsDisplay`

No extra code needed — pass `basePath="/my-feature"` and it works.

See `.cursor/skills/route-discovery-system/SKILL.md` for full `RouteIndexPage` usage.

---

## Checklist for a New Route

```
- [ ] favicon entry added to navigation-links.tsx with a UNIQUE color
- [ ] letter is 2 chars, not already used by another route
- [ ] color confirmed not already in the table above
- [ ] top-level layout exports createRouteMetadata("/my-route", { title, description })
- [ ] sub-page layouts use titlePrefix for specific-word-first tab titles
- [ ] dynamic [id] layout uses generateMetadata + createDynamicRouteMetadata
- [ ] description is ≤120 chars for dynamic routes
- [ ] no manual | AI Matrx appended in title — root template handles it
- [ ] SCAN NEARBY ROUTES in the same directory — they likely also need metadata
```

### "Scan nearby routes" — Always do this

When adding metadata to one route, check its siblings:
- Look at all `layout.tsx` files in the same parent directory
- Look at neighboring feature folders at the same level
- Any layout missing `createRouteMetadata` or `generateMetadata` is missing its favicon

---

## Escape Hatches

**Favicon only, no other metadata:**
```typescript
import { getRouteFavicon } from "@/utils/route-metadata";
export const metadata = getRouteFavicon("/my-feature");
```

**Custom favicon for a route not in navigation-links.tsx:**
```typescript
import { createCustomFaviconMetadata } from "@/utils/favicon-utils";
export const metadata = createCustomFaviconMetadata(
  { color: "#f97316", letter: "Xp" },
  { title: "Special Route", description: "..." }
);
```

---

## Common Mistakes

| Mistake | Correct approach |
|---------|-----------------|
| `title: "Agents Build"` | `titlePrefix: "Build", title: "Agents"` |
| `title: "My Route \| AI Matrx"` | `title: "My Route"` (root template adds brand) |
| Passing `/agents/123/build` to helpers | Always pass root: `/agents` |
| `favicon: { color, letter }` on admin nav entry | Omit it — system color covers all `/administration/*` |
| Omitting `letter` on a demo/test/admin layout | Every route in these families MUST have a unique `letter` |
| Reusing the same `letter` across two demo routes | Defeats the whole purpose — scan the nearby layouts first |
| Picking a color already in the table for primary routes | Check the full table above first |
| 1-char letter on a high-traffic route | Use 2-char — more visually distinct at 16px |
| Same first letter with ambiguous second | `Pb` vs `Pa` works; `Pb` vs `Pc` is risky — pick visually distinct shapes |
| Thinking the system letter fallback is acceptable | The path-derived fallback is a safety net only — always pass an explicit `letter` |
