# lucide-react upgrade research: 0.577.0 → 1.22.0

> **Status:** Research only — no code changed.
> **Date:** 2026-06-29
> **Author:** research agent
> **Verdict (TL;DR):** The 1.0 line is a **low-risk, high-value upgrade** for us. The only real breakage is **removed brand icons** (GitHub, Slack, YouTube, Twitter/X, Facebook, Instagram, LinkedIn, Figma, GitLab, Chrome, …) — and we import several of them in ~25 files. **None of the shape-rename "aliases" we lean on (`CheckCircle`, `AlertCircle`, `XCircle`, `HelpCircle`, `CheckCircle2`, …) were removed — they still ship as aliases in 1.22.0** (verified against the published package). Types (`LucideIcon`, `LucideProps`) are unchanged, React 19 is in the peer range, and the package is ~32% smaller.

---

## How this was verified

Two evidence sources, cross-checked:

1. **Official Lucide docs / releases** (cited inline by URL).
2. **Empirical inspection of the actual published `lucide-react@1.22.0` tarball** (`npm pack lucide-react@1.22.0`, then grepped `dist/lucide-react.d.ts` — 26,226 lines — and `dist/esm/`). Where the third-party migration blog and the official docs disagreed, the **published package won**. Findings below marked _(verified in 1.22.0 package)_ come from that inspection.

---

## 1. Our usage inventory

`lucide-react` is one of the most pervasive dependencies in the repo. It is the mandated icon library (Lucide only, no emojis), so essentially every interactive surface imports from it.

| Metric | Count | How measured |
|---|---:|---|
| Files referencing `lucide-react` | **3,197** | `rg -l "lucide-react"` over `*.ts,*.tsx` |
| Direct import sites (`from "lucide-react"` / `'lucide-react'`) | **3,184** | `rg -l "from ['\"]lucide-react['\"]"` |
| Files using the `LucideIcon` type | **206** | `rg -l "\bLucideIcon\b"` |
| Files using the `LucideProps` type | **2** | `rg -l "\bLucideProps\b"` |
| Namespace imports (`import * as X from "lucide-react"`) | **18** | `rg -l "import \* as \w+ from ..."` |
| Installed version (lockfile) | **0.577.0** | `require('lucide-react/package.json').version` |
| `package.json` spec | `"lucide-react": "latest"` | pinned to `latest`, lockfile resolves to 0.577.0 |

### Common patterns we use

| Pattern | Example | Notes |
|---|---|---|
| **Named static import** (dominant) | `import { Check, X, ChevronDown } from "lucide-react"` | ~3,184 sites. The overwhelming majority. |
| **Aliased import** | `import { Youtube as YoutubeIcon } from "lucide-react"` | Common for name clashes. |
| **`LucideIcon` type for props/maps** | `icon: LucideIcon` / `Record<string, LucideIcon>` | 206 files — e.g. nav configs, registries, `getDynamicIcons.tsx`. |
| **Namespace import + name lookup** | `import * as Icons from "lucide-react"; Icons[pascalName]` | 18 files. Bundle concern — see §6. e.g. `features/scope-system/utils/resolveIcon.ts`. |
| **Runtime dynamic-by-name** | `await import("lucide-react"); module[iconName]` | Our `IconResolver` — see custom wrappers below. |
| **Props in JSX** | `size`, `className` (`h-4 w-4`), `strokeWidth`, `color`, `style` | `strokeWidth=` used across ~200+ files; `size`/`className` near-universal. |

### Custom icon wrappers in the repo (important — these centralize most of the risk & opportunity)

| Wrapper | File | What it does | Relevance to 1.0 |
|---|---|---|---|
| `IconResolver` / `DynamicIcon` (our own) | `components/official/icons/IconResolver.tsx` | Resolves an icon **by string name**. ~140 icons statically bundled in `staticLucideIconMap`; anything else does `await import("lucide-react")` then indexes `module[iconName]`. Also merges `react-icons` (`Fc*`, `FaBrave`) and public `svg:` assets. | **Prime candidate to adopt Lucide's official `<DynamicIcon>` (`lucide-react/dynamic`)** for the dynamic path — per-icon code-split chunks instead of pulling the whole barrel. Note our component is **also** named `DynamicIcon`, which collides conceptually with Lucide's export. |
| `getDynamicIconSelection` + `IconMatch[]` | `utils/icons/getDynamicIcons.tsx` | Keyword→icon heuristic map (statically imports ~80 named icons + `LucideIcon` type). | Pure named imports; safe. No brand icons in the map. |
| `resolveIcon` | `features/scope-system/utils/resolveIcon.ts` | `import * as Icons` then PascalCase lookup, fallback `Folder`. | Namespace import → see §6 bundle note. Functionally safe in 1.0. |
| `isLucideModuleIconExport` | `utils/icons/lucide-module-icon.ts` | Detects whether a namespace export is a renderable icon. | Safe; icons remain forwardRef/memo components in 1.0. |
| `getIconComponent` / `renderIcon` / `getIconWithColorAndSize` | `components/official/icons/IconResolver.tsx` | Sync helpers over the static map. | Safe. |
| Admin icon resolver | `app/(admin)/administration/official-components/component-displays/icon-resolver.tsx` | Admin-side variant of the resolver. | Same considerations as `IconResolver`. |

