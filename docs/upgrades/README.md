# Dependency Upgrade Initiative — Master Tracker

> **Single source of truth** for the 2026 dependency modernization of `matrx-frontend`.
> Every bump, every decision, every rule Arman set, and every research handoff lives here.
> Update this file in the **same change** as any dependency work. Stale rows here = mixed-up pushes.

**Owner:** Arman (he pushes to `main`; the agent prepares each step and hands it back ready).
**Started:** 2026-06-29
**Status:** Phase A in progress.

---

## 0. The Rules (Arman's directives — non-negotiable)

These govern *every* step of this initiative. Read before touching anything.

| # | Rule |
|---|------|
| R1 | **One step at a time, done correctly.** Get a step fully ready, hand it to Arman, he pushes. Never bundle unrelated upgrades into one commit. |
| R2 | **Targeted commits only.** Each phase/major is its own isolated, reviewable commit so nothing gets mixed with other agents' work. Coordinate timing of the push so we don't collide with parallel agents. |
| R3 | **Bleeding edge, but only what's actually shippable.** Always go to the latest *stable* version available on our platform (Vercel build images cap Node at 24.x — see Node row). |
| R4 | **Update ≠ done. Maximize.** For anything we bump, we must discover *what new capabilities the new version unlocks* and put them to use. Updating without adopting new features is a waste. |
| R5 | **Research-agent-driven.** Every non-trivial update must be backed by a research agent's findings of the **exact** new features/changes in the target version. We adopt their latest-and-greatest patterns, not guesses. Findings live in `docs/upgrades/research/<package>.md`. |
| R6 | **Core upgrades, we do ourselves.** Research agents produce the discovery/adoption docs; Arman + the lead agent perform the actual core upgrades (TS, Supabase, Groq, lucide, etc.). Routine devs execute the long-tail later from those docs. |
| R7 | **TypeScript is priority #1.** Bump TS, confirm 100% green, *then* tighten types to a standard strict setup. Strictness changes happen ONLY after the bump is proven clean. |
| R8 | **"Separate breaking surfaces" gate.** For any breaking major in the long-tail list, before touching it: (a) confirm Arman actually cares about it, (b) identify the concrete route/feature that uses it, (c) Arman reviews that route **before and after** the update. No blind bumps. |
| R9 | **We only care about the AI SDKs we use.** Groq is the only LLM SDK actually used → upgrade with care. `ai` / `@ai-sdk/*` / `@anthropic-ai/sdk` / `openai` are not in our hot path → do not prioritize. |
| R10 | **Verify before handoff.** Every prepared step must pass `pnpm install --frozen-lockfile`, `pnpm type-check`, and a build (or targeted build) before it's declared ready. Capture and triage all warnings. |

---

## 1. Goals

1. Get off deprecated runtimes/tooling (Node 20 → 24, pnpm lockfile sync). ✅ shipped.
2. Bring the **core framework** (Next, React, TS, Tailwind) to latest stable and *adopt* the new features each unlocks.
3. Tighten TypeScript to a clean, standard strict config (after the TS bump is proven green).
4. Upgrade the dependencies **we actually use** (Supabase, Groq, lucide) deliberately, with feature adoption.
5. Leave a paper trail (this dir) so the long-tail majors can be executed safely later by any dev.

---

## 2. Phase plan

| Phase | Scope | Risk | Status |
|-------|-------|------|--------|
| **0** | Lockfile sync + Node 24 (`engines.node`) | low | ✅ Shipped (Arman pushed) |
| **A** | Safe patch/minor sweep — everything within its current major | low | ✅ Ready for Arman to push (0 type errors) |
| **B1** | TypeScript 6 bump — **version only, no strictness** (apples-to-apples) | low | ✅ Shipped (commit `7faeafff8`) |
| **B2** | TypeScript strictness pass (staged, one flag at a time, fewest-errors-first) | high | 🟡 **In progress** — measured all flags (`pnpm measure:strict`); **Waves 0–2 landed** (`strictBindCallApply`/`alwaysStrict`/`noFallthroughCasesInSwitch`/`noImplicitThis` + `useUnknownInCatchVariables` + `noImplicitOverride`, type-check 0). **Track A shipped. Wave 3 (`noImplicitReturns`) shipped** via the new `wave:split` fan-out tooling. Waves 4→6 (`strictFunctionTypes`→`strictNullChecks`→`noImplicitAny`) queued — see §5 staged plan |
| **C** | Supabase (`@supabase/supabase-js` 2.108.2, `@supabase/ssr` 0.12.0) | med-high | ✅ Shipped (commit `736ee6962`) — runtime auth QA pending |
| **D** | Groq SDK 0.37 → 1.x | med | ⬜ Not started |
| **E** | lucide-react 0.577 → 1.22.0 (+ document advantages) | med | 🟡 **Phase E** — bumped `^1.22.0`; 37 type errors (all removed brand icons) fixed via shim; type-check 0, build verifying → push |
| **F** | Long-tail majors — only the ones Arman flags, gated by R8 | varies | ⬜ Backlog |

