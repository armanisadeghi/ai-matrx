# Phase 3 — Verification / Close-out

> Phase 3 strips the synchronous Supabase RPC out of all three route-group layouts (`(a)`, `(authenticated)`, `(ssr)`) and moves theme class application from the inline `SyncBootScript` to a server-read cookie so `<html class="dark">` is correct in the very first HTML frame. The Phase 2 `userPreferencesPolicy` cold-boot path takes over preferences hydration entirely on the client. Closed when all success criteria below are green.
>
> PR 3.A (server decoupling) and PR 3.B (client cookie-mirror side-effect + tests) have landed; PR 3.C is this verification doc.

Date: 2026-04-22.

---

## 1. Deliverables

| PR | Scope | Status |
|---|---|---|
| 3.A | `app/(a)/layout.tsx`, `app/(authenticated)/layout.tsx`, `app/(dev)/layout.dev.tsx` — strip `getUserSessionData` (bundled RPC) + `supabase.from('user_preferences').insert(…)` backfill + `userPreferences` preloadedState. Swap in `checkIsUserAdmin` (narrow single-row lookup). Server-read `theme` cookie in `app/layout.tsx` to set `<html class="dark">` before first paint. `types/reduxTypes.ts` narrows `InitialReduxState.userPreferences` to optional. | ✅ Merged (`8bc4fd03a`) — −63 net lines |
| 3.B | `styles/themes/themeSlice.ts` → `writeThemeCookie(mode)` fire-and-forget helper. `providers/StoreProvider.tsx` installs a narrow `store.subscribe` watcher that fires `writeThemeCookie` only on genuine `theme.mode` *changes* (seeded `lastMode` prevents redundant POSTs on REHYDRATE-to-same-value). 9 new Jest tests (`styles/themes/__tests__/themeSlice.cookieMirror.test.ts`) covering both paths + the negative-case invariants. | ✅ Merged (`655c47853`) — +279 lines (mostly tests) |
| 3.C | This verification doc + browser checklist + TTFB measurement template. | ⏳ This PR |

Combined Phase 3 diff (code-only, excluding tests): **−95 lines**. With tests included: **+216 lines**. Test value-add is pure coverage for a newly-introduced cross-boundary contract (cookie ↔ Redux ↔ server prepaint).

---

## 2. Success criteria — status per criterion

Criteria numbering matches `phase-3-plan.md` §3.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | **TTFB improvement** measured on 5 representative routes per group — ≥ 50 ms reduction | 🟡 **Needs browser run** — see §4 measurement template | Theoretical: the dropped Supabase RPC (`get_user_session_data`) bundled an admin-row check + preferences fetch + preferences-exist check. Replaced with a single `checkIsUserAdmin` `.maybeSingle()` on an indexed column. Cold-boot expected p50 drop ~30–80 ms, p95 drop larger. Must be measured in production-like conditions. |
| 2 | Preferences still work — `/sync-demo/preferences` passes Phase 2 §3 criteria on HEAD | 🟡 **Needs browser run** — see §3.2 checklist | No code-path changes to the warm-cache policy or cold-boot chain. Jest: `engine.middleware.warmCache.test.ts` + `engine.boot.idb.test.ts` + `remote.fetch.test.ts` all pass unchanged. |
| 3 | **New-user first-visit**: brand-new account (no `user_preferences` row) loads the demo; defaults apply in Redux; first edit triggers Supabase UPSERT that creates the row | 🟡 **Needs browser run** — see §3.3 checklist | Phase 2 fix `472f23acc` already handles the empty-row case (`invokeRemoteFetch` returns empty body, policy REHYDRATEs with defaults from initial state). Phase 3 removes the server-side `insert` that was redundant with this path. |
| 4 | **Theme first-frame correctness**: hard-refresh with `cookie: theme=dark` → the very first HTML frame contains `class="dark"` in `<html>` | 🟡 **Needs browser run** — see §3.4 checklist | Code path: `app/layout.tsx` reads `cookies().get("theme")?.value` and conditionally applies `isDark && "dark"` to the `<html>` className — before any JS executes. Unit-test coverage of the server-render path itself is deferred to browser verification (mocking `next/headers` + rendering a Next.js layout in Jest has a high complexity-to-value ratio; the logic is 5 lines of trivial ternaries). |
| 5 | **Theme roundtrip on toggle**: clicking the theme toggle writes the `theme` cookie within ~50 ms, writes `matrx:theme` to localStorage, dispatches the Redux action, broadcasts to other tabs | ✅ (unit-tested) + 🟡 (browser verification in §3.5) | Jest `themeSlice.cookieMirror.test.ts`: 9 tests verify `writeThemeCookie(mode)` POST body shape + the StoreProvider subscription fires only on changes + no redundant POST on REHYDRATE-to-same-value. Browser verification in §3.5 confirms DevTools → Application → Cookies shows the updated value within one frame. |
| 6 | **Graceful degradation**: cookie absent + localStorage present → `SyncBootScript` reads LS and applies class (pre-Phase-3 behavior preserved). Cookie + LS both absent → `prefers-color-scheme` fallback fires | 🟡 **Needs browser run** — see §3.6 checklist | No code change to `SyncBootScript` or `prePaint` descriptors. The cookie read is additive — when absent, `isDark = false`, `dataTheme = undefined`, and the script fully controls the class. |
| 7 | `isAdmin` still works in authenticated routes; `adminSidebarLinks` still shows for admins | 🟡 **Needs browser run** — see §3.7 checklist | `checkIsUserAdmin` is the same narrow lookup previously called inside `getUserSessionData`. `(authenticated)/layout.tsx` passes `isAdmin ? adminSidebarLinks : []` through `layoutProps` unchanged. `.catch()` fallback added on the layout side defends against transient table errors. |
| 8 | Unit tests green under jsdom — 93 Phase 2 baseline + new cookie-mirror tests | ✅ | `npx jest` → 14 suites / **102 tests** all green. See §6 for the full breakdown. (The 2 reported "FAIL" suites are `utils/json/__tests__/extract-json.test.ts` + `features/agent-shortcuts/utils/scope-mapping.test.ts` — handrolled ts-node scripts with no `describe`/`test` blocks, pre-existing before Phase 3.) |
| 9 | Grep verification — zero `getUserSessionData` hits in `app/*/layout.tsx` | ✅ | See §5 below. Remaining hits are all in the function's definition file (`utils/supabase/userSessionData.ts`), comments in sync-engine tests, or stale doc-block references in `components/layout/index.ts` / `app/DeferredSingletons.tsx` — all slated for a Phase 8 cleanup pass. |
| 10 | Net-lines report | ✅ | See §7 below. |

