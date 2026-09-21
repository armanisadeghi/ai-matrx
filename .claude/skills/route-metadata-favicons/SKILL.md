---
name: route-metadata-favicons
description: "Next.js route metadata, per-route favicons, OpenGraph, and Twitter cards. Use when adding a route or layout, adding a favicon or social share image, auditing missing metadata, naming tab titles, or touching createRouteMetadata, createDynamicRouteMetadata, generateFaviconMetadata, or titlePrefix."
---

# Route Metadata & Favicons

## Architecture Overview

| File                              | Role                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `constants/favicon-route-data.ts` | Master registry — `favicon: { color, letter }` per route                               |
| `utils/favicon-utils.ts`          | `generateFaviconMetadata` — inline SVG favicon as `data:image/svg+xml` URI; holds system-route overrides |
| `utils/route-metadata.ts`         | `createRouteMetadata` / `createDynamicRouteMetadata` helpers — also emit OpenGraph + Twitter card metadata (override via `additionalMetadata.openGraph` / `.twitter`; per-entity `ogImage`) |
| `config/extras/site.ts`           | `siteConfig.ogImage`, `siteConfig.description` — global social defaults                |
| `app/(a)/layout.tsx`              | Root template: `"%s — AI Matrx"` — sets the brand suffix automatically                 |

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

| Route tree                                      | Color                 | Fallback letter | Rule                                                |
| ----------------------------------------------- | --------------------- | --------------- | --------------------------------------------------- |
| `/demo`, `/demos`, `/component-demo`, `/p/demo` | `#ca8a04` warm yellow | path-derived    | Every demo route MUST pass its own unique `letter`  |
| `/tests`, `/beta`, `/experimental`              | `#65a30d` lime green  | path-derived    | Every test route MUST pass its own unique `letter`  |
| `/administration`, `/admin`                     | `#111827` near-black  | path-derived    | Reuse the mirrored feature's `letter`; admin-only pages get a clean 2-char code |

**The point:** 20 yellow tabs in one browser window must each show a different 2-char badge so you can tell them apart. The color tells you "this is a demo tab" and the letter tells you _which_ demo.

```
✅  Yellow "GH" = Glass Header demo
✅  Yellow "AC" = Accordion demo
✅  Yellow "SB" = Sortable demo
❌  Yellow "De" × 20 tabs = completely useless
```

**Do not add `favicon` to nav entries for these paths** — the system color is applied automatically. Just always pass `letter` in the metadata helpers.

---

## Favicon Design Rules for Primary Routes

### 🚨 THE TWO HARD RULES (Arman, 2026-09-18 / 2026-09-21)

**1. A badge is NEVER more than 2 characters.** At 16px a third glyph makes the
tile an unreadable smear. 1 char is fine when a route is alone in its space; 3 is
never fine. 132 three-character codes existed on 2026-09-21 and all of them were
collapsed. `pnpm check:favicon-letters` fails on any letter over two characters.

**2. Uniqueness is PER COLOUR, not global.** *"Since the color is what sets them
apart."* `/administration/agents` wears the **same** `AG` as `/agents` — in
near-black instead of rose. An admin page that mirrors a real feature **reuses
that feature's exact code**; it never gets an `A`-for-Admin prefix, because the
black tile already says admin. Two routes only collide when they resolve to the
SAME colour and neither is an ancestor of the other.

Rule 2 is what makes rule 1 possible. A rigid "every page in this family starts
with the family's letter" scheme runs out of room past ~26 sub-pages — so drop
that constraint. The colour carries the family; the two letters only need to be a
distinct, roughly mnemonic code for that page *within its colour*. `/agents` uses
`AG`, `AB`, `AH`, `AP`, `LA`, `SH`, `SU`, `WI`, `CP`, `BT`, `BM`, `BR`, `BS`,
`BP`, `TL`, `BU`, `BV`, `NB`, `NC`, `NI`, `NT`, `NG`, `NM`, `SX` — no shared first
letter, no collisions, every one readable.