**Agreed execution order (2026-06-29, Arman):** TS in **two waves**. Wave 1 = TS 6 *version only* (no strictness) first — it's the foundational compiler, so every later bump validates against the final compiler (apples-to-apples). Then Supabase → Groq → lucide → other flagged majors. **Strictness is the very last wave**, on a fully-stable dependency base. This dissolves the "Supabase makes things stricter, do it before TS" concern: since strictness is deferred, the TS *version* bump and Supabase's stricter types don't conflict. Arman authorized the agent to commit + push each phase when verified green.

---

## 3. Phase 0 — Runtime & lockfile (DONE)

| Item | Before | After | Notes |
|------|--------|-------|-------|
| `pnpm-lock.yaml` sync | drifted (stale `simple-git-hooks`) | in sync | Fixed `ERR_PNPM_OUTDATED_LOCKFILE`; frozen install passes. |
| Node version | 20.x (deprecated by Vercel 2026-10-01) | `engines.node: "24.x"` | 24.x is the max LTS on Vercel build images. Node 25 (local) not offered by Vercel. |
| Vercel dashboard Node | 20.x | **TODO: confirm set to 24.x** | `engines.node` overrides, but align the dashboard too. |

**Build status:** ✅ Vercel build succeeded after Phase 0. Warnings/minor errors observed — see §6.

---

## 4. Phase A — Safe sweep (patch/minor within current major)

**Mechanism:** explicit allowlist via `pnpm update --latest <pkg>…`. We do NOT run a blanket `pnpm update --latest` because dozens of deps are specced `"latest"` and a blanket run would drag in every breaking major (TS 6, AI SDK 7, ESLint 10, lucide 1.0…). Targeted list only.

> Status legend: ⬜ pending · 🟡 in progress · ✅ done · ⛔ excluded (handled in a later phase)

### Core framework (safe — these are the "latest Next/React" the constitution asks for)
| Package | From | To | Notes |
|---|---|---|---|
| `next` | 16.2.0 | 16.2.9 | patch |
| `eslint-config-next` | 16.2.0 | 16.2.9 | patch |
| `react` / `react-dom` | 19.2.4 | 19.2.7 | patch |
| `@types/react` / `@types/react-dom` | 19.2.14 | 19.2.17 | patch |
| `react-konva` | 19.2.3 | 19.2.5 | patch |
| `tailwindcss` | 4.2.1 | 4.3.2 | minor — pinned exact, edited in package.json |
| `@tailwindcss/postcss` | 4.2.2 | 4.3.2 | minor |
| `@tailwindcss/typography` | 0.5.19 | 0.5.20 | patch |

### State / data / query
`@reduxjs/toolkit` 2.11→2.12 · `react-redux` 9.2→9.3 · `@tanstack/react-query` 5.91→5.101 · `@tanstack/react-query-devtools` · `@tanstack/react-virtual` 3.13→3.14 · `@xyflow/react` 12.10→12.11 · `zustand` 5.0.12→5.0.14 · `zod` 4.3→4.4