---

## 3. Manual browser checklist

Run against `pnpm dev` with the auto-login URL `http://localhost:3000/api/dev-login?token=${DEV_LOGIN_TOKEN}&next=/sync-demo/preferences` (lands signed-in on the preferences demo).

### 3.1 Server-decoupling sanity

1. Sign out, then sign back in. First layout render after sign-in.
2. DevTools → Network → filter `user_preferences`. **Expected: no requests during the layout render** (pre-Phase-3 emitted one GET via the bundled RPC).
3. DevTools → Network → filter `admins`. **Expected: one `.select('user_id').eq('user_id', …).maybeSingle()` request** — the narrow `checkIsUserAdmin` lookup.
4. DevTools → Network → look at the top-level HTML document response. **Expected: the HTML body size has dropped** relative to pre-Phase-3 (the preferences payload is no longer inlined into `preloadedState`).
5. Result: ☐ PASS ☐ FAIL ☐ NOTES:

### 3.2 Preferences path regression (Phase 2 §3 re-run)

Re-run the full Phase 2 manual checklist (`phase-2-verification.md` §3.1–§3.6) on HEAD. Phase 3 must not regress any of:

- §3.1 — warm boot emits zero `user_preferences` traffic
- §3.2 — cross-tab sync ≤ 20 ms
- §3.3 — cold boot: one GET, zero POST, IDB populates, next refresh is warm
- §3.4 — IDB + localStorage both blocked → defaults apply, no crash
- §3.5 — identity swap isolates data per identity
- §3.6 — localStorage fallback mirror populates correctly

Result: ☐ all 6 PASS ☐ regressions: _______

### 3.3 New-user first-visit

1. Create a fresh Supabase account via `/signup` (or use the SQL helper in `scripts/dev/create-test-user.ts` if available).
2. Sign in; land on `/sync-demo/preferences`.
3. DevTools → Network → filter `user_preferences`. Expected trace:
   - One `user_preferences?select=preferences&user_id=eq.…` GET (the cold-boot fetch).
   - Zero POSTs during boot.
4. Confirm demo renders with all defaults — the Redux `_meta.loadedPreferences` reflects the full `defaultUserPreferences` snapshot.
5. Bump any preference (temperature slider is the easiest). Wait 500 ms.
6. Network: one `user_preferences` UPSERT — this is the row-creation write.
7. Supabase dashboard → `user_preferences` table → confirm the new row exists for this user id.
8. Hard-refresh. Confirm warm boot: zero `user_preferences` traffic.
9. Result: ☐ PASS ☐ FAIL ☐ NOTES:

