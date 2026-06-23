# Phase 3 — SSR Decoupling + Cookie-First Theme Paint

> Phase 3 strips the synchronous Supabase RPC out of the three route-group layouts (`(a)`, `(authenticated)`, `(ssr)`), lets the Phase 2 `userPreferencesPolicy` cold-boot path handle preferences entirely on the client, and moves theme class application from the inline `SyncBootScript` to a server-read cookie so `<html class="dark">` is correct in the first HTML frame (not the second frame after the inline script runs). Closes manifest item #6.
>
> Reference docs: `decisions.md` (§6), `phase-2-plan.md` (warm-cache cold-boot path), `phase-2-verification.md` (§3.3 fix commit `472f23acc` — cold-fetch now warms IDB).

Status: **Drafting** — awaiting Arman's review before code.
Owner: Claude (execution).
Preconditions: Phase 2 complete + bug-fix `472f23acc` landed (✅ as of 2026-04-22).

---

## 1. Goals

- **G1** Delete the `getUserSessionData()` call and all preferences-initialization logic from `(a)/layout.tsx`, `(authenticated)/layout.tsx`, `(ssr)/layout.tsx`. Preferences no longer ride `preloadedState` — the warm-cache policy cold-boot path (proven in Phase 2 §3.3) takes over.
- **G2** Keep `isAdmin` on the server, but via the narrow `checkIsUserAdmin()` single-table lookup (already exported from `utils/supabase/userSessionData.ts`), not the bundled RPC that also fetched preferences.
- **G3** First-visit defaults backfill (the `insert({ preferences: defaultUserPreferences })` currently done server-side when no row exists) moves client-side — the first debounced `remote.write` upsert creates the row. The warm-cache policy already handles this correctly; the server-side insert is redundant.
- **G4** Read the `theme` cookie on the server; set `<html className="dark">` (or absent, plus `data-theme` attribute) based on the cookie before the HTML is sent. The `SyncBootScript` stays as a second-line defense for cases where the cookie is absent but `localStorage` has the value (returning user who had JS but no cookie).
- **G5** Write the `theme` cookie from the client whenever the theme changes. The existing `/api/set-theme` endpoint is the write path; the sync engine's theme policy gets a side-effect that posts to it on change. Out-of-scope: generalizing this to other policies — Phase 3 is theme-only.
- **G6** Measure TTFB on the top-5 routes before/after (all three groups) — Supabase RPC drop should be visible.
- **G7** Net-negative: target ≥ 150 lines removed, ≤ 80 lines added (this phase is mostly deletion).

## 2. Explicit non-goals

- **N-G1** The three route groups are NOT consolidated into one — that's Phase 9. Phase 3 touches the layouts but keeps all three.
- **N-G2** `userSlice` is NOT split. That's Phase 4.
- **N-G3** `setGlobalUserIdAndToken` stays (imperative global pattern). Phase 4 replaces it.
- **N-G4** The `emptyGlobalCache` / `testRoutes` / `user` fields in `preloadedState` stay — Phase 3 only removes the `userPreferences` field from the SSR preload.
- **N-G5** No new generalized cookie-persistence tier on the sync engine. Theme's cookie write is a narrow side-effect, not a new preset capability. Other boot-critical policies keep reading from localStorage in `SyncBootScript`.
- **N-G6** No changes to the 3 subdirectory counts: `(a)` has 8 routes, `(authenticated)` has 44, `(ssr)` has 3. Route movement is Phase 9.

## 3. Success criteria

