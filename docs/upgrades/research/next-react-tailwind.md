# Next.js 16 / React 19.2 / Tailwind 4.3 — Adoption Doc

> Per the "update means maximize features" rule: this is a focused list of **NEW capabilities** in our current stack lines that we should adopt. Each item = 1-line *what* + 1-line *recommendation for this repo*. Citations inline.
>
> Researched mid-2026. Sources: [nextjs.org/blog](https://nextjs.org/blog), [react.dev/blog](https://react.dev/blog), [tailwindcss.com/blog](https://tailwindcss.com/blog), official docs.

---

## 1. Current versions

| Package | Version |
|---|---|
| Next.js | 16.2.9 |
| React | 19.2.7 |
| Tailwind CSS | 4.3.2 |

Repo state (verified): `proxy.ts` already in place ✅ · `reactCompiler: false` (temporarily disabled for build-time, `next.config.js`) · no `cacheComponents` flag set · Turbopack configured.

---

## 2. Next.js 16 features to ADOPT

Refs: [Next 16 blog](https://nextjs.org/blog/next-16) · [v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) · [cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) · [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache) · [proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

| Feature | What | Recommendation for our repo |
|---|---|---|
| `'use cache'` + `cacheTag`/`cacheLife` | Explicit, opt-in caching at file/component/function level; compiler auto-generates cache keys. ([docs](https://nextjs.org/docs/app/api-reference/directives/use-cache)) | Adopt incrementally for expensive **static-ish** server reads (AI model registry, official-component metadata, marketing/legal pages). Tag with `cacheTag()`, invalidate via `revalidateTag()`. Note: cached scopes **cannot** read `cookies()`/`headers()`/`searchParams` — pass them in as args. |
| Cache Components / PPR | `cacheComponents: true` makes the App Router dynamic-by-default and ships a prerendered static shell that streams dynamic content (PPR is now the default model; old `experimental.ppr`/`dynamicIO`/`useCache` flags removed). ([cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)) | High-leverage but a behavior change — **pilot on one route group** (e.g. `(public)` marketing/legal/share) behind `<Suspense>` boundaries before enabling globally. Aligns perfectly with our "dynamic by default, cache explicitly" constitution. |
| Turbopack (stable default) | Now the default bundler for `next dev` and `next build`; Turbopack config moved to top-level `turbopack` key. ([blog](https://nextjs.org/blog/next-16)) | Already on it. Drop any leftover `--turbopack` flags. Evaluate **Turbopack FS Caching (beta)** to speed cold builds (we have a known build-time bloat sensitivity). |
| `proxy.ts` (was `middleware.ts`) | Middleware renamed to `proxy.ts`/`export function proxy`; runs Node.js runtime only (no `edge`). ([proxy docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)) | **Done** — repo already has `proxy.ts`. Keep it thin (auth/guards/redirects only). If any `edge`-runtime need arises, it must stay on `middleware` until Next ships edge support. |
| React Compiler integration | Next 16 ships first-class React Compiler support via `reactCompiler` config (compiler is stable in the React 19.x line). | Currently `reactCompiler: false` (disabled to baseline build time). **Re-enable once build-time is baselined** — it's the prerequisite for dropping manual memoization (§5). Re-measure build with it on vs off. |
| Metadata / OG APIs | File-based `opengraph-image.(tsx\|jpg)`, `generateMetadata()`, automatic Twitter/OG tags in initial HTML. | Audit feature entry routes (`/agents`, `/chat`, public share pages) for `generateMetadata()` + per-route `opengraph-image.tsx`. Best ROI on `(public)` + share links. |
| Next.js Devtools MCP | Built-in Model Context Protocol server for debugging/build introspection. ([blog](https://nextjs.org/blog/next-16)) | Wire into our agent tooling for build/debug introspection — low cost, complements existing MCP setup. |

---

## 3. React 19.2 features to ADOPT

Refs: [React 19.2 blog](https://react.dev/blog/2025/10/01/react-19-2) · [`<Activity>`](https://react.dev/reference/react/Activity) · [`<ViewTransition>`](https://react.dev/reference/react/ViewTransition) · [useActionState](https://react.dev/reference/react/useActionState)

| Feature | What | Recommendation for our repo |
|---|---|---|
| Actions + `useActionState` | Manages async action state (pending/result/error) for form-style mutations. ([docs](https://react.dev/reference/react/useActionState)) | Use for form-driven mutations (settings, invites, agent CRUD) — replaces hand-rolled `isLoading`/`error` `useState` triads. Pairs with structured-error rule. |
| `useOptimistic` | Shows immediate optimistic UI, auto-reverts when the real result lands. ([docs](https://react.dev/reference/react/useActionState#using-with-useoptimistic)) | Adopt for snappy mutations: tagging, favorites/pinning (dashboard), soft-delete/rename markers, reactions. Combine with `useActionState`. |
| `use()` | Reads a promise or context conditionally inside render (suspends on the promise). | Use to consume promises/context in client components without effect-juggling; good fit alongside `<Suspense>` data streaming. |
| ref-as-prop | `ref` is now a normal prop — `forwardRef` no longer needed. | **Boy-scout migration**: drop `forwardRef` wrappers when touching a component. Simplifies our official component library. |
| `<Activity>` | Pre-render/keep-alive UI in `hidden` mode (state preserved, effects unmounted, low-priority) vs `visible`. ([docs](https://react.dev/reference/react/Activity)) | High-leverage for our overlay/window-panel + tab-heavy surfaces: preserve state across panel hide/show, prefetch likely-next routes, keep back-nav state. Replaces conditional unmount that loses input state. |
| `<ViewTransition>` | Declarative animations on transitions triggered by `startTransition`/`Suspense`/`useDeferredValue` (browser `startViewTransition`). ([docs](https://react.dev/reference/react/ViewTransition)) | Use for route/panel/page cross-fades and expand/reorder. We already wrap nav in `startTransition` — wrapping with `<ViewTransition>` gives animation for near-free. Use for UI transitions, not as a general animation engine. |
| React Compiler (stable) | Automatic memoization; no manual `useMemo`/`useCallback`/`React.memo`. | See §2 (`reactCompiler` re-enable) and §5 anti-patterns. Stable in the 19.x line — the doctrine target. |

---

## 4. Tailwind 4.x features to ADOPT

Refs: [v4.3 blog (covers 4.2+4.3)](https://tailwindcss.com/blog/tailwindcss-v4-3) · [v4.2.0 release](https://github.com/tailwindcss/tailwindcss/releases/tag/v4.2.0) · [v4.3.0 release](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.0) · [custom styles](https://tailwindcss.com/docs/adding-custom-styles)

| Feature | What | Recommendation for our repo |
|---|---|---|
| `@theme` (CSS-first config) | Define tokens (colors, spacing, breakpoints, easings) directly in CSS. ([docs](https://tailwindcss.com/docs/adding-custom-styles)) | Already our model (`app/globals.css`). Keep all new design tokens in `@theme`; no JS config, no inline styles. |
| oklch colors | Theme palette expressed in `oklch()` for wider gamut + perceptually-uniform shades. | Use `oklch()` for any new brand/semantic color tokens; gives better dark-mode contrast control than hex/HSL. |
| Container queries (`@container`) + `@container-size` (v4.3) | `@container` = inline-size container; new `@container-size` adds **height-aware** container queries. ([v4.3](https://tailwindcss.com/blog/tailwindcss-v4-3)) | Prefer container queries over viewport breakpoints for reusable cards/panels (war-room tiles, dashboard widgets, window panels) so they adapt to their slot, not the screen. |
| `@utility` (+ functional, v4.3) | Register custom utilities; v4.3 allows default values via `--default()` and multiple same-name defs by value type. ([v4.3](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.0)) | Convert repeated arbitrary-value patterns into named `@utility`s (e.g. our header-height / safe-area helpers). Functional utilities replace ad-hoc CSS. |
| Stacked + compound `@variant` (v4.3) | `@variant hover:focus {}` and `@variant hover, focus {}` directly in CSS. ([v4.3](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.0)) | Use in component CSS to express combined states without nesting boilerplate. |
| Scrollbar utilities (v4.3) | `scrollbar-{auto,thin,none}`, `scrollbar-thumb-*`, `scrollbar-track-*`, `scrollbar-gutter-*`. ([v4.3](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.0)) | Replace any custom scrollbar CSS / `scrollbar-hide` plugins with first-party utilities across panels and scroll areas. |
| Logical properties (v4.2) | `pbs-*`/`pbe-*`, `mbs-*`/`mbe-*`, `inline-*`/`block-*`, `inset-bs-*`… (`start-*`/`end-*` deprecated). ([v4.2](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.2.0)) | Prefer logical props for direction-agnostic layouts; migrate off deprecated `start-*`/`end-*` opportunistically. |
| `font-features-*` (v4.2) | Utility for OpenType `font-feature-settings` (no custom CSS). | Use for tabular numerals / ligature control in data-dense tables and number displays. |
| `zoom-*`, `tab-*` (v4.3) | CSS `zoom` and tab-character width utilities. ([v4.3](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.0)) | Minor — `tab-*` useful in code/log viewers; `zoom-*` situational. |
| New palettes (v4.2) | `mauve`, `olive`, `mist`, `taupe` neutral-ish palettes. | Optional additional neutrals; we already standardize on zinc — adopt only if a surface needs them. |

---

## 5. Anti-patterns to grep & fix

| Anti-pattern | Why it's wrong now | Grep / fix |
|---|---|---|
| Manual `useMemo` / `useCallback` / `React.memo` | React Compiler auto-memoizes — manual memo is noise/bug surface **once `reactCompiler` is re-enabled**. | `rg "useMemo\|useCallback\|React\.memo" --type tsx` — strip when touching files (after compiler re-enabled). Hundreds of hits exist (e.g. `components/admin/server-logs/CoolifyLogViewer.tsx`). |
| `middleware.ts` / `export function middleware` | Renamed to `proxy.ts` in Next 16. | `rg "middleware"` — repo already migrated to `proxy.ts` ✅; just guard against regressions. |
| `h-screen` / `min-h-screen` / `vh` units | Breaks on mobile (iOS dynamic toolbar); must use `h-dvh`/`min-h-dvh`. | `rg "h-screen\|min-h-screen"` — currently **0 matches in `.tsx`** ✅; keep enforced. |
| Raw `<img>`/`<video>` for our media | Signed URLs expire; must re-mint via `file_id`. | Use `<InlineMediaRef>` (see CLAUDE.md media durability). |
| `window.confirm/alert/prompt` | Banned (unstyled OS chrome). | `rg "window\.(confirm\|alert\|prompt)\|\b(confirm\|alert\|prompt)\("` → `<ConfirmDialog>` / `toast` / `<TextInputDialog>`. |
| `forwardRef` wrappers | Unnecessary in React 19 (ref is a prop). | `rg "forwardRef"` — remove opportunistically. |
| Implicit/legacy caching assumptions | App Router is dynamic-by-default in 16; caching is opt-in via `'use cache'`. | Audit places assuming auto-caching; make caching explicit + tagged. |
| Deprecated Tailwind `start-*`/`end-*` | Superseded by logical inset utils (v4.2). | `rg "\b(start|end)-[0-9]"` — migrate to `inset-s-*`/`inset-e-*`. |

---

### Notes / sequencing

1. **Re-enable React Compiler first** (gate for the whole §5 memo cleanup) — but only after baselining build time, since it was disabled precisely for build-time scaling concerns.
2. **Pilot Cache Components on one route group** before global enablement (behavior change).
3. Tailwind items are mostly **boy-scout** — adopt as you touch files; container queries + scrollbar utils are the highest-value net-new.