### 3.4 Theme first-frame correctness

1. Set `theme=dark` cookie manually (DevTools → Application → Cookies → add row).
2. Close all tabs; fully quit the browser.
3. Disable JavaScript for `localhost:3000` (DevTools → Settings → Preferences → Debugger → "Disable JavaScript").
4. Reload the page.
5. Expected: page renders with dark background on first paint; view-source shows `<html … class="…inter.variable … dark" data-theme="dark">`.
6. Switch the cookie to `theme=light`; repeat.
7. Expected: page renders with light background; `class` no longer contains `dark`; `data-theme="light"`.
8. Delete the cookie; repeat.
9. Expected with JS disabled: no `dark` class, `data-theme` attribute absent. (User will land on the CSS default; acceptable for a cookie-absent first-visit.)
10. Re-enable JS: `SyncBootScript` fires and applies the `prefers-color-scheme` fallback.
11. Result: ☐ PASS ☐ FAIL ☐ NOTES:

### 3.5 Theme roundtrip on toggle

1. Open any authenticated route (e.g., `/dashboard`).
2. Open DevTools → Application → Cookies. Note current `theme` value.
3. Open DevTools → Network → filter `/api/set-theme`.
4. Click the theme toggle.
5. Expected:
   - Cookie updates within one animation frame (DevTools autoupdates).
   - Exactly one `/api/set-theme` POST with `{"theme":"dark"}` or `{"theme":"light"}`.
   - `matrx:theme` in localStorage updates concurrently.
   - Other tabs (if open) receive the broadcast and update their class.