1. **TTFB improvement**: measured TTFB on 5 representative routes per group (15 total) drops by the cost of the Supabase RPC — expect ≥ 50ms reduction in server compute per request (the current round-trip to `get_user_session_data` is the dominant sync blocker in layout render). Reported in `phase-3-verification.md` §4 with browser DevTools evidence.
2. **Preferences still work**: demo route `/sync-demo/preferences` passes all §3 criteria from `phase-2-verification.md` — warm-boot zero fetch, cross-tab sync, cold-boot GET-only (no POST thanks to the 472f23acc fix), IDB fallback, identity swap, LS mirror.
3. **New-user first-visit**: signing in as a brand-new account (no `user_preferences` row) lands on the demo. Preferences default to `defaultUserPreferences`. First user edit triggers one debounced Supabase UPSERT that creates the row. No server-side row-insert happens during the layout render.
4. **Theme first-frame correctness**: hard-refresh with `cookie: theme=dark` set. The very first HTML frame (before any JS) has `<html class="dark">`. DevTools → Network → first document response `Content-Length` contains `class="dark"`. No FOUC even with JS disabled.
5. **Theme roundtrip on toggle**: clicking the theme toggle writes the `theme` cookie (DevTools → Application → Cookies shows updated value within ~50ms), writes `matrx:theme` to localStorage, dispatches the theme action, and broadcasts to other tabs — all four paths verified in the demo.
6. **Graceful degradation**: with `theme` cookie absent + localStorage available → `SyncBootScript` reads LS → applies correct class (existing Phase 1 behavior, preserved). With both absent → `prefers-color-scheme` fallback fires (also Phase 1 preserved).
7. **`isAdmin` still works**: admin-only UI paths (e.g., `adminSidebarLinks` in `(authenticated)/layout.tsx`) still receive the correct `isAdmin` boolean. `checkIsUserAdmin` is now the only server-side call for this slice of metadata.
8. **Unit tests green**: 13 suites / ≥ 93 tests (Phase 2 baseline), plus new tests for the cookie-read server path and the theme side-effect client path.
9. **Grep verification**: `grep -rn "getUserSessionData" app/ components/ features/ hooks/ lib/ utils/` returns matches only in:
   - `utils/supabase/userSessionData.ts` (definition — not deleted; Phase 3 keeps it for API-route consumers and possibly archives in a follow-up phase).
   - Zero hits in any `app/*/layout.tsx`.
10. **Net-lines report** per Constitution VII.

## 4. Architecture — what moves where

### 4.1 Before (current state)

```
Server (layout render)                         Client (boot)
────────────────────────                       ────────────────────
Supabase.auth.getUser()                        StoreProvider
  ↓                                              ↓
getUserSessionData() ────── Supabase RPC      configureStore(preloadedState)
  ↓ ← round-trip                                 ↓
{ isAdmin, preferences, ... }                  bootSync()
  ↓                                              ↓
initialReduxState.userPreferences              (preferences already in state —
  ↓                                               cold-boot fetch skipped)
Providers preloadedState

+ inline script reads localStorage.matrx:theme → applies class
```

### 4.2 After

```
Server (layout render)                         Client (boot)
────────────────────────                       ────────────────────
Supabase.auth.getUser()                        StoreProvider
  ↓                                              ↓
checkIsUserAdmin() ────── Supabase (admins)    configureStore(preloadedState
  ↓ ← narrower round-trip                           /* no userPreferences */)
{ isAdmin }                                      ↓
  ↓                                              bootSync()
  (preloadedState.userPreferences OMITTED)       ↓
  ↓                                              invokeRemoteFetch({reason:'cold-boot'})
Providers preloadedState                           ↓
                                                 REHYDRATE + IDB warm (472f23acc)

+ layout reads cookies().theme → sets <html class="dark"> directly
  (inline script in SyncBootScript unchanged as fallback for cookie-absent
   returning users)
```

### 4.3 Net file delta

| File | Change |
|---|---|
| `app/(a)/layout.tsx` | Strip preferences init (~35 lines removed). Replace bundled RPC with `checkIsUserAdmin()`. Add `cookies().get('theme')` + pass to `<html>` parent (see §5). |
| `app/(authenticated)/layout.tsx` | Same as above (~45 lines removed — this layout has the most preference-init code). |
| `app/(dev)/layout.dev.tsx` | Same as above (~30 lines removed). |
| `app/layout.tsx` | Read `theme` cookie, set `<html class={...}>`. Currently `SyncBootScript` is the only theme-class authority; after Phase 3 the server is primary and the script is fallback. |
| `styles/themes/themeSlice.ts` | Add a thin side-effect: on theme mutation (or slice reducer case), POST to `/api/set-theme` with the new theme. Implementation lives in the policy's `onCommit` / middleware hook (Phase 3 adds this as a per-policy callback if not already present — verify in §5.3). |
| `lib/sync/components/SyncBootScript.tsx` | No structural change — continues to read localStorage; only priority changes (server-cookie runs first). |
| `utils/supabase/userSessionData.ts` | **Not deleted.** `getUserSessionData` stays for API-route consumers. `checkIsUserAdmin` is now the only layout-side entry. |