### The emoji escape hatch

`FaviconConfig` carries `emoji?: string`, and every helper threads it
(`createRouteMetadata({ emoji })`, `createDynamicRouteMetadata`,
`getRouteFavicon(path, letter, emoji)`, `generateFaviconMetadata(path, meta,
letter, emoji)`). An emoji **replaces** the letters entirely and is exempt from
the 2-character cap.

Use it for the handful of pages that do not reduce to two readable characters —
**Launchpad is the worked example**: "LP" says nothing, "UL" said less, and a
rocket says it instantly.

```typescript
// constants/favicon-route-data.ts
{ href: "/launchpad", favicon: { color: CORE_HUB_COLOR, emoji: "🚀" } },
```

```typescript
// app/(admin)/administration/launchpad/page.tsx — same rocket, admin's black tile
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Launchpad",
  title: "Administration",
  emoji: "🚀",
});
```

It is an escape hatch, not the new default. Two letters are the norm; reach for an
emoji when they genuinely read as nothing. `/dashboard` stays `Db` — that reads fine.

### 2-Letter Format (Required for routes with 7+ subroutes)

All primary routes use 2-letter favicon codes. The pattern:

- First letter = section initial
- Second letter = differentiator (avoids collision)
- Color = unique, high-contrast, not used by any other route

**Current primary route assignments** (copy this table when adding new routes):

| Route                       | Letter | Hex Color | Notes                              |
| --------------------------- | ------ | --------- | ---------------------------------- |
| `/launchpad`                | 🚀     | `#f97316` | Core-hub orange — emoji, not letters |
| `/dashboard`                | `Db`   | `#f97316` | Core-hub orange (`CORE_HUB_COLOR`) |
| `/agents`                   | `AG`   | `#f43f5e` | Rose red (`AGENTS_COLOR`)          |
| `/agents/[id]/build`        | `AB`   | `#f43f5e` | Agent Builder — inherits the family |
| `/agent-apps`               | `AA`   | `#059669` | Dark emerald                       |
| `/agent-apps/[id]/run`      | `AR`   | `#059669` | Agent Runner                       |
| `/chat`                     | `C`    | `#2563eb` | Deep blue (`CHAT_COLOR`)           |
| `/notes`                    | `N`    | `#eab308` | Docs yellow (`DOCS_COLOR`)         |
| `/documents`                | `DO`   | `#eab308` | Docs yellow (`DOCS_COLOR`)         |
| `/markdown-studio`          | `MD`   | `#eab308` | Docs yellow (`DOCS_COLOR`)         |
| `/data`                     | `DA`   | `#0891b2` | Sheets cyan (`SHEETS_COLOR`)       |
| `/files`                    | `F`    | `#0891b2` | Sheets cyan (`SHEETS_COLOR`)       |
| `/workbooks`                | `WB`   | `#0891b2` | Sheets cyan (`SHEETS_COLOR`)       |
| `/workflows`                | `WF`   | `#6d28d9` | Violet (`WORKFLOWS_COLOR`)         |
| `/marketing`                | `Mk`   | `#15803d` | Green (`MARKETING_COLOR`)          |
| `/tasks`                    | `T`    | `#16a34a` | Green                              |
| `/projects`                 | `P`    | `#4f46e5` | Indigo                             |
| `/transcripts`              | `TR`   | `#9333ea` | Purple-600                         |
| `/artifacts`                | `AF`   | `#78716c` | Stone-500                          |
| `/scraper`                  | `SC`   | `#3730a3` | Indigo-800                         |
| `/sandbox`                  | `SB`   | `#c2410c` | Orange-700                         |
| `/messages`                 | `MS`   | `#db2777` | Pink-600                           |
| `/settings`                 | `ST`   | `#475569` | Slate-600                          |
| `/demo/*`                   | `De`   | `#ca8a04` | **System override**                |
| `/tests/*`                  | `Tx`   | `#65a30d` | **System override**                |
| `/administration/*`         | (twin) | `#111827` | **System override** — reuses the mirrored feature's code |