> ⚠️ **`@supabase/supabase-js` was PULLED OUT of Phase A.** Bumping 2.99.2 → 2.108.2 introduced **34 `RejectExcessProperties` TS errors** on `.insert()`/`.update()` call sites (new stricter insert/update typing). It is now **pinned exact at `2.99.2`** to hold it down (caret would float it back up) and moved to **Phase C** for deliberate handling. The `supabase` CLI dev-tool floated to 2.108.0 (harmless — not in the bundle, doesn't affect types).

### Radix UI (all minor/patch, safe)
all `@radix-ui/react-*` to latest 1.x/2.x within current major.

### UI / util / misc (minor/patch)
`motion` · `recharts` 3.8→3.9 · `mermaid` 11.15→11.16 · `@mermaid-js/layout-elk` · `date-fns` 4.1→4.4 · `react-hook-form` 7.71→7.80 · `@hookform/resolvers` 5.2→5.4 · `react-resizable-panels` 4.7→4.12 (within v4; see skill `react-resizable-panels-v4`) · `react-colorful` · `styled-components` 6.4.1→6.4.3 · `tailwind-merge` 3.5→3.6 · `@tabler/icons-react` · `@slack/web-api` · `@upstash/redis` · `libphonenumber-js` · `lodash` · `papaparse` · `dexie` · `canvas` · `web-vitals` · `ajv` · `cron-parser` · `@react-three/fiber` 9.5→9.6 · `three`/`@types/three` 0.183→0.185 (0.x — flagged) · `@fingerprintjs/fingerprintjs` · `@deepgram/sdk` 5.0→5.5 · `@codemirror/{lint,state,view}` · `@uiw/react-codemirror` · `@univerjs/*` 0.25.0→0.25.1 · `@react-email/render` · `@react-oauth/google` · `@mynaui/icons-react` · `openai` 6.32→6.45 (within v6) · `redux-saga` 1.4→1.5 · `resend` 6.9→6.16

### Dev tooling (minor/patch)
`jest` 30.2→30.4 · `jest-environment-jsdom` · `ts-jest` 29.4.6→29.4.11 · `tsx` 4.21→4.22 · `dotenv` · `postcss` · `autoprefixer` · `esbuild` 0.28.0→0.28.1

### ⛔ Explicitly EXCLUDED from Phase A (handled later / breaking majors)
| Package | From | To | Why excluded | Phase |
|---|---|---|---|---|
| `typescript` | 5.9.3 | 6.0.3 | major; priority + strictness work | B |
| `@supabase/supabase-js` | 2.99.2 (pinned exact) | 2.108.2 | 34 `RejectExcessProperties` type errors; pinned to hold | C |
| `@supabase/ssr` | 0.9.0 | 0.12.0 | auth/cookie surface, sensitive | C |
| `groq-sdk` | 0.37.0 | 1.3.0 | major; the SDK we actually use | D |
| `lucide-react` | 0.577 | 1.22.0 | 1.0 major; document advantages | E |
| `eslint` | 9.39.4 | 10.6.0 | major; flat-config/rule churn | F |
| `ai` | 6.0.116 | 7.0.4 | unused hot path (R9) | skip |
| `@ai-sdk/google` | 3.0.43 | 4.0.2 | unused (R9) | skip |
| `@anthropic-ai/sdk` | 0.78 | 0.107 | unused (R9) | skip |
| `@babel/standalone` | 7 | 8 | major | F |
| `@cartesia/cartesia-js` | 2 | 3 | major | F |
| `@tsparticles/*` | 3 | 4 | major | F |
| `jspdf` | 3 | 4 | major | F |
| `react-day-picker` | 9 | 10 | major | F |
| `react-easy-crop` | 5 | 6 | major | F |
| `redis` | 5 | 6 | major | F |
| `twilio` | 5 | 6 | major | F |
| `unsplash-js` | 7 | 8 | major | F |
| `uuid` | 13 | 14 | major | F |
| `format-duration` | 3 | 4 | major | F |
| `jsdom` | 28 | 29 | major (dev) | F |
| `lint-staged` | 15 | 17 | major (dev) | F |
| `react-email` | 5 | 6 | major (dev) | F |
| `@types/node` | 25 | 26 | major; tie to Node work | F |
| `katex` | 0.16.38 | 0.17.0 | 0.x minor can break | F |
| `@types/uuid` | 11 | deprecated | remove (uuid ships own types) | F-cleanup |
| `@react-email/components` | 1.0.8 | 1.0.12 (deprecated) | deprecated upstream | F-cleanup |

---

## 5. Major-version queue (priority order, per Arman)

| Pri | Package | Cares? | Research doc | Route(s) to review (R8) | Status |
|----|---------|--------|--------------|--------------------------|--------|
| 1 | **TypeScript 6** | ✅ yes | `research/typescript-6.md` ✅ | whole repo `pnpm type-check` | ✅ **B1 shipped** (`7faeafff8`) — version-only; strictness deferred to B2 |
| 2 | **Supabase** (`supabase-js`, `ssr`) | ✅ yes | `research/supabase.md` ✅ | login/logout, multi-tab refresh, RLS reads/writes | ✅ **Phase C done** — 34 errors fixed via generated `TablesInsert`/`TablesUpdate`; ssr co-bumped. Manual auth QA pending (matrix below) |
| 3 | **Groq SDK** | ✅ yes (only LLM SDK we use) | `research/groq.md` ✅ | `/transcripts/new` + studio audio import, `/transcripts/admin` (transcribe), TTS read-aloud (`/api/audio/text-to-speech`), `/demos/general/voice/voice-assistant*`, `/demos/general/voice/debate-assistant` | 🟡 **Phase D** — 0.37→1.3.0 pure bump, type-check 0, build verifying → push |
| 4 | **lucide-react 1.0** | ✅ wants the advantages | `research/lucide-react.md` ✅ | app-wide icons; ~25 brand-icon files | 🟡 **Phase E shipped-ready** — see change log; brand icons re-homed in a shim |
| — | `ai`, `@ai-sdk/*`, `@anthropic-ai/sdk`, `openai` | ❌ unused | — | — | skip |
| — | other long-tail majors | ❓ TBD per R8 | on request | TBD | backlog |

**TypeScript special handling (R7) — informed by `research/typescript-6.md`:**

TS 6.0 (GA 2026-03-23) is the final JS-based release / bridge to the Go-native 7.0. Good news: because we set `strict:false` **explicitly**, 6.0's new `strict:true` default does NOT silently switch on. The bump itself only trips **3 config lines**:
- `baseUrl` — deprecated outright
- `alwaysStrict: false` — no longer allowed to be false
- the `ts-node` block's `moduleResolution: node`

`"ignoreDeprecations": "6.0"` makes it green immediately; fixing those three lets us drop that escape hatch.

**Mandatory co-bumps (one install, avoids ERESOLVE):** `typescript@6.0.3`, `typescript-eslint@>=8.58.0` (≤8.57 pins `typescript <6.0.0`), `ts-jest@>=29.4.7`. `tsx`/`ts-node`/`@types/node`/Next 16 plugin/react-compiler are version-tolerant.

**Steps:**
1. Co-bump TS + the three tools above; fix the 3 config lines; `pnpm type-check` + build → 100% green.
2. **Only then**, tighten toward standard strict, **one flag at a time, fewest-errors-first** (Arman's directive 2026-06-29). Don't guess the order — **measure it**: `pnpm measure:strict` flips each candidate flag in isolation, counts the errors it surfaces, tallies by error code, and writes the full per-flag list to `type-errors/<flag>.txt`.

   **Measured baseline (2026-06-29, on `tsconfig.typecheck.json` include set — excludes `(transitional)`/`(dev)`/`applet` per Arman):**

   | Wave | Errors | Files | Flag | Dominant codes |
   |---|---|---|---|---|
   | **0** | 0 | 0 | `strictBindCallApply` | — |
   | **0** | 0 | 0 | `alwaysStrict` | — |
   | **0** | 0 | 0 | `noFallthroughCasesInSwitch` | — |
   | **0** | 1 | 1 | `noImplicitThis` | TS2345 (was a phantom-column Supabase bug in `contextService.duplicateItem` — fixed) |
   | 1 | 28 | 18 | `useUnknownInCatchVariables` | TS2339 (`catch (e)` → `e.message`) |
   | 2 | 54 | 26 | `noImplicitOverride` | TS4114 (add `override`) |
   | 3 | 579 | 404 | `noImplicitReturns` | TS7030 |
   | 4 | 822 | 314 | `strictFunctionTypes` | TS2769 (overloads) |
   | 5 | 1346 | 388 | **`strictNullChecks`** | TS2322/2339/2345/18047 |
   | 6 | 1420 | 363 | `noImplicitAny` | TS7006/7031/7053 |
   | — | — | — | `strictPropertyInitialization` | rides with `strictNullChecks` (config-dependent) |

   **Deliberately NOT used as tsc flags** (Arman: not adding these; soon out of the build): `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`. The two unused-symbol flags (`noUnusedLocals` 2298, `noUnusedParameters` 483) are **TS6133 noise** with no bug value and no `_`-ignore convention support — enforce via ESLint `@typescript-eslint/no-unused-vars` (`argsIgnorePattern: '^_'`), NOT the tsc flags.

3. **Anti-cheating + anti-laziness system (Track A — runs alongside the waves). ✅ SHIPPED.** The escape hatches agents use to dodge the type system are the real target. Frozen baseline (`scripts/type-escape-baseline.json`, tracked .ts/.tsx, generated/`.d.ts`/scripts/tests excluded): `: any` 1484 / `as unknown as` 686 (many legit, DB-guarded) / `as any` 315 / `<any>` 176 / `Record<string,any>` 238 / `@ts-ignore` 53 / `@ts-nocheck` 21 / `@ts-expect-error` 6 — total **2979**.
   - **Inline signal (`eslint.config.mjs`):** `@typescript-eslint/no-explicit-any`, `no-non-null-assertion`, and `ban-ts-comment` (allow `@ts-expect-error` *with description*, ban `@ts-ignore`/`@ts-nocheck`) wired at `warn`, scoped to TS files. (The `@typescript-eslint` plugin/parser is already provided by eslint-config-next, so we add rules only.) They surface inline in-editor where agents fix them in the moment; they do NOT fail builds (large legacy tail). **Note:** there is currently NO active git pre-commit hook (no husky / `hooksPath` / `lint-staged` config — `lint-staged` is a dormant devDep), so nothing blocks commits today; CI / `pnpm lint` / the editor are the surfaces. Wiring a hook is a separate, opt-in step.
   - **Ratchet (`scripts/check-type-hatches.ts` → `pnpm check:hatches[:strict|:update]`):** whole-repo count vs the frozen baseline; `:strict` exits 1 on any *growth*. `pnpm fix:hatches <path>` lists every occurrence under a path (grouped by category, `file:line` + snippet) to dispatch a fix agent per feature. `--update` re-freezes after a wave reduces a count — the baseline only ratchets down. When a category hits 0 it graduates to a hard ESLint `error` and leaves the ratchet. (`as any`/`as unknown as` live here, NOT as a lint rule: legitimacy is contextual — the DB-guard pattern — and the guard is a separate `_Check extends DbRpcRow` block, so no AST rule can tell guarded from un-guarded.)
   - **Unified JSON system (`types/json.ts`) — kills the #1 `as unknown as` cause:** this repo patches `Json` → `unknown` (write-side ergonomics), so a JSONB column reads back as bare `unknown` and agents lazily re-cast the *whole row* (`row as unknown as TypedRow`) to reach one field. Fix: canonical `JsonValue`/`JsonObject`/`JsonArray` types + `isJsonObject`/`isJsonArray`/`isJsonPrimitive` guards — an honest name for "it's just an object" (not `any`, not a bare `unknown`) so you narrow *one field*, never the row. Documented as Pattern 4 in the `type-safety` skill's `supabase-patterns.md` (`.claude/skills/type-safety/`). (This also resolves the `TYPESCRIPT_STANDARDS.md` "`as unknown as` banned" vs supabase-skill "use `as unknown as T`" tension: prefer field-narrowing/guards; the guarded double-cast remains the DB-row fallback.)

**Supabase special handling (Phase C) — informed by `research/supabase.md`:**

`supabase-js` 2.102+ added `RejectExcessProperties` on `.insert()/.update()/.upsert()` — a deliberate, correct tightening that catches non-existent columns at compile time. We **adopted it properly** (no shortcuts):
- All 34 sites: typed each mutation accumulator to the generated, schema-qualified `TablesInsert<{schema},"t">` / `TablesUpdate<{schema},"t">` (Pattern 1). Column names are now compile-validated.
- Loop builders with `allowed`-key arrays got `as const satisfies readonly (keyof TablesUpdate<…>)[]` (validates the allow-list) + a localized `(acc as Record<string,unknown>)[key]=…` write (union-key indexed writes otherwise resolve to `never`).
- Truly-dynamic `_dirtyFields` builders (notes thunks/middleware) assert the payload to the generated type at the `.update()` call (honest boundary cast — NOT `as never`).
- **Latent bug caught & fixed:** `customAppService.customAppConfigToDBFormat` wrote `authenticated_read: true`, but `custom_app_configs` has no such column (it has `is_public`/`public_read`/`visibility`). Removed from the write payload + return type; the read-side type field is harmless.

**Behavioral changes to QA (runtime, can't be type-checked) — `supabase-js` 2.107 removed the `navigator.locks` auth mutex; 2.108.2 changed refresh-failure handling; `ssr` 0.12 adds cache headers to `setAll`:**

| Area | Test |
|---|---|
| Login / logout | Form login `admin@admin.com`; sign out clears cookies |
| Multi-tab refresh | 2 tabs, let token near-expire → seamless refresh, no deadlock |
| Session on refresh failure | Offline blip → valid session preserved, not nuked |
| RLS reads/writes | Owner can read/write RLS tables; non-owner blocked |
| Custom-schema mutations | A `.schema("agent"/"chat"/…).insert/update` round-trip |

**Optional follow-ups (not blockers, no behavior change in this phase):**
- ssr 0.12 `setAll` cache-headers ([#176]) — our `utils/supabase/middleware.ts` matches the canonical Supabase pattern; applying the new cache headers to the proxy response is an optional hardening, deferred.
- Pre-existing `getSession()` callsites are token-forwarding/hydration, not authorization gates (the proxy gates on `getUser()`); the bump doesn't change `getSession()` semantics, so no regression.

---

## 6. Build warnings / minor errors (post-Phase-0 successful build)

> Captured during local verification builds. Each gets a row; resolve or consciously accept.

Captured from a local `pnpm build` (Next 16.2.9, Turbopack, `MATRX_PROFILE=core`) after Phase A. Build **succeeded**. None of these were introduced by Phase A — all pre-existing.

| # | Warning | Source | Severity | Action | Status |
|---|---------|--------|----------|--------|--------|
| W1 | **Turbopack: "file pattern matches 19810 files… overly broad patterns can lead to build performance issues and over-bundling"** (3 warnings) | `app/(admin)/admin/docs/[[...path]]/page.tsx:53-55` (`path.resolve(process.env.MATRX_DOCS_ROOT ?? process.cwd(), …)`) and `:63` (`readFile(fullPath)`) — the dynamic `cwd()` path makes Turbopack trace the whole project tree. | low (admin-only route; build-perf, not correctness) | Make the docs root a literal/statically-known base or guard the dynamic read so Turbopack doesn't trace the project root. Admin-only, so low priority. | ⬜ |
| W2 | **"Using edge runtime on a page currently disables static generation for that page"** | a page exporting `runtime = 'edge'` | info | Per Vercel 2026 guidance, edge runtime is no longer recommended — prefer Fluid Compute (Node). Audit which page sets edge runtime and consider removing it. | ⬜ |
| W3 | **"Please use the `legacy` build in Node.js environments."** | a 3rd-party lib emitting during static generation (likely a PDF/canvas/katex-style package picking the browser build under Node) | low | Identify the emitting package and import its `legacy`/node entry where used server-side. Cosmetic. | ⬜ |

---

## 7. Research handoffs (R5)

Per-package deep-dives produced by research agents. Each doc must contain: exact version delta, breaking changes, **new features we should adopt**, concrete migration steps, and code-level adoption notes for this repo.

| Doc | Package | Produced by | Status |
|-----|---------|-------------|--------|
| `research/typescript-6.md` | TypeScript 6.0 | research agent | ✅ done — bump is tiny on strict:false (3 config lines); staged strict-flag plan delivered |
| `research/supabase.md` | supabase-js 2.108 + ssr 0.12 (incl. RejectExcessProperties fix) | research agent | ✅ done — fix: type payloads to `TablesInsert`/`TablesUpdate` (introduced 2.102.0) |
| `research/groq.md` | groq-sdk 1.x | research agent | ✅ 2026-06-29 |
| `research/lucide-react.md` | lucide-react 1.x | research agent | ✅ done — low risk; only breakage = removed brand icons (~25 files); adopt `<DynamicIcon>` |
| `research/next-react-tailwind.md` | Next 16.2 / React 19.2 / Tailwind 4.3 new features | research agent | ✅ done — re-enable React Compiler, pilot Cache Components/PPR, `<Activity>`, `<ViewTransition>`, container queries |

---

## 8. Change log

| Date | Change | By |
|------|--------|-----|
| 2026-07-01 | **Type doctrine consolidated → `type-safety` Claude skill** (`.claude/skills/type-safety/` = SKILL.md doctrine + supabase-patterns.md); cursor skills `type-fixing-agent`/`supabase-type-safety` deleted; all pointers repointed. Doctrine core: real fixes change code + data, escalation-with-decision-brief over silencing, trace to the terminal consumer. | agent + Arman |
| 2026-07-01 | **Wave 5 status:** 1347 → 7 errors; all 7 = CustomTool/`JsonSchemaProperty` drift in `AgentToolsManager.tsx` (deep fix, queued). **Ratchet extended to 14 categories** (adds `value!` 641, `?? {}` 619, `\|\| {}` 101, `\|\| []` 460, `?? ""` 2071, `\|\| ""` 896 — total visible debt 7,753); baseline re-frozen (down-only; `Record<string, any>` kept red at 238 vs 240). **New track:** `TYPE-DEBT-TRIAGE.md` — human-in-the-loop pipeline (inventory → decision briefs → Arman decides → fix waves). | agent |
| 2026-06-29 | Phase 0 shipped: lockfile resync + `engines.node: 24.x`. | agent + Arman |
| 2026-06-29 | Created this tracker; began Phase A safe sweep. | agent |
| 2026-06-29 | Phase D research delivered (`research/groq.md`): groq-sdk IS used in 8 server-side TS files; 1.0 is a plumbing major, low risk for us. | Groq research agent |
| 2026-06-29 | Phase A swept (Next 16.2.9, React 19.2.7, Tailwind 4.3.2, Radix, RTK, TanStack, etc.); `pnpm type-check` = 0 errors, frozen install passes. | agent |
| 2026-06-29 | `@supabase/supabase-js` pulled from A → C (34 RejectExcessProperties type errors); pinned exact 2.99.2. | agent |
| 2026-06-29 | Launched 5 research agents (TS6, Supabase, Groq, lucide, Next/React/Tailwind). | agent |
| 2026-06-29 | All 5 research docs delivered under `research/`. | agent |
| 2026-06-29 | **Phase B2 kickoff (strictness)**: built `pnpm measure:strict` (`scripts/measure-strict-flags.ts`) — flips each candidate flag in isolation, counts/tallies errors, writes `type-errors/<flag>.txt`. Measured ranked baseline (see §5). Arman's directive: flip one-by-one, **fewest-errors-first**; build the anti-cheat ratchet + unified JSON system alongside; do NOT add `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`/`noPropertyAccessFromIndexSignature`; unused-symbol flags via ESLint not tsc. | Arman + agent |
| 2026-06-29 | **Phase B2 Wave 0**: flipped `strictBindCallApply`, `alwaysStrict`, `noFallthroughCasesInSwitch`, `noImplicitThis` in `tsconfig.json` (three zero-error, one one-error). The lone `noImplicitThis` error was a real phantom-column Supabase bug — `contextService.duplicateItem` spread 4 computed/read-only columns (`char_count`/`data_point_count`/`has_nested_objects`/`json_keys`) into `.insert()`; fixed by destructuring them out (same class as the Phase C `authenticated_read` fix). `pnpm type-check` = 0. | agent |
| 2026-06-29 | **Phase B2 Wave 3**: enabled `noImplicitReturns` (579 errors / 404 files, all TS7030). Fanned out via new `scripts/wave-split.ts` (`pnpm wave:split <flag>` — segregates a flag's tsc errors into one agent-assignable task file per source file + manifest) to 16 parallel composer-2.5-fast agents (~25 files each), then a 5-file thunk cleanup (bare `return;` → `return undefined;` alongside `return rejectWithValue(...)`). Latent fixes: missing `delete` case in storage.handler.ts, missing `default` in tooltip.tsx. type-check = 0. Committed 6008d4a25. | agent |
| 2026-06-29 | **Phase B2 Track A (anti-cheat) shipped**: (1) `types/json.ts` — canonical `JsonValue`/`JsonObject`/`JsonArray` + `isJsonObject`/`isJsonArray`/`isJsonPrimitive` guards (narrow the field, not the row; documented as Pattern 4 in supabase-type-safety skill). (2) ESLint trio at `warn`, TS-scoped: `no-explicit-any` + `no-non-null-assertion` + `ban-ts-comment` (plugin already from eslint-config-next, rules only). (3) Ratchet `scripts/check-type-hatches.ts` + frozen `type-escape-baseline.json` (total 2979) → `pnpm check:hatches[:strict|:update]` + `fix:hatches <path>` scoped lister. Discovered: no active git pre-commit hook exists (lint-staged dormant) — gate is CI/editor for now. type-check = 0. | agent |
| 2026-06-29 | **Phase B2 Waves 1+2**: flipped `useUnknownInCatchVariables` (28 errors) + `noImplicitOverride` (54 errors). Overrides: added the `override` modifier to 54 members across 26 files (React `ErrorBoundary` lifecycles + `Error`/logger/store subclasses), purely mechanical. Catch vars: replaced 28 `caught.message`/`setError(caught)` sites with the canonical `extractErrorMessage(err: unknown)` helper (`utils/errors.ts`) — no inline `instanceof` duplication, no `as` casts (the "good system" answer to the catch-`unknown` problem); `useClipboard` coerces to `Error` via `instanceof`-or-wrap. `pnpm type-check` = 0. | agent |
| 2026-06-29 | **Phase B1**: TypeScript 5.9.3 → 6.0.3 (pinned exact). Removed `baseUrl` (paths now tsconfig-relative; `/*`→`./public/*`) + `alwaysStrict:false`; scoped `ignoreDeprecations:"6.0"` + `rootDir:"."` to the `ts-node` block (CJS runtime needs `baseUrl`/`node` resolution). `type-check` = 0 errors; `ts-node` generate-manifest OK. No strictness change. | agent |
| 2026-06-29 | **Phase E**: `lucide-react` 0.577.0→^1.22.0 (first stable major; ~32% smaller, stable SemVer, `aria-hidden` default). Only breakage = removed brand icons: 37 type errors across 30 files for `Youtube`/`Github`/`Twitter`/`Facebook`/`Linkedin`/`Instagram`/`Chrome`. Re-homed them in a new drop-in shim `components/icons/brand-icons.tsx` (react-icons FA6 brands wrapped as `LucideIcon`-compatible components) — consumers only swapped import source, so `LucideIcon`-typed registries kept compiling. type-check 0, build green. Deferred (separate, optional): official `<DynamicIcon>` adoption in `IconResolver`, `<LucideProvider>` defaults, alias cleanup (`CheckCircle`→`CircleCheck` — still valid aliases in 1.x). **Watch-item:** DB-stored brand icon-name strings (e.g. `"Youtube"`) resolved at runtime via namespace lookup will fall back to a default — audit if any exist. | agent |
| 2026-06-29 | Auth QA passed (login/logout/refresh) post-Phase-C — Arman confirmed. | Arman |
| 2026-06-29 | **Phase D**: `groq-sdk` 0.37.0→1.3.0 (pinned exact). 1.0 is a plumbing modernization (zero-dep, native Web fetch) — our 8 server files use only `new Groq`/`chat.completions.create`/`audio.{transcriptions,speech}.create`, all runtime-compatible. type-check = 0 (B12 `message.content` nullable doesn't trip non-strict config; will be revisited in B2 strict wave). No code changes. | agent |
| 2026-06-29 | **Phase C**: `@supabase/supabase-js` 2.99.2→^2.108.2, `@supabase/ssr` 0.9.0→^0.12.0. Fixed all 34 `RejectExcessProperties` errors **properly** — typed each accumulator to the generated `TablesInsert/Update` (schema-qualified) per research Pattern 1; no `as never`/`as any`. Caught a real latent bug: `customAppService` wrote a phantom `authenticated_read` column (not on `custom_app_configs`) — removed from the write payload. `type-check` = 0. See QA matrix below. | agent |