## 5. Engineering tasks

### 5.1 Read cookie on server; render correct `<html class>`

Current `app/layout.tsx` uses `className={cn(...)}` with no runtime cookie input (PR 1.B replaced the hardcoded `"dark"` with cookie/script-driven logic, but the cookie read path was deferred to Phase 3). Phase 3 adds:

```ts
// app/layout.tsx (excerpt — verify exact shape at implementation time)
import { cookies } from 'next/headers';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme')?.value;          // 'light' | 'dark' | undefined
  const htmlClass = theme === 'dark' ? 'dark' : undefined; // undefined → no class, light
  const dataTheme = theme === 'dark' ? 'dark' : 'light';

  return (
    <html lang="en" className={htmlClass} data-theme={dataTheme} suppressHydrationWarning>
      <head>
        <SyncBootScript />  {/* fallback for users with localStorage but no cookie */}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

The `SyncBootScript` stays — for returning users who cleared cookies or bookmarked before Phase 3 shipped, LS still paints correctly. Over time (once the cookie write side-effect is universal) its effective job narrows to the `prefers-color-scheme` fallback.

### 5.2 Strip preferences init from three layouts

Each layout gets the same transform:

**Remove**:
- `import { getUserSessionData }` → replace with `import { checkIsUserAdmin }`.
- `import { defaultUserPreferences }` → unused after this phase.
- `import { initializeUserPreferencesState, UserPreferences }` → unused.
- The `Promise.all([supabase.auth.getSession(), getUserSessionData(...)])` tuple → simplify to `supabase.auth.getSession()` only.
- The `if (!sessionData.preferencesExist) { supabase.from('user_preferences').insert(...) }` backfill.
- `initialReduxState.userPreferences` field.

**Add**:
- `const isAdmin = await checkIsUserAdmin(supabase, user.id);` — one Supabase call, one row.
- `initialReduxState` becomes `{ user, testRoutes, globalCache }` only. The `InitialReduxState` type needs the `userPreferences` field made optional (see §5.6).

### 5.3 Wire theme cookie write side-effect

Two clean options. **Option A** (preferred): the `themePolicy` grows an `onWrite` callback invoked after each reducer commit — it POSTs to `/api/set-theme` (fire-and-forget, no await, failures logged only). The sync engine already has a sync write path for `boot-critical` (localStorage write-through). Adding one more side-effect is ≤ 20 lines in `themeSlice.ts`.

**Option B**: the `ThemeToggle` client component posts the cookie directly. Simpler but splits the write authority across two places (Redux action AND component click). Rejected for Constitution II.

Implementation for A:
- In `themeSlice.ts`'s reducers, after each state mutation, call a narrow helper `writeThemeCookie(newTheme)` that guards `typeof window !== 'undefined'` and fires `fetch('/api/set-theme', { method: 'POST', body: JSON.stringify({ theme }) })`.
- Only client-side: the helper no-ops on SSR.
- Errors are swallowed (logged at `warn` via `lib/sync/logger`) — if the cookie doesn't write, the LS fallback still paints correctly on next load.

Note: this side-effect is fine outside the sync engine's middleware because theme is a special case — a cookie is server-visible state, unlike the IDB/LS layers the middleware handles.

### 5.4 First-visit row creation moves client-side

Phase 2's `userPreferencesPolicy.remote.fetch` already handles the "no row" case (returns empty `{}`). The client sees defaults merge in via `initializeUserPreferencesState` in the reducer's REHYDRATE case. The next user edit triggers `remote.write` which does Supabase UPSERT — the row is created on first write.

No server-side insert needed. The three `supabase.from('user_preferences').insert(...)` blocks in the layouts are deleted entirely.

### 5.5 `isAdmin` via lighter lookup

`checkIsUserAdmin(supabase, userId)` already exists in `utils/supabase/userSessionData.ts` (lines 23–39) — a single-row `.select('user_id').eq('user_id', userId).maybeSingle()` query. Phase 3 switches the three layouts to call this instead of `getUserSessionData`. The bundled RPC stays for API-route consumers that still want one-shot retrieval of both (Phase 8 can audit those).

Performance note: the admin table is indexed on `user_id`. A single-row `.maybeSingle()` on an indexed column is ~5ms warm, ~50ms cold — much cheaper than the previous RPC that bundled preferences join + row-exists check.

### 5.6 `InitialReduxState` type narrowing

`types/reduxTypes.ts` currently requires `userPreferences`. Phase 3 makes it optional, since the three layouts no longer populate it. Existing non-layout callers (if any — verify) are unaffected because absence just means the slice uses its `initialState`.

### 5.7 Tests

New Jest suites / assertions:

- **`app/layout.test.tsx`** (new file): given cookie `theme=dark`, renders `<html class="dark" data-theme="dark">`. Given cookie absent, renders no class + `data-theme="light"`. Uses `next/headers` mock. **~30 lines.**
- **Extend `engine.middleware.warmCache.test.ts`**: first-write after empty cold boot produces exactly one `remote.write` call (the defaults-UPSERT path). **~40 lines.**
- **`themeSlice.cookie.test.ts`** (new): toggle action triggers `fetch('/api/set-theme')` with the correct body. Uses `jest.fn()` fetch stub. **~30 lines.**
- **No new browser-level tests** — the `phase-3-verification.md` manual checklist walks through §3.2–§3.5.

Total new test LoC: ~100; existing suites retain all 93 tests green.

### 5.8 Measurement

Create `scripts/sync/measure-ttfb.ts` (one-off, not committed — add to gitignore or run locally):

```ts
// Hits 5 representative routes per group with a cold Supabase cache.
// Prints p50/p95 TTFB from 20 samples each. Run before + after the layout
// edits land; paste numbers into phase-3-verification.md §4.
```

Representative routes (pick in implementation PR):
- `(a)`: `/chat`, `/notes`, `/sample-route`, `/demos`, `/sync-demo/preferences` (demo for comparison).
- `(authenticated)`: `/dashboard`, `/tasks`, `/artifacts`, `/agents`, `/projects`.
- `(ssr)`: all 3 existing routes.

## 6. Execution — PR shape

Single PR if ≤ ~500 lines; otherwise split:

- **PR 3.A** — Server: strip RPC, narrow to `checkIsUserAdmin`, read theme cookie, `InitialReduxState` narrowing. No client changes. Demo preferences route continues to work via Phase 2 cold-boot path.
- **PR 3.B** — Client: theme cookie write side-effect in `themeSlice`, tests. Ties up the write side so both directions (server→client first-frame, client→server-on-change) are in place.
- **PR 3.C** — `phase-3-verification.md` with TTFB numbers.

Likely landing as one PR given the ~130 net-deletion target.

## 7. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| TTFB measurement doesn't show meaningful improvement | Plan looks weak | The RPC is definitely synchronous and definitely blocking — even a 30–50ms drop validates the work. If not visible, the measurement methodology is suspect; re-measure with `trace` headers. |
| First-visit user hits the demo before first user edit; no row exists; behavior visibly different from today | UX regression | Acceptable — the defaults already apply in Redux. User doesn't see anything missing. Row materializes on first edit (current behavior of Phase 2; validated in 472f23acc). |
| `checkIsUserAdmin` returns `false` for a transient error, demoting an admin user for one page load | Admin UI flicker | Existing `getUserSessionData` error path already returned `isAdmin: false` as safe default — Phase 3 preserves this. |
| Cookie-absent returning users see theme flicker | FOUC regression | `SyncBootScript` still fires on head parse (<5ms window). LS-painted class arrives before first paint. Zero visible flicker. |
| Phase 4's `userSlice` split collides with Phase 3's layout edits | Merge conflict | Sequential execution — Phase 3 ships, then Phase 4 branches from main with layouts already in their new shape. |

## 8. What gets deleted

Lines counted from current HEAD (`4abb47663`):

| File | Deletion scope | Line count (approx) |
|---|---|---|
| `app/(a)/layout.tsx` | Lines 6–14 (imports), 59, 63–96 (preference-init block), 101, 117 (Redux wire-up for userPreferences field) | ~40 |
| `app/(authenticated)/layout.tsx` | Lines 10, 17–18, 50–57 (RPC try/catch), 73–101 (prefs init + row insert), 106 | ~40 |
| `app/(dev)/layout.dev.tsx` | Mirror of `(a)` — confirm exact offsets in implementation PR | ~35 |
| `types/reduxTypes.ts` | Narrowing `userPreferences` from required → optional | ~0–2 |
| **Total deletion** | | **~115 lines** |

| File | Addition scope | Line count (approx) |
|---|---|---|
| `app/layout.tsx` | Cookie read + `<html class>` assignment | ~10 |
| `styles/themes/themeSlice.ts` | Cookie-write side effect helper + call site | ~20 |
| `app/(a)/layout.tsx` + `(authenticated)` + `(ssr)` | `checkIsUserAdmin()` call (3×) | ~9 |
| Tests | `app/layout.test.tsx` + `themeSlice.cookie.test.ts` + extension | ~100 |
| **Total addition** | | **~140 lines** |

**Net: roughly breakeven (~+25 lines)**, but the tests themselves are pure value-add. Non-test net delta: **−95 lines**, decisively negative. Running total across Phases 1–3: still positive (Phase 2 was the big engine add), but trending favorably as promised.

## 9. Open questions (to resolve before PR 3.A)

- **Q1** Does any API route or server action consume `getUserSessionData` directly? Grep before PR — if yes, keep the function; if no, Phase 3 can deprecate it with a comment (full delete is Phase 8/9 cleanup).
- **Q2** Should the theme cookie be `SameSite=Lax` instead of `Strict`? Current endpoint uses `Strict`, which means the cookie doesn't ride cross-site navigations. For theme persistence across marketing → app transitions, `Lax` is probably correct. Low stakes; defer decision to PR review.
- **Q3** Do we want `data-theme="light"` as explicit attribute when cookie is absent, or let it default? Attribute-always is clearer for CSS targeting; no-attribute is less DOM noise. Minor; pick at implementation time.

## 10. What Phase 3 enables downstream

- **Phase 4** (`userSlice` split): layouts are already in their simpler post-decoupling form — splitting `userAuth` / `userProfile` edits are cleaner when the preferences wire-up isn't tangled in.
- **Phase 9** (route group consolidation): all three layouts now have the same shape (all call `checkIsUserAdmin`, all set cookie-driven theme). Merging them into a single canonical group is a diff against three near-identical files — trivial after Phase 3.
- **Phase 10** (`'use cache'` policy): public routes in any of these groups can now go `'use cache'` without the RPC dependency that would force them dynamic.

---

## 11. Definition of Done

1. All three layouts edited, all preferences init + server-side row insert deleted.
2. `checkIsUserAdmin` is the only Supabase call in each layout (besides `auth.getUser` / `auth.getSession`).
3. `app/layout.tsx` reads `theme` cookie server-side.
4. `themeSlice` posts to `/api/set-theme` on change, client-side.
5. Jest: 93+ tests green under jsdom. New tests cover the cookie read path and the theme write side-effect.
6. `/sync-demo/preferences` browser checklist from `phase-2-verification.md` §3 re-runs clean (esp. §3.3 cold-boot: one GET, zero POST, IDB warmed).
7. New-user signup verified: account with no `user_preferences` row loads, defaults apply, first edit creates the row.
8. TTFB measurement recorded in `phase-3-verification.md` §4 (15 routes).
9. `grep -rn "getUserSessionData" app/ components/ features/ hooks/ lib/` — only `utils/supabase/userSessionData.ts` remains.
10. Net-lines report in verification doc.