The registry (`constants/favicon-route-data.ts`) is the authority — this table is
the shape of it, not a copy of all ~200 entries. Read the file before adding one.

### The colour taxonomy (Arman, 2026-09-18)

> "Red: Agents. Blue: Chat. Yellow: notes, docs, etc. Light blue: Data, sheets,
>  etc. Purple: Workflows, etc. Green: Marketing. Need a good color for admin —
>  maybe black or gray."

The families are **named constants exported from `constants/favicon-route-data.ts`**.
A route in a family references the constant; it never repeats the hex.

| Family              | Constant           | Hex       | Members today                        |
| ------------------- | ------------------ | --------- | ------------------------------------ |
| Agents              | `AGENTS_COLOR`     | `#f43f5e` | `/agents` and its whole subtree       |
| Chat                | `CHAT_COLOR`       | `#2563eb` | `/chat`                               |
| Notes / docs        | `DOCS_COLOR`       | `#eab308` | `/notes`, `/documents`, `/markdown-studio` |
| Data / sheets       | `SHEETS_COLOR`     | `#0891b2` | `/data`, `/files`, `/workbooks`       |
| Workflows           | `WORKFLOWS_COLOR`  | `#6d28d9` | `/workflows`, `/legacy/workflows`     |
| Marketing           | `MARKETING_COLOR`  | `#15803d` | `/marketing`                          |
| Administration      | `ADMIN_COLOR`      | `#111827` | LOCKED for `/administration`, `/admin` |
| Generic core hub    | `CORE_HUB_COLOR`   | `#f97316` | `/launchpad`, `/dashboard`            |

Two choices worth knowing before you second-guess them:

- **Docs yellow `#eab308` is deliberately not the demo mustard `#ca8a04`.** The
  demo colour is LOCKED, so a docs tab and a demo tab would otherwise be the same
  badge; `#eab308` is brighter and more saturated and reads apart at 16px.
- **The core hub is orange.** Red, blue, yellow, cyan, violet, green and
  near-black are all spoken for, so orange is the one primary hue left that says
  "front door, not a feature" — it is not Chat's blue and not Data's cyan.

A route that is not in a family keeps its own curated colour. A family is a
statement about kinship, not a licence to repaint the registry.

### Color Selection Rules

- Never reuse a color already in this table
- Colors that look alike at 16px: avoid `#6366f1` near `#4f46e5`, `#7c3aed` near `#6d28d9`
- Prefer distinct hue families — if Agents is rose, the next red-family route should be orange or pink, not another rose
- High saturation helps at small sizes — pastels disappear

---

## Step 1: Register in favicon-route-data.ts

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
  // letter not needed — comes from favicon-route-data.ts entry
});
```

```typescript
// app/(a)/my-feature/[id]/build/layout.tsx  ← sub-page layout, unique badge
export const metadata = createRouteMetadata("/my-feature", {
  titlePrefix: "Build", // ← goes FIRST in the tab
  title: "My Feature",
  description: "Build and configure a my-feature item",
  letter: "MFB", // "My Feature Build" — unique across open tabs
});
// Tab: "Build | My Feature — AI Matrx"
```

```typescript
// app/(authenticated)/demo/component-demo/glass-header/layout.tsx
export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Glass Header",
  title: "Demo",
  description: "Glass header component demo",
  letter: "GH", // REQUIRED — unique per demo; yellow color applied automatically
});
// Tab: "Glass Header | Demo — AI Matrx"  +  yellow "GH" favicon
```

---

## Step 2B: Dynamic [id] Route Layout

```typescript
// app/(a)/my-feature/[id]/layout.tsx
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItem(id);
  return createDynamicRouteMetadata("/my-feature", {
    title: item.name, // fetched name
    description: item.description?.slice(0, 120), // max ~120 chars
    // letter optional for primary routes — comes from nav-links.tsx
  });
}

