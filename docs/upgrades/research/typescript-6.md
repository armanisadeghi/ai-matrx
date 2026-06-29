# TypeScript 5.9.3 → 6.0.3 — Upgrade Research

> Research for `matrx-frontend` (Next.js 16 + React 19). Sources are official only and cited inline.
> **Repo baseline:** `tsconfig.json` is **fully loose** — `strict`, `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`, `forceConsistentCasingInFileNames` are **all `false`**; `target: es2018`, `module: esnext`, `moduleResolution: bundler`, `baseUrl: "."`, `types: ["node","react","react-dom","jest"]`, `skipLibCheck: true`, `noEmit: true`.

---

## 1. Version delta

| Item | Value |
|---|---|
| From → To | TypeScript **5.9.3 → 6.0.3** |
| 6.0 GA | **2026-03-23** ([Visual Studio Magazine](https://visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx)); RC announced shortly before ([6.0 RC blog](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0-rc/)) |
| 6.0.3 | Patch on the 6.0 line (bug fixes only; same feature/breaking surface as 6.0.0) |
| Nature | **Final JavaScript-based TypeScript release.** A deliberate *transition/bridge* release between 5.9 and the Go-native **7.0** ("Project Corsa"). Most changes are new defaults + deprecations that become **hard removals in 7.0**. ([Announcing 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)) |
| Why it matters | This is the classic TS `x.0` major: it carries the breaking deprecations. Adopting 6.0 cleanly = your staging ground for 7.0. ([7.0 RC blog](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/)) |

---

## 2. Breaking changes & deprecations

All deprecations below still *work* in 6.0 if you set `"ignoreDeprecations": "6.0"`, but are **removed entirely in 7.0** regardless of that flag. ([6.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html))

### 2a. Changed defaults (only bite if you relied on the old default)

| Option | Old default | New 6.0 default | Hits our repo? |
|---|---|---|---|
| `strict` | `false` | **`true`** | **No** — we set `strict: false` *explicitly*, which still works. The bump does **not** silently turn strict on. |
| `module` | inferred | `esnext` | No — already `esnext`. |
| `target` | `es3`/inferred | current-year ES (`es2025`) | No — `target: es2018` is explicit and still valid (lowest allowed is `es2015`). |
| `types` | "all of `node_modules/@types`" | **`[]`** | No — we set an explicit array. (Good: this is the 20–50% build-time win, already captured.) |
| `noUncheckedSideEffectImports` | `false` | `true` | Possible minor — flags typo'd side-effect-only imports. |
| `libReplacement` | `true` | `false` | No impact (perf-only). |
| `rootDir` | inferred common dir | dir of `tsconfig.json` | No — `noEmit: true`, so `rootDir` is irrelevant. |

Source for all defaults: [6.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html).

### 2b. Deprecated options / syntax (now emit deprecation errors)

| Deprecated | What breaks | **In our tsconfig?** |
|---|---|---|
| `baseUrl` | No longer a module look-up root; deprecated outright. | **YES — `baseUrl: "."`.** Top hit. See migration §4. |
| `alwaysStrict: false` (and any `strict`-family flag toggled via `--alwaysStrict false`) | Can't set `alwaysStrict` to `false`; all code is strict-mode JS. | **YES — `alwaysStrict: false` is set.** Just remove it. |
| `moduleResolution: node` (a.k.a. `node10`) | Deprecated; migrate to `nodenext` or `bundler`. | **YES — in the `ts-node` block** (`moduleResolution: node`, `module: commonjs`). Main `compilerOptions` already uses `bundler` (fine). |
| `moduleResolution: classic` | Removed. | No. |
| `target: es5` | Lowest target is now `es2015`. | No (`es2018`). |
| `--downlevelIteration` | Only affected es5; setting it *at all* now errors. | No. |
| `module: amd \| umd \| systemjs \| none` | Unsupported. | No (`esnext`). |
| `esModuleInterop: false` / `allowSyntheticDefaultImports: false` | Can't be `false` anymore (safe interop always on). | No — `esModuleInterop: true`; `allowSyntheticDefaultImports` unset. |
| `outFile` | Removed (use a bundler). | No. |
| legacy `module Foo {}` namespace syntax | Hard error — use `namespace Foo {}`. | Repo-wide grep recommended (rare). |
| `asserts` on imports | `import x from "./y.json" asserts {…}` errors — use `with {…}`. | Grep `assert {` on imports (we use `with` already in modern code). |
| `/// <reference no-default-lib/>` directives | Unsupported — use `noLib`/`libReplacement`. | Unlikely. |
| `tsc file.ts` when a `tsconfig.json` exists | Now errors (`TS5112`) unless `--ignoreConfig`. | Check `scripts/` / CI invocations that pass files to `tsc`. |

### 2c. lib.d.ts changes

- **`dom` now includes `dom.iterable` + `dom.asynciterable`** (those two libs are now empty shims). Harmless for us (we list `["dom","dom.iterable","esnext"]`) — can simplify to `["dom","esnext"]` later. ([6.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html))
- New `es2025` lib + moved declarations (`Promise.try`, `Iterator`/`Set` methods, `RegExp.escape`); new **Temporal** types; `Map`/`WeakMap` **upsert** (`getOrInsert`). Additive — no break.

---

## 3. New features to ADOPT

| Feature | What it gives us | Recommendation for matrx-frontend |
|---|---|---|
| **Less context-sensitivity on `this`-less functions** ([notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)) | Method-syntax callbacks now infer param types like arrow fns do. | Free — fewer spurious `unknown` params in object-literal callback configs. No action. |
| **`types: []` default** | Massive build-time cut (MS reports 20–50%). | Already explicit — **audit the array**: drop `react`/`react-dom` if unused as *globals* (they're imported, not global), keep `node`/`jest`. |
| **`#/` subpath imports** (nodenext/bundler) | Native package-internal aliases without a leading segment. | Optional — our `@/*` paths already cover this; ignore. |
| **`bundler` + `module: commonjs` now legal** | Clean upgrade path off deprecated `node10` for CJS tooling. | Use for the `ts-node` block fix (§6). |
| **`es2025` target/lib** (`RegExp.escape`, `Promise.try`, `Iterator`/`Set` helpers) | Typed modern built-ins. | Consider bumping `target`/`lib` to `es2025` post-upgrade (Next 16 + evergreen only). |
| **Temporal types** (`esnext`/`esnext.temporal`) | First-class date/time types. | Adopt opportunistically where we touch dates. |
| **`Map.getOrInsert` / `getOrInsertComputed`** (`esnext`) | Cleaner memo/cache patterns. | Adopt in cache/memoization utils. |
| **`--stableTypeOrdering`** | Makes 6.0 ordering match 7.0 to flush out inference-order bugs early. | **Diagnostic only** — run once in CI before the 7.0 jump; do NOT keep on (up to ~25% slower). |

---

## 4. Migration steps (ordered)

1. **Co-bump tooling first** (see §6) so `pnpm install` doesn't `ERESOLVE`: `typescript@6.0.3`, `typescript-eslint@>=8.58.0`, `ts-jest@>=29.4.7`.
2. **Install:** `pnpm add -D typescript@6.0.3` (+ the co-bumps in the same install).
3. **Add the escape hatch** to `tsconfig.json` to get a green bump immediately:
   ```jsonc
   { "compilerOptions": { "ignoreDeprecations": "6.0" /* …existing… */ } }
   ```
4. **Run `pnpm tsc --noEmit`** (or the repo's typecheck script). Expect deprecation diagnostics for `baseUrl`, `alwaysStrict: false`, and the `ts-node` `moduleResolution: node` — all suppressed by step 3.
5. **Fix the deprecations properly** (then you can drop `ignoreDeprecations`):
   - **Remove `baseUrl`.** Our `paths` values are already `./`-prefixed (`"@/*": ["./*"]`, `"@components/*": ["./components/*"]`, `"/*": ["public/*"]`), so they resolve relative to the tsconfig dir without `baseUrl`. Verify resolution after removal; if `"/*": ["public/*"]` misbehaves, make it `["./public/*"]`.
   - **Remove `alwaysStrict: false`** (and let `strict`/`alwaysStrict` be governed normally — we keep `strict: false` explicitly).
   - **Fix the `ts-node` block:** change `"moduleResolution": "node"` → `"bundler"` (now legal with `module: commonjs` on TS 6) **or** `"nodenext"`. Confirm `ts-node`/`tsx` scripts still run.
6. **Grep for code-level breaks** (rare but hard-errors): `module Foo {` namespace syntax → `namespace`; `asserts {` on imports → `with {`.
7. **Check CI/scripts** for `tsc <file>.ts` invocations alongside a tsconfig → add `--ignoreConfig` or point at the project.
8. **Remove `ignoreDeprecations`** once §5–7 are clean. Regenerate types if applicable; re-run typecheck + `next build`.
9. **(Optional)** Simplify `lib` to `["dom","esnext"]`; consider `target/lib: es2025`.

**Net for this repo:** the bump itself is *low-risk* — no strict errors appear (we override the new `strict: true` default), and the only deprecations are 3 config lines. No `.ts` source changes expected beyond a possible stray namespace/`asserts`.

---

## 5. Strictness path (KEY DELIVERABLE)

Our config is fully loose. TS 6.0 does **not** force strict on us (explicit `strict: false` wins), so **decouple strictness from the 6.0 bump**: ship the bump green first, then enable flags **one at a time**, each as its own PR, measuring error counts between steps.

### Recommended standard "strict" target (end state)
```jsonc
{
  "compilerOptions": {
    "strict": true,                 // umbrella: turns on the 8 flags below
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,
    // recommended companions (not part of `strict`):
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true // stretch goal; high blast radius
  }
}
```

### How to measure error count for any flag
Flip the flag in a scratch tsconfig and count, e.g.:
```bash
pnpm tsc --noEmit --strictNullChecks 2>&1 | grep -c "error TS"
# group by file to find hotspots:
pnpm tsc --noEmit --strictNullChecks 2>&1 | grep "error TS" | sed 's/(.*//' | sort | uniq -c | sort -rn | head
```
Keep `skipLibCheck: true` on throughout (we already do) so counts reflect *our* code only.

### Safe staged order (lowest blast radius → highest)

| Order | Flag | Expected blast radius (loose codebase) | Why this position |
|---|---|---|---|
| 1 | `forceConsistentCasingInFileNames` | **Tiny** | Catches casing-only import bugs; near-zero refactor. Safest first win. |
| 2 | `alwaysStrict` | **Tiny** | Only flags reserved-word-as-identifier / sloppy-`this`. Mostly free. |
| 3 | `noImplicitThis` | **Small** | Few `this` typings in a React/Redux codebase. |
| 4 | `strictBindCallApply` | **Small** | Localized to `.bind/.call/.apply` sites. |
| 5 | `strictFunctionTypes` | **Small–Medium** | Contravariant param checks; some callback/event-handler churn. |
| 6 | `noImplicitAny` | **Medium–Large** | Forces annotations on untyped params/vars. Big but mechanical — do per-area. |
| 7 | `strictNullChecks` | **LARGE (the boss)** | The dominant source of errors in any loose codebase; unlocks real null-safety. Schedule its own multi-PR effort. |
| 8 | `strictPropertyInitialization` | **Small** *(requires #7)* | Only meaningful with `strictNullChecks`; class-field init — small in a hooks-heavy app. |
| 9 | `useUnknownInCatchVariables` | **Small** | `catch (e)` becomes `unknown`; add narrowing. |
| 10 | flip umbrella `strict: true` | — | Once 1–9 are individually green, replace them with `strict: true` and delete the explicit `false`s. |
| 11 *(stretch)* | `noUncheckedIndexedAccess` | **Large** | Not in `strict`; adopt only after the above land. |

**Process per step:** new branch → enable one flag → record `grep -c "error TS"` baseline → fix or `// @ts-expect-error`-quarantine hotspots → merge when zero → next flag. `noImplicitAny` and `strictNullChecks` will each likely need to be split across multiple PRs by directory (`features/*`, `components/*`, `app/*`). Never enable two strict flags in one PR — you lose the ability to attribute regressions.

---

## 6. Tooling co-bumps

| Tool | Min version for TS 6.0 | Notes / action |
|---|---|---|
| **typescript-eslint** | **`8.58.0`** (2026-03-30) | TS 6 support added in [#12124](https://github.com/typescript-eslint/typescript-eslint/pull/12124) / [v8.58.0 changelog](https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/typescript-eslint/CHANGELOG.md). **Must co-bump** — `≤8.57.x` pins peer `typescript >=4.8.4 <6.0.0` and will `ERESOLVE` on install. Prefer latest 8.60.x. |
| **ts-jest** | **`29.4.7`** (2026-04-01) | TS 6 support ([commit](https://github.com/kulshekhar/ts-jest/commit/eda517d226389317d99572887d3c1aa93c81be87)); peer widened to `>=4.3 <7`. On TS 6 it auto-substitutes `Bundler` for the CJS path ([PR #5273](https://github.com/kulshekhar/ts-jest/pull/5273)), avoiding the TS5107 `node10` deprecation per test file. **Co-bump.** |
| **tsx** | latest | Uses esbuild for transforms (not the TS type-checker), so TS-version-agnostic for execution — bump to latest for safety. Verify scripts run post-upgrade. |
| **ts-node** | latest | Our `ts-node` tsconfig block uses deprecated `moduleResolution: node` — fix to `bundler`/`nodenext` (§4.5). Consider migrating ts-node scripts to **tsx** to sidestep ts-node's slower TS-6 support cadence. |
| **@types/node** | match runtime Node major (latest in-range) | Keep in the explicit `types` array. Bump to the major matching CI/prod Node. |
| **Next.js 16 type plugin** (`{ "name": "next" }`) | shipped with installed Next 16 | No separate version; provided by the `next` package. Re-run `next build` after the bump to regenerate `.next/types`. Next 16 supports TS 6 (TS 6 is API-compatible with 5.9). Watch for plugin warnings; bump Next patch if any. |
| **react-compiler** (`babel-plugin-react-compiler` / `eslint-plugin-react-hooks` compiler rules) | latest stable | Compiler runs in Babel, independent of the TS compiler version — no hard TS-6 dependency. Keep on latest stable; no co-bump *required*, but align with React 19.2. |
| **eslint** | 9.x+ (current) | typescript-eslint 8.58+ supports ESLint 9; if also moving to ESLint 10, do it in a separate PR. |

**Install order (single transaction to avoid peer errors):**
```bash
pnpm add -D typescript@6.0.3 typescript-eslint@latest ts-jest@latest tsx@latest @types/node@latest
```

---

### References
- Announcing TypeScript 6.0 — https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- TypeScript 6.0 RC — https://devblogs.microsoft.com/typescript/announcing-typescript-6-0-rc/
- TypeScript 7.0 RC — https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/
- 6.0 Release Notes (handbook) — https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- VS Magazine (GA date + defaults) — https://visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx
- typescript-eslint TS6 PR/changelog — https://github.com/typescript-eslint/typescript-eslint/pull/12124
- ts-jest TS6 support — https://github.com/kulshekhar/ts-jest/commit/eda517d226389317d99572887d3c1aa93c81be87 · https://github.com/kulshekhar/ts-jest/pull/5273