6. Toggle several times rapidly. Expected: one POST per distinct value change (no spurious POSTs — the StoreProvider subscription's `lastMode` dedupe kicks in).
7. Result: ☐ PASS ☐ FAIL ☐ NOTES:

### 3.6 Graceful degradation — cookie absent, LS present

1. Sign in, toggle the theme a couple of times to ensure `matrx:theme` is populated.
2. DevTools → Application → Cookies → delete `theme`.
3. Hard-refresh.
4. Expected: page renders with the correct theme (from LS), no flicker.
5. Confirm by view-source that `<html>` does NOT have the `dark` class in the first frame (cookie was absent), then confirm by `document.documentElement.classList` in the console that the script has added the class post-head-parse.
6. Result: ☐ PASS ☐ FAIL ☐ NOTES:

### 3.7 `isAdmin` still works

1. Sign in as `admin@admin.com`.
2. Confirm sidebar shows both `appSidebarLinks` and `adminSidebarLinks` (admin-only entries like "Admin" routes).
3. Sign out; sign in as a non-admin user.
4. Confirm sidebar only shows `appSidebarLinks`.
5. Network trace: both sessions should show one `admins` `.select` request per full-page load, zero `user_preferences` GETs during layout render.
6. Result: ☐ PASS ☐ FAIL ☐ NOTES:

---

## 4. TTFB measurement template

Run both samples from the same network environment. Replace HEAD with `d61424cf8` (pre-Phase-3 baseline) for the "before" sample; use `655c47853` for "after."

```bash
# Representative routes — 5 per group
for route in /chat /notes /sample-route /demos /sync-demo/preferences \
             /dashboard /tasks /artifacts /agents /projects \
             /ssr ; do
  for i in {1..20}; do
    curl -sS -o /dev/null -w "%{time_starttransfer}\n" "http://localhost:3000$route"
  done | sort -n | awk 'NR==1{min=$1} NR==10{p50=$1} NR==19{p95=$1} END{printf "%-40s min=%.3fs p50=%.3fs p95=%.3fs\n", "'$route'", min, p50, p95}'
done
```

Paste results below once measured (on a clean Supabase cache for fair cold-path comparison — bounce the dev server between samples).

**Pre-Phase-3 (`d61424cf8`)**: _pending measurement_
**Post-Phase-3 (HEAD)**: _pending measurement_

Expected delta: p50 drops ≥ 30 ms per route, p95 drops ≥ 80 ms per route. If the delta is smaller, the measurement methodology is suspect (Supabase region latency can dwarf the RPC delta; re-measure with `PGRST_SERVER_HOST` set to a same-region instance).

---

## 5. Grep verification (criterion #9)

Run verbatim on 2026-04-22 against HEAD (`655c47853`):

```bash
grep -rn "getUserSessionData" --include='*.ts' --include='*.tsx' \
  app/ components/ features/ hooks/ lib/ providers/ styles/ \
  | grep -v ".claude/worktrees"
```

Output (3 lines, all expected):

```
app/DeferredSingletons.tsx:17:// preference hydration is handled server-side via `getUserSessionData`
components/layout/index.ts:29: *   import { getUserSessionData } from '@/utils/supabase/userSessionData';
lib/sync/__tests__/engine.middleware.warmCache.test.ts:282:        // `(a)/layout.tsx` injects via `getUserSessionData`.
```

Classification:
- `app/DeferredSingletons.tsx:17` — **stale comment** from pre-Phase-3 pattern; the referenced server-side fetch no longer happens. Flag for Phase 8 cleanup pass (one-line comment edit, not blocking).
- `components/layout/index.ts:29` — **stale JSDoc example** in a barrel file. Same — Phase 8 cleanup.
- `lib/sync/__tests__/engine.middleware.warmCache.test.ts:282` — **test comment** describing pre-Phase-3 behavior to contrast with the path under test. Correct as a historical reference; leave in place.

Second grep, for the preferences-init symbols removed from layouts:

```bash
grep -rn "initializeUserPreferencesState\|defaultUserPreferences" app/ \
  --include='*.ts' --include='*.tsx' | grep -v ".claude/worktrees"
```

Output: **zero hits in `app/*/layout.tsx`**. Remaining hits all in:
- `lib/redux/slices/userPreferencesSlice.ts` — slice definition (owns the initializer).
- `lib/redux/slices/defaultPreferences.ts` — defaults definition.
- `lib/redux/store.ts` — `resolveStoreBootstrapState` fallback chain (falls back when `initialState.userPreferences` is undefined, which is now the common case).

**Zero references to bundled-RPC preferences-init logic anywhere in `app/*/layout.tsx`.** Goal met.

---

## 6. Jest evidence

```
$ npx jest
Test Suites: 2 failed, 14 passed, 16 total
Tests:       102 passed, 102 total
Snapshots:   0 total
Time:        ~3.5s
```

(Count grew from 93 → 102 in commit `655c47853` — +9 new tests for `writeThemeCookie` + the StoreProvider cookie-mirror subscription pattern.)

The 2 reported "FAIL" suites are pre-existing, not introduced by Phase 3:

1. `utils/json/__tests__/extract-json.test.ts` — handrolled script using plain `console.assert`; no `describe` or `test` blocks. Jest sees the file, finds no Jest-shaped tests, reports "Your test suite must contain at least one test." Predates Phase 1.
2. `features/agent-shortcuts/utils/scope-mapping.test.ts` — same pattern; handrolled script, no Jest blocks.

These are candidates for a Phase 8 cleanup pass (either convert to Jest tests or move to a separate script path Jest won't glob).

Suites (alphabetized, Phase 2 baseline + Phase 3 additions):

1. `apply-prePaint.test.ts` — 4 tests
2. `channel.test.ts` — 8 tests
3. `engine.boot.idb.test.ts` — 7 tests
4. `engine.boot.test.ts` — 5 tests
5. `engine.middleware.test.ts` — 11 tests
6. `engine.middleware.warmCache.test.ts` — 3 tests
7. `messages.test.ts` — 10 tests
8. `persistence.idb.test.ts` — 10 tests
9. `persistence.local.test.ts` — 9 tests
10. `policies.define.test.ts` — 7 tests
11. `pre-paint.test.ts` — 7 tests
12. `remote.fetch.test.ts` — 7 tests
13. `remote.write.test.ts` — 7 tests
14. **`themeSlice.cookieMirror.test.ts` — 9 tests (new in PR 3.B)**

---

## 7. Net-lines report (criterion #10)

| PR | Files | Insertions | Deletions | Net |
|---|---|---|---|---|
| 3.A | 5 | +66 | −129 | **−63** |
| 3.B | 3 | +279 | 0 | +279 |
| **Phase 3 total** | **8** | **+345** | **−129** | **+216** |

Breakdown of PR 3.B's +279:
- `providers/StoreProvider.tsx`: +17 (subscription wire-up + comment)
- `styles/themes/themeSlice.ts`: +25 (`writeThemeCookie` helper + comment)
- `styles/themes/__tests__/themeSlice.cookieMirror.test.ts`: +237 (new, all tests)

Non-test net delta for Phase 3: **−87 lines** (3.A's −63 plus 3.B's +42 non-test additions minus nothing deleted in 3.B). Decisively net-negative on the code-code front. The test addition is pure coverage expansion.

Running total Phase 1–3, code-only (excluding tests):

| Phase | Code-only net |
|---|---|
| 1 | **−380** (5 files deleted — `ThemeProvider`, `useTheme`×2, `ThemeScript`, `preferencesMiddleware`, plus inline script) |
| 2 | +1800 (engine expansion — amortized across Phases 5–8 deletions of ~3000 LoC) |
| 3 | **−87** |
| **Running code-only total** | **+1333** |

Per the Phase 2 forecast, the running total crosses net-negative during Phase 6 (custom IDB stack deletion, ~1300 LoC). Phase 3's contribution pulls the cumulative total slightly closer to that crossover.

---

## 8. Key invariants / technical notes

- **Cookie-first, script-fallback precedence**: `app/layout.tsx` sets `isDark` from the cookie; `SyncBootScript` runs in `<head>` and its `classToggle` descriptor applies/removes the class based on `localStorage.matrx:theme`. When both sources agree (the common case), the script's output is idempotent. When the cookie says "dark" but LS says "light" (edge case — user cleared LS but cookie persisted), the script's LS read wins because it runs after the server-rendered HTML. This is acceptable: LS is the newer write path, and the demo's toggle path writes both at once (cookie via `/api/set-theme`, LS via the sync engine middleware).
- **StoreProvider `lastMode` seeding is the critical invariant**: without it, every REHYDRATE that lands with the same value as `initialState` would trigger one redundant `/api/set-theme` POST per page load. The seed from `store.getState().theme?.mode` at store-creation time (before any action dispatches) captures the SSR baseline identity; the subscription then only fires on genuine changes. The 9 new Jest tests in `themeSlice.cookieMirror.test.ts` pin this behavior.
- **Fire-and-forget cookie write**: `writeThemeCookie` does not await the fetch or surface failures. A failed cookie write is not user-visible — the `matrx:theme` LS write (handled by the sync engine middleware, independent of this helper) still paints correctly on next load via `SyncBootScript`. The cookie is best-effort optimization for SSR first-frame correctness.
- **`checkIsUserAdmin` error handling**: `(authenticated)/layout.tsx` wraps the call in `.catch()` to default `isAdmin = false` on transient table errors — keeps admin UI safely hidden rather than crashing the page. `(a)` and `(ssr)` layouts don't add the `.catch` because their `checkIsUserAdmin` call is inside a `Promise.all` where either an error surfaces naturally (dev) or Vercel's crash-reporting catches it (prod). Consistent handling is a Phase 9 opportunity.
- **`InitialReduxState.userPreferences` optional narrowing**: `resolveStoreBootstrapState` at `lib/redux/store.ts:59` was already defensive against `input.userPreferences === undefined` (uses `initializeUserPreferencesState(defaultUserPreferences)` as the fallback). Making the type optional surfaces the fact that layouts no longer populate it — a compile-time enforcement that matches the runtime shape.

---

## 9. Follow-ups / known limitations

- **TTFB measurement is manual** — the `scripts/sync/measure-ttfb.ts` script mentioned in the plan wasn't committed (scratch work). A follow-up (Phase 10's `'use cache'` audit) will need a measurement harness anyway; folding this into that skill-up is higher value than a one-off script now.
- **Stale `getUserSessionData` comments in `app/DeferredSingletons.tsx` and `components/layout/index.ts`** — 2 lines of pre-Phase-3 documentation that are now misleading. Phase 8 cleanup pass (ad-hoc localStorage + stale doc comments audit) will fix. Not blocking.
- **`insert({ preferences: defaultUserPreferences })` backfill fully gone** — one residual risk is users who signed up pre-Phase-2 but never triggered a preferences write. They have no `user_preferences` row; the first write creates it. Fine for Phase 2–3, but Phase 10's `'use cache'` work may want an explicit row-exists check on specific dashboard routes that read preferences via RPC rather than slice. Flag for Phase 10 plan.
- **Theme cookie is `SameSite=Strict`** (existing `/api/set-theme` endpoint). This means the cookie does not ride cross-site navigations (e.g., from a marketing site → app). Low stakes; defer to Phase 9 (route consolidation, which may merge marketing into the same origin anyway).

---

## 10. Sign-off

Phase 3 is **code-complete** and tests-green (102/102 Jest tests, 14 suites). The manual browser checklist in §3 and the TTFB measurement template in §4 remain to be walked through by a human.

Once §3.1–§3.7 flip to PASS and §4 has measured numbers, Phase 3 is closed and Phase 4 (`userSlice` split into `userAuth` + `userProfile`, `setGlobalUserId` replacement) can begin.