### Build config already in place

`next.config.js` already has:

```js
// Optimize lucide-react (the 1400+ icon barrel file) and zustand to avoid massive SSR chunks
optimizePackageImports: ['lucide-react', 'zustand'],
```

So Next.js already rewrites our barrel named-imports into per-icon imports at build time (good — this is why our 3,184 named-import sites don't each pull the full barrel). This stays valid in 1.0.

---

## 2. Version delta — what 0.577 → 1.22 / "1.0" signifies

| Aspect | 0.577.0 (current) | 1.x (1.22.0 latest) |
|---|---|---|
| Release line | Pre-1.0 (continuous `0.x` minor bumps, no stability guarantee) | **First stable major.** 1.0.0 published **2026-03-23** ([GitHub release](https://github.com/lucide-icons/lucide/releases/tag/1.0.1)); covered by [InfoQ, June 2026](https://www.infoq.com/news/2026/06/lucide-v1-icons/)). 1.22.0 is current `latest`. |
| Stability | `0.x` semantics: any minor could break | SemVer stability guarantees; icon set 1,600+ ([OTF](https://otf-kit.dev/blog/lucide-icons)) |
| Module formats | ESM + CJS + **UMD** | **UMD dropped** — ESM + CJS only ([version-1 guide](https://lucide.dev/guide/version-1)) |
| Package size | ~11.4 MB | **~1 MB gzipped — 32.3% reduction** ([version-1 guide](https://lucide.dev/guide/version-1)) _(verified: `module: dist/esm/lucide-react.mjs`, `main: dist/cjs/lucide-react.js`)_ |
| React peer range | `^16 … ^19` | `react: "^16.5.1 \|\| ^17 \|\| ^18 \|\| ^19"` — **React 19 fully supported** _(verified via `npm view lucide-react@latest peerDependencies`)_ |
| Brand icons | Present (GitHub, Slack, YouTube, …) | **All removed** ([brand-logo statement](https://lucide.dev/guide/react/migration)) |
| Default props provider | none | **`<LucideProvider>`** context for shared defaults _(verified: `LucideProvider` exported)_ |
| Dynamic-by-name | `lucide-react/dynamic` `<DynamicIcon>` (already exists in 0.x) | Still present, `lucide-react/dynamic` _(verified: `dist/dynamic.d.ts` declares `DynamicIcon`)_ |
| Accessibility | icons render without `aria-hidden` | **`aria-hidden="true"` by default** on decorative icons ([version-1 guide](https://lucide.dev/guide/version-1)) |
| Types | `LucideIcon`, `LucideProps` | **Unchanged & still exported** _(verified: both present in 1.22.0 `d.ts`)_ |

What "1.0" really buys us: a **stable public API contract** (we can stop pinning `"latest"` and pin a real range), a **meaningfully smaller package**, **default accessibility**, and a **provider for app-wide icon defaults** — with a tiny, well-bounded breakage surface.

---

## 3. Breaking changes

### 3a. Brand icons removed — **this is our only material breakage**

All trademarked brand logos were removed for legal/maintenance reasons; Lucide points users to [Simple Icons](https://simpleicons.org) ([migration guide](https://lucide.dev/guide/react/migration), [InfoQ](https://www.infoq.com/news/2026/06/lucide-v1-icons/)).

_(verified in 1.22.0 package: each of the following has **0 occurrences** in `dist/lucide-react.d.ts`, while non-brand controls like `Coffee`, `Code`, `Camera` have 5):_

| Brand icon | In 0.577? | In 1.22? | We import it from lucide? |
|---|:--:|:--:|---|
| `Youtube` | yes | **REMOVED** | **Yes — heavily** (agents messages/resources, public-chat, cx-chat, podcast studio, resource pickers, image-studio) |
| `Github` | yes | **REMOVED** | **Yes** (`agent-connections/.../RegistriesSection.tsx`, `PreferencesSection.tsx`, demos) |
| `Twitter` | yes | **REMOVED** | **Yes** (`canvas/social/CanvasShareSheet.tsx`, `image-studio/presets.ts`) |
| `Facebook` | yes | **REMOVED** | **Yes** (`CanvasShareSheet.tsx`, `image-studio/presets.ts`) |
| `Linkedin` | yes | **REMOVED** | **Yes** (`CanvasShareSheet.tsx`, `image-studio/presets.ts`) |
| `Instagram` | yes | **REMOVED** | **Yes** (`image-studio/presets.ts`) |
| `Chrome` | yes | **REMOVED** | **Yes** (`settings/registry.ts`, `image-studio/presets.ts`, `settings/SettingsLayoutClient.tsx`) |
| `Gitlab` | yes | **REMOVED** | likely (demos) |
| `Slack` | yes | **REMOVED** | check demos; most repo "Slack" hits are text, not icons |
| `Figma`, `Framer`, `Dribbble`, `Codepen`, `Codesandbox`, `Chromium`, `Pocket`, `RailSymbol` | yes | **REMOVED** | mostly text/labels; grep to confirm |

> ⚠️ **Note:** the official React migration page lists only a 14-icon subset, but the published 1.22.0 package also has `Youtube`, `Twitter`, `Facebook`, `Instagram`, `Linkedin`, `Chrome` **removed** (0 occurrences). Trust the package, not the abbreviated list. **~25 files** in our repo import a removed brand icon (see §5 grep). Worst offenders: `features/image-studio/presets.ts` (6 brand icons) and `features/canvas/social/CanvasShareSheet.tsx`.

### 3b. Icon renames — **NOT a breakage for us**

The "shape-first" renames (`XCircle`→`CircleX`, `CheckCircle`→`CircleCheck`, `AlertCircle`→`CircleAlert`, `HelpCircle`→`CircleHelp`, `CheckCircle2`→`CircleCheckBig`, etc.) that a [third-party migration blog](https://iconsearch.info/blog/lucide-react-1-migration-guide) frames as "1.0 breaking changes" actually happened earlier in the `0.x` line, and **the old names are retained as aliases in 1.x**.

_(verified in 1.22.0 package: `XCircle`, `CheckCircle`, `AlertCircle`, `HelpCircle`, `CheckCircle2` are all still present as alias exports, alongside the canonical `CircleX`, `CircleCheck`, etc.)_

We use the legacy alias names **a lot** (`CheckCircle`, `AlertCircle`, `XCircle`, `HelpCircle` appear in hundreds of files, including `components/official/icons/IconResolver.tsx`'s static map). **These will keep working after the upgrade.** They are deprecated aliases though, so a future major *could* drop them — see the optional cleanup in §5.

### 3c. Other API/format changes

| Change | Impact on us |
|---|---|
| **UMD build removed** (ESM/CJS only) | **None.** We consume via Next.js/Turbopack bundler (ESM). No `<script>` UMD usage. |
| **`aria-hidden="true"` by default** | Behavioral: any icon that was *implicitly* acting as an accessible element (no label) is now hidden from screen readers. For our decorative icons this is correct & desirable. For the rare icon-only control relying on the SVG for its a11y name, add `aria-label`/`aria-hidden={false}`. Low risk; worth a spot-check on icon-only buttons. |
| **Types `LucideIcon` / `LucideProps`** | **None.** Both still exported, same shape _(verified)_. Our 206 `LucideIcon` typings and 2 `LucideProps` usages are safe. |
| **`lucide-vue-next`→`@lucide/vue`, new `@lucide/angular`** | **None.** We're React-only. |
| **Default `strokeWidth`** | Unchanged (still `2`). Our ~200 `strokeWidth=` overrides are unaffected. |

---

## 4. ADVANTAGES / new features to ADOPT (the key deliverable)

| Advantage | What it is | How matrx-frontend benefits | Adopt? |
|---|---|---|---|
| **~32% smaller package (11.4 MB → ~1 MB gz)** | UMD dropped, leaner build ([version-1](https://lucide.dev/guide/version-1)) | Smaller `node_modules`, faster cold installs, less for the bundler/`optimizePackageImports` to chew through. Given our documented sensitivity to build-time bloat, a smaller barrel is pure upside. | **Yes — automatic on upgrade.** |
| **Stable 1.x SemVer contract** | First stable major | Lets us replace `"lucide-react": "latest"` with a pinned `^1` range — reproducible builds, no surprise breakage from a random minor (the whole reason `0.x` was risky). | **Yes — pin `^1.22.0`.** |
| **`<LucideProvider>` for default props** | Context provider for `size`/`color`/`strokeWidth` defaults _(verified export)_ | We currently repeat `className="h-4 w-4"` / `strokeWidth` everywhere. A provider at the shell level could set app defaults, reducing per-icon prop noise and enforcing consistency. **But** we set size via Tailwind classes (`h-4 w-4`), and CSS overrides provider props — so adopt **selectively** (e.g. default `strokeWidth`), not as a blanket replacement for our class-based sizing. | **Optional / selective.** Evaluate for `strokeWidth` consistency; don't rip out class-based sizing. |
| **Official `<DynamicIcon>` (`lucide-react/dynamic`)** | Lazy, per-icon, code-split dynamic-by-name component _(verified `dist/dynamic.d.ts`)_ | Our `IconResolver` does `await import("lucide-react")` for the non-static path, which can pull the **entire** barrel into a chunk. Lucide's `<DynamicIcon name="...">` lazy-loads **only the requested icon's** chunk. Refactoring `IconResolver`'s dynamic branch onto `lucide-react/dynamic` would cut the worst-case dynamic-icon payload. | **Yes — high-value, contained refactor** of `IconResolver` + admin `icon-resolver.tsx`. |
| **`aria-hidden` by default** | Decorative icons hidden from AT | Better baseline accessibility across thousands of icons with zero work; aligns with enterprise a11y expectations. | **Yes — automatic.** Spot-check icon-only controls. |
| **1,600+ icons** | Larger, consistent set ([OTF](https://otf-kit.dev/blog/lucide-icons)) | More coverage for new icon needs; fewer reasons to reach for `react-icons`. | **Yes — passive benefit.** |
| **`llms.txt` + revamped per-framework docs** | AI-tooling-friendly docs ([version-1](https://lucide.dev/guide/version-1)) | Better agent/codegen accuracy when our tooling picks icons. | Passive benefit. |
| **Shadow-DOM support / stable font code points** | In the `lucide` (vanilla) package | Not relevant — we use `lucide-react`, not the font/vanilla package. | No. |

---

## 5. Migration steps

> Estimated effort: **small** — the only hand work is replacing ~25 files' brand-icon imports. Everything else is a version bump.

1. **Bump the dependency (pin a real range):**
   ```bash
   pnpm add lucide-react@^1.22.0
   ```
   Replace the `"latest"` spec with `^1.22.0` in `package.json` for reproducibility.

2. **Find every removed-brand-icon import (the actual breakage).** Run the codemod first, then this grep to catch anything left:
   ```bash
   # Official codemod (handles renames/known removals where possible):
   npx @lucide/codemod@latest migrate-from-0.x   # per third-party guide; confirm exact name from `lucide.dev/guide/react/migration`

   # Authoritative grep for brand icons imported from lucide-react in OUR code:
   rg -n --pcre2 \
     '(^\s*(Youtube|Github|Gitlab|Slack|Linkedin|Twitter|Facebook|Figma|Framer|Instagram|Chrome|Chromium|Dribbble|Codepen|Codesandbox|Pocket|RailSymbol)\b.*$)' \
     -g '*.ts' -g '*.tsx'
   # Then verify each hit is a real `from "lucide-react"` import (not JSX label text).
   ```
   Known files to fix (non-exhaustive — confirm with grep):
   - `features/image-studio/presets.ts` (Youtube, Instagram, Linkedin, Twitter, Facebook, Chrome)
   - `features/canvas/social/CanvasShareSheet.tsx` (Twitter, Facebook, Linkedin)
   - `features/agent-connections/components/sections/RegistriesSection.tsx`, `PreferencesSection.tsx` (Github)
   - `features/settings/registry.ts`, `app/(transitional)/settings/SettingsLayoutClient.tsx` (Chrome)
   - Multiple `Youtube` sites: agents messages-display, public-chat, cx-chat, podcast studio create-*, resource pickers.

3. **Replace removed brand icons.** Options, in order of preference:
   - Use a dedicated brand-icon source ([Simple Icons](https://simpleicons.org) / `react-icons` `Fa*`/`Si*`), which our `IconResolver` already integrates (`customIconMap`). Add the needed brand glyphs there once and reference by name.
   - Or commit local SVGs to our public-SVG registry (`utils/icons/matrx-public-svg-registry`) and reference via the existing `svg:` path mechanism.
   - For generic intents (e.g. a "share to social" affordance), swap to a non-brand Lucide icon (`Share2`, `Link`, `Globe`).

4. **(Optional, recommended) Adopt official `<DynamicIcon>`** in `components/official/icons/IconResolver.tsx` and the admin `icon-resolver.tsx`: replace the `await import("lucide-react")` + `module[name]` branch with `import { DynamicIcon } from "lucide-react/dynamic"` and `<DynamicIcon name={kebabName} />`. Note name format is **kebab-case** (`circle-x`), so map our PascalCase names accordingly. Rename our local `DynamicIcon` export to avoid confusion (e.g. `MatrxIcon`).

5. **(Optional) Cleanup deprecated aliases** to future-proof (they still work in 1.x but are deprecated): codemod `CheckCircle→CircleCheck`, `AlertCircle→CircleAlert`, `XCircle→CircleX`, `HelpCircle→CircleHelp`, `CheckCircle2→CircleCheckBig`, etc. Keep `components/official/icons/IconResolver.tsx`'s `staticLucideIconMap` keys backward-compatible (keep old keys as aliases) so stored icon-name strings in the DB still resolve.

6. **A11y spot-check:** find icon-only interactive controls and ensure they have `aria-label` (now that icons are `aria-hidden` by default).

7. **Verify & ship:** `pnpm type-check` (catches any missed removed-icon import as `has no exported member`), build, then run the repo's `finalize-and-ship` checks.

---

## 6. Risk

| Risk area | Assessment |
|---|---|
| **Bundle size / build-time bloat** (we care most) | **Net positive.** Package shrinks ~32%. `optimizePackageImports: ['lucide-react']` already tree-shakes our 3,184 named-import sites, so per-route icon cost is already minimal and stays so. **Watch item:** the **18 `import * as Icons from "lucide-react"`** namespace imports (e.g. `resolveIcon.ts`) and our `IconResolver`'s `await import("lucide-react")` can defeat tree-shaking and pull the whole (now smaller) barrel into a chunk — adopting official `<DynamicIcon>` (§4/§5.4) removes that risk. No regression expected from the upgrade itself. |
| **SSR / React 19 / React Compiler** | **Low.** React 19 is in the peer range _(verified)_. Icons are standard forwardRef function components — compatible with React Compiler (no manual memo needed) and SSR. ESM/CJS dual build works with Turbopack. UMD removal is irrelevant (no `<script>` usage). |
| **Type breakage** | **Very low.** `LucideIcon` (206 files) and `LucideProps` (2 files) are unchanged & still exported _(verified)_. `pnpm type-check` will flag the only real failures: removed brand-icon imports. |
| **Renamed-icon breakage** | **None for the upgrade itself** — legacy aliases retained in 1.22.0 _(verified)_. Only relevant if/when a future major drops aliases (mitigated by optional §5.5 cleanup). |
| **Accessibility behavior change** | **Low, mostly positive.** `aria-hidden` default improves baseline; only risk is an icon-only control that depended on the SVG for its accessible name — spot-check (§5.6). |
| **DB-stored icon names** | **Watch item.** We store icon-name strings (e.g. `ctx_scope_types.icon`, applet configs) resolved at runtime via `IconResolver`/`resolveIcon`. If any stored value is a removed brand name (`Github`, `Youtube`, …), it will silently fall back (`Zap`/`Folder`). Audit stored icon values for brand names during migration. |

---

## Sources

- Official: [Lucide Version 1 guide](https://lucide.dev/guide/version-1) · [React migration from v0](https://lucide.dev/guide/react/migration) · [GitHub release 1.0.1](https://github.com/lucide-icons/lucide/releases/tag/1.0.1)
- Coverage: [InfoQ — Lucide 1.0 (June 2026)](https://www.infoq.com/news/2026/06/lucide-v1-icons/) · [OTF blog](https://otf-kit.dev/blog/lucide-icons)
- Third-party migration detail (rename table; treat renames-as-breaking claim with caution — contradicted by the package): [iconsearch.info migration guide](https://iconsearch.info/blog/lucide-react-1-migration-guide)
- Empirical: `npm view lucide-react@latest` (→ 1.22.0, peer `react ^16.5.1 || ^17 || ^18 || ^19`) and inspection of the published `lucide-react@1.22.0` tarball (`dist/lucide-react.d.ts`, `dist/esm/`, `dist/dynamic.d.ts`).