// Sub-page with action context — specific word first, unique badge:
return createDynamicRouteMetadata("/agents", {
  titlePrefix: "Build",
  title: agent.name,
  description: `Configure ${agent.name}`,
  letter: "AB", // "Agent Builder" tab — unique vs "AR" (Agent Runner)
  ogImage: agent.coverUrl, // optional per-entity OG image
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
  letter: "SM", // REQUIRED — unique across all open admin tabs
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
  letter: "AC", // unique — no other demo should use "AC"
});

// Sortable demo
export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Sortable",
  title: "Demo",
  description: "Drag and sort component demo",
  letter: "So", // different from "AC", "GH", etc.
});

// Test route
export const metadata = createRouteMetadata("/tests", {
  title: "Form Tests",
  description: "...",
  letter: "FT", // unique across test tabs
});
```

---

## Route Discovery System Integration

When `RouteIndexPage` is used for a section index page, it automatically:

1. Resolves the favicon for the `basePath`
2. Renders the favicon badge next to the page title
3. Uses the favicon color as a left-border accent on group cards in `GroupedCardsDisplay`

No extra code needed — pass `basePath="/my-feature"` and it works.

See `.claude/skills/route-discovery-system/SKILL.md` for full `RouteIndexPage` usage.

---

## Checklist for a New Route

```
- [ ] favicon entry added to favicon-route-data.ts with a UNIQUE color (or a family constant)
- [ ] letter is 1–2 chars — NEVER 3 — and free within that route's COLOUR family
- [ ] an admin page that mirrors a real feature reuses that feature's exact code
- [ ] a page that will not reduce to 2 readable characters uses `emoji` instead
- [ ] `pnpm check:favicon-letters` is green
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

**Custom favicon for a route not in favicon-route-data.ts:**

```typescript
import { createCustomFaviconMetadata } from "@/utils/favicon-utils";
export const metadata = createCustomFaviconMetadata(
  { color: "#f97316", letter: "Xp" },
  { title: "Special Route", description: "..." },
);
```

---

## Common Mistakes

| Mistake                                                 | Correct approach                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `title: "Agents Build"`                                 | `titlePrefix: "Build", title: "Agents"`                                           |
| `title: "My Route \| AI Matrx"`                         | `title: "My Route"` (root template adds brand)                                    |
| Passing `/agents/123/build` to helpers                  | Always pass root: `/agents`                                                       |
| `favicon: { color, letter }` on admin nav entry         | Omit it — system color covers all `/administration/*`                             |
| Omitting `letter` on a demo/test/admin layout           | Every route in these families MUST have a unique `letter`                         |
| Reusing the same `letter` across two demo routes        | Defeats the whole purpose — scan the nearby layouts first                         |
| Picking a color already in the table for primary routes | Check the full table above first                                                  |
| 1-char letter on a high-traffic route                   | Use 2-char — more visually distinct at 16px                                       |
| Same first letter with ambiguous second                 | `Pb` vs `Pa` works; `Pb` vs `Pc` is risky — pick visually distinct shapes         |
| Thinking the system letter fallback is acceptable       | The path-derived fallback is a safety net only — always pass an explicit `letter` |
| A 3-character code (`BTU`, `ADA`, `WRL`)                | Two characters, or an `emoji`. There is no third option — the guard fails the run  |
| `AD`/`A…` prefixing an admin page to mark it as admin   | Reuse the real feature's code; the near-black tile already says admin              |
| Making a letter globally unique across all ~400 routes  | Only same-COLOUR routes can collide — a core tab and an admin tab are two tiles    |
| Guessing that your new letter is free                   | Run `pnpm check:favicon-letters` — it judges length and same-colour collisions     |
| Repeating a family hex instead of its constant          | Import `DOCS_COLOR` / `SHEETS_COLOR` / … from `constants/favicon-route-data.ts`   |
