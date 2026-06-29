# Supabase Upgrade Research — `@supabase/supabase-js` & `@supabase/ssr`

> **Scope:** Planning a deliberate, careful upgrade of:
> - `@supabase/supabase-js`: **2.99.2 → 2.108.2**
> - `@supabase/ssr`: **0.9.0 → 0.12.0**
>
> **Repo:** `matrx-frontend` (Next.js 16 App Router, React 19). Today: mid-2026. All facts below are cited to the official changelogs / docs / PRs.

---

## TL;DR — the `RejectExcessProperties` fix

The ~34 new TS errors are **not a bug** — they are a deliberate, correct type tightening that shipped in **`supabase-js` v2.102.0** ([release](https://github.com/supabase/supabase-js/releases/tag/v2.102.0), [PR #2186](https://github.com/supabase/supabase-js/pull/2186), [issue #1636](https://github.com/supabase/supabase-js/issues/1636)). `.insert()` / `.update()` / `.upsert()` now reject keys that aren't real columns at compile time.

**Best-practice fix:** type each mutation payload to the generated `TablesInsert<'t'>` / `TablesUpdate<'t'>` (or schema-qualified equivalent) instead of `Record<string, unknown>`. Do **not** reach for `as never`. See [§2](#2-the-rejectexcessproperties-change-the-main-event).

---

## 1. Version deltas

### 1a. `@supabase/supabase-js` 2.99.2 → 2.108.2

`supabase-js` is a meta-package; the type tightening lives in its `postgrest-js` core. Notable releases in range (source: [CHANGELOG.md](https://github.com/supabase/supabase-js/blob/master/CHANGELOG.md)):

| Version | Date | Type | Highlights (PRs) |
|---|---|---|---|
| 2.99.2 (start) | 2026-03-16 | fix | storage: don't rewrite signed URL for empty transform ([#2162](https://github.com/supabase/supabase-js/pull/2162)) |
| 2.100.0 | 2026-03-23 | feat | realtime: use phoenix's js lib inside realtime-js ([#2119](https://github.com/supabase/supabase-js/pull/2119)) |
| 2.100.1 | 2026-03-26 | fix | **postgrest: type safety for `eq()`/`neq()` column names** ([#2175](https://github.com/supabase/supabase-js/pull/2175)); `maybeSingle` Accept-header fix ([#2182](https://github.com/supabase/supabase-js/pull/2182)) |
| 2.101.0 | 2026-03-30 | feat | realtime: `copyBindings`; block `postgres_changes` listener after join ([#2201](https://github.com/supabase/supabase-js/pull/2201)) |
| **2.102.0** | **2026-04-07** | **fix ⚠️** | **postgrest: reject excess properties in insert/update/upsert ([#2186](https://github.com/supabase/supabase-js/pull/2186)) — THE breaking type change.** Also: automatic retries for transient errors ([#2072](https://github.com/supabase/supabase-js/pull/2072)); `success` discriminator on PostgREST response types ([#2198](https://github.com/supabase/supabase-js/pull/2198)); export `PostgrestFilterBuilder`/`StorageApiError` ([#2222](https://github.com/supabase/supabase-js/pull/2222)) |
| 2.103.0 | 2026-04-09 | feat | **postgrest: `stripNulls()` method** ([#2189](https://github.com/supabase/supabase-js/pull/2189)); storage `cacheNonce` for download ([#2234](https://github.com/supabase/supabase-js/pull/2234)) |
| 2.103.1–2.103.3 | 2026-04-15/16 | fix | `toJSON` on Auth/Storage errors; bigint rpc; `createSignedUrls` null type |
| 2.104.0/2.104.1 | 2026-04-20/23 | feat/fix | storage header-normalization util; auth `PASSWORD_RECOVERY` for PKCE recovery ([#2272](https://github.com/supabase/supabase-js/pull/2272)) |
| 2.105.0 | 2026-04-27 | feat | **auth: passkey support (WebAuthn register/auth/manage)** ([#2283](https://github.com/supabase/supabase-js/pull/2283)); realtime deferred disconnect |
| 2.105.2 | 2026-05-04 | fix | **postgrest: unify insert/upsert signatures** ([#2315](https://github.com/supabase/supabase-js/pull/2315)); widen enum-like unions with `(string & {})` ([#2303](https://github.com/supabase/supabase-js/pull/2303)) |
| 2.105.4 | 2026-05-08 | fix | realtime: guard `sessionStorage` in restricted-storage browsers ([#2339](https://github.com/supabase/supabase-js/pull/2339)) |
| 2.106.0 | 2026-05-18 | feat | W3C/OpenTelemetry trace-context propagation ([#2163](https://github.com/supabase/supabase-js/pull/2163)); `StreamDownloadBuilder` implements Promise |
| 2.106.1/2.106.2 | 2026-05-20/25 | fix | auth: encode client-id in oauth requests; restore signup user response; **RN Hermes export condition** ([#2393](https://github.com/supabase/supabase-js/pull/2393)) |
| **2.107.0** | **2026-06-02** | **feat ⚠️** | **auth: remove `navigator.locks`-based mutex; introduce commit guard + `dispose()`** ([#2392](https://github.com/supabase/supabase-js/pull/2392)); realtime binary `httpSend`; **`X-Client-Info` → structured metadata** ([#2359](https://github.com/supabase/supabase-js/pull/2359)); `getClaims` returns `AuthInvalidJwtError` for expired JWT ([#2395](https://github.com/supabase/supabase-js/pull/2395)) |
| 2.108.0 | 2026-06-08 | feat | auth: `resend()` consistent confirmation flow ([#2144](https://github.com/supabase/supabase-js/pull/2144)); postgrest: request headers as plain object for RN/custom-fetch ([#2414](https://github.com/supabase/supabase-js/pull/2414)) |
| **2.108.2 (target)** | **2026-06-15** | **fix** | **auth: preserve valid session on refresh failure + cooldown repeat failures** ([#2436](https://github.com/supabase/supabase-js/pull/2436)); realtime `httpSend()` 404 clarification ([#2444](https://github.com/supabase/supabase-js/pull/2444)) |

> Other minor type tightenings to be aware of when bumping: `from()` table/view name type safety (2.96.0, [#2058](https://github.com/supabase/supabase-js/pull/2058)) and `eq()/neq()` column-name typing (2.100.1, [#2175](https://github.com/supabase/supabase-js/pull/2175)) — these can surface *additional* TS errors beyond the insert/update ones if any call site uses a stale column name.

### 1b. `@supabase/ssr` 0.9.0 → 0.12.0

Source: [ssr CHANGELOG.md](https://github.com/supabase/ssr/blob/main/CHANGELOG.md), [releases](https://github.com/supabase/ssr/releases), [PR #247](https://github.com/supabase/ssr/pull/247).

| Version | Date | Highlights |
|---|---|---|
| 0.9.0 (start) | — | `getAll`/`setAll` cookie API already the norm |
| 0.10.x | through 2026-05-07 | maintenance; cookie-handling hardening |
| 0.11.0 | 2026-06-05 | **`cookies: add clearAuthCookiesAtScopes` migration helper** ([#240](https://github.com/supabase/ssr/issues/240)) |
| **0.12.0 (target)** | **2026-06-09** | **`cookies.encode` option for minimal cookie sizes** ([#126](https://github.com/supabase/ssr/issues/126)); **`setAll` now receives cache headers (`Cache-Control`/`Expires`/`Pragma`) to prevent CDN caching of auth responses** ([#176](https://github.com/supabase/ssr/issues/176)); bump `cookie` dep to 1.0.2 ([#113](https://github.com/supabase/ssr/issues/113)); improved base64url chunk handling ([#90](https://github.com/supabase/ssr/issues/90)) |

> **Co-bump rule:** `@supabase/ssr` peer-depends on `@supabase/supabase-js`. The two must be bumped together — `ssr` re-exports the same auth/storage cookie machinery that `supabase-js`'s auth changes (notably the 2.107.0 lock removal) touch. Do not bump one without the other.

---

## 2. The `RejectExcessProperties` change (the main event)

### What & when
- **Introduced:** `supabase-js` **v2.102.0** (2026-04-07), via `postgrest-js` [PR #2186](https://github.com/supabase/supabase-js/pull/2186) — commit [9e51040](https://github.com/supabase/supabase-js/commit/9e5104091b93b716b6798db7605a4abd07b461a1). Fixes long-standing [issue #1636](https://github.com/supabase/supabase-js/issues/1636).
- **What it protects against:** Previously `.insert(values: Row)` used a bare generic parameter, which **bypasses TypeScript's excess-property check**. You could pass `{ completed: true, some_random_key: "foo" }`, get **no compile error**, and only blow up at runtime with a Postgres error. The new utility type catches that at compile time.

The utility ([from PR #2186](https://github.com/supabase/supabase-js/pull/2186)):

```typescript
// maps any key NOT in the table's Insert/Update type to `never`
export type RejectExcessProperties<Base, Row> = Row & {
  [K in Exclude<keyof Row, keyof Base>]: never
}
```

It's applied to the `values` parameter of every `insert` / `update` / `upsert` overload.

### Why our code errors
Our error — `Argument of type 'Record<string, unknown>' is not assignable to parameter of type 'RejectExcessProperties<...>'` — fires because `Record<string, unknown>` has an **open key set**: TypeScript can't prove its keys are a subset of the table's columns, so every "extra" key resolves to `never` and the assignment fails. The same applies to loosely-typed thunk payloads and `record as Record<string, unknown>` casts.

> Note: well-typed services (e.g. `features/ai-models/service.ts`, which already passes `AiModelInsert` / `AiModelUpdate`) do **not** error — they're the template to copy.

### The canonical fix — ranked

| Rank | Pattern | When to use | Verdict |
|---|---|---|---|
| **1 (best)** | Type the payload variable to the generated `TablesInsert<'t'>` / `TablesUpdate<'t'>` | Default for all call sites | ✅ Adopt |
| 2 | Inline `satisfies TablesUpdate<'t'>` on object literals | Object literals built at the call site | ✅ Adopt |
| 3 | Generic call form `.insert<TablesInsert<'t'>>(payload)` / `.update<TablesUpdate<'t'>>(payload)` | When the variable's type can't easily be changed | ✅ Acceptable (this is the exact workaround the maintainers suggest in [#1636](https://github.com/supabase/supabase-js/issues/1636)) |
| 4 | `Record<string, any>` (index signature) | — | ⚠️ Silently disables the check; avoid |
| 5 | `payload as never` / `as any` | true escape hatch only | ❌ Do not use — it kills all column type-safety |

**Schema-qualified note:** matrx uses custom schemas (`.schema("ai")`, `.schema("agent")`, etc.). The generated helpers are typed per-schema, so use the schema-aware generated type. With `types/database.types.ts`, the cleanest is the per-table `Tables*` helper if generated for that schema, otherwise index the `Database` type directly:

```typescript
type ModelInsert = Database["ai"]["Tables"]["model"]["Insert"];
type ModelUpdate = Database["ai"]["Tables"]["model"]["Update"];
```

### Code examples — mapped to our situation

**Before (errors on 2.102+):**

```typescript
// Redux thunk / service passing a loose record
async function persist(record: Record<string, unknown>) {
  const { error } = await supabase.from("working_document").insert(record);
  // ❌ Argument of type 'Record<string, unknown>' is not assignable
  //    to 'RejectExcessProperties<...>'
}
```

**After — Pattern 1 (preferred): type the payload**

```typescript
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

async function persist(record: TablesInsert<"working_document">) {
  const { error } = await supabase.from("working_document").insert(record); // ✅
}

async function patch(id: string, updates: TablesUpdate<"working_document">) {
  const { error } = await supabase
    .from("working_document")
    .update(updates)
    .eq("id", id); // ✅
}
```

**After — Pattern 2: `satisfies` on a literal**

```typescript
await supabase.from("notes").update({
  title,
  content,
  updated_at: new Date().toISOString(),
} satisfies TablesUpdate<"notes">) // ✅ excess key would now error here
  .eq("id", id);
```

**After — Pattern 3: generic call form (when the source type is fixed)**

```typescript
// schema-qualified table; payload comes from elsewhere as a wider type
await supabase
  .schema("ai")
  .from("model")
  .update<Database["ai"]["Tables"]["model"]["Update"]>(payload) // ✅
  .eq("id", id);
```

**Practical guidance for the ~34 errors:** triage each by where the payload originates.
- Payload built locally → change its declared type to `Tables(Insert|Update)<...>` (Pattern 1) or add `satisfies` (Pattern 2).
- Payload arrives from a Redux action with a deliberately wide shape → use Pattern 3 at the call site, *or* (better, longer-term) narrow the action payload type to the generated Insert/Update type so the whole pipeline is type-safe.
- **Never** blanket `as never`. If a key is genuinely needed but missing from the generated type, the real bug is stale generated types — regenerate (`pnpm db-types`).

---

## 3. Breaking changes across the range

### `supabase-js`

| Change | Version | PR | Impact on matrx | Action |
|---|---|---|---|---|
| **Excess-property rejection on insert/update/upsert** | 2.102.0 | [#2186](https://github.com/supabase/supabase-js/pull/2186) | Compile errors (the ~34) | Fix per §2 |
| `from()` table/view name type safety | 2.96.0 | [#2058](https://github.com/supabase/supabase-js/pull/2058) | Possible new TS errors on bad table names | Fix call sites if any |
| `eq()/neq()` column-name type safety | 2.100.1 | [#2175](https://github.com/supabase/supabase-js/pull/2175) | Possible new TS errors on stale column names | Fix call sites if any |
| Insert/upsert signatures unified | 2.105.2 | [#2315](https://github.com/supabase/supabase-js/pull/2315) | Subtle inference shifts on `.upsert()` | Re-typecheck upsert sites |
| **Auth: removed `navigator.locks` mutex; commit guard + `dispose()`** | 2.107.0 | [#2392](https://github.com/supabase/supabase-js/pull/2392) | Runtime auth behavior change (no API removal, but internal locking changed). New `dispose()` lifecycle. | **Manually test login/logout & multi-tab refresh** |
| `getClaims` returns `AuthInvalidJwtError` for expired JWT | 2.107.0 | [#2395](https://github.com/supabase/supabase-js/pull/2395) | If we adopt `getClaims`, expired tokens now surface a typed error rather than throwing differently | Handle in any `getClaims` usage |
| `X-Client-Info` → structured metadata format | 2.107.0 | [#2359](https://github.com/supabase/supabase-js/pull/2359) | Header format change; cosmetic unless something parses it | None |
| Node 20+ required (node-fetch removed) | 2.79.0 (pre-range, already in effect) | [#1830](https://github.com/supabase/supabase-js/pull/1830) | Confirm CI/Vercel runtime ≥ Node 20 | Verify Node version |

> **No removed public methods** in 2.99→2.108 that we use. The "breaking" surface is (a) the type tightening and (b) the internal auth-lock rework — both behavioral/compile, not API removals.

### `@supabase/ssr`

| Change | Version | Impact on matrx | Action |
|---|---|---|---|
| **`setAll` receives cache headers** (`Cache-Control`/`Expires`/`Pragma`) | 0.12.0 ([#176](https://github.com/supabase/ssr/issues/176)) | Our `setAll` implementation (in `proxy.ts` / server client) should **apply these headers to the response** to prevent CDNs caching auth responses and leaking sessions. The arg shape of `setAll` is extended. | **Review our `createServerClient` cookie adapter** — if `setAll` ignores the new headers arg, no compile break, but we should apply them in the proxy per [docs](https://supabase.com/docs/guides/auth/server-side/creating-a-client) |
| `cookies.encode` option | 0.12.0 ([#126](https://github.com/supabase/ssr/issues/126)) | Optional; enables smaller cookies | Optional adopt |
| `clearAuthCookiesAtScopes` helper | 0.11.0 ([#240](https://github.com/supabase/ssr/issues/240)) | New migration helper for clearing legacy/multi-scope cookies | Optional |
| `cookie` dep → 1.0.2 | 0.12.0 ([#113](https://github.com/supabase/ssr/issues/113)) | Transitive; verify lockfile resolves cleanly | Verify pnpm-lock |

> **getSession/getUser/getClaims semantics (unchanged but critical):** per the [ssr README](https://github.com/supabase/ssr/) and [Supabase docs](https://supabase.com/docs/guides/auth/server-side/creating-a-client): `getSession()` reads cookies with **no verification** — never use for authorization. `getClaims()` verifies the access token locally via WebCrypto + cached JWKS (asymmetric keys, default for new projects) or via the Auth server (symmetric keys). `getUser()` hits the Auth server every call for a fresh record. The upgrade does **not** change these contracts — but audit that we aren't gating anything on raw `getSession()`.

---

## 4. New features to ADOPT

| Feature | Version | What | Recommend for matrx? | Where |
|---|---|---|---|---|
| **`stripNulls()`** | 2.103.0 ([#2189](https://github.com/supabase/supabase-js/pull/2189)) | Strips null values from query results | ✅ Adopt opportunistically | Services returning rows with many nullable cols (notes, research, working-document) |
| **`getClaims()` + asymmetric JWT verification** | matured 2.107.0 ([#2395](https://github.com/supabase/supabase-js/pull/2395)) | Local, network-free token verification via JWKS | ✅ Strongly consider | Replace `getUser()` in **read-only auth gates** (proxy/route guards) where a fresh DB user record isn't needed — faster, no Auth-server round trip. Keep `getUser()` where current role/email freshness matters |
| **`success` discriminator on PostgREST responses** | 2.102.0 ([#2198](https://github.com/supabase/supabase-js/pull/2198)) | `success: true/false` field for cleaner narrowing | ✅ Adopt in new error handling | New/refactored service error branches |
| **Automatic retries for transient errors** | 2.102.0 ([#2072](https://github.com/supabase/supabase-js/pull/2072)) | postgrest retries transient failures | ✅ Free (default on) | No code change; improves reliability of all DB calls |
| **Passkeys / WebAuthn** | 2.105.0 ([#2283](https://github.com/supabase/supabase-js/pull/2283)) | Register/authenticate/manage passkeys | ⚪ Optional / future | Auth settings UI if we want passwordless |
| **W3C/OTel trace-context propagation** | 2.106.0 ([#2163](https://github.com/supabase/supabase-js/pull/2163)) | Distributed tracing across FE→PostgREST | ⚪ Optional | If/when we add OTel tracing |
| `cookies.encode` (minimal cookie size) | ssr 0.12.0 ([#126](https://github.com/supabase/ssr/issues/126)) | Smaller auth cookies | ⚪ Optional | Server client config if cookie size is a concern |
| `clearAuthCookiesAtScopes` | ssr 0.11.0 ([#240](https://github.com/supabase/ssr/issues/240)) | Helper to clear cookies across scopes | ⚪ Optional | Logout / session-reset flows |

---

## 5. Migration steps (ordered)

1. **Pre-flight:** confirm Node runtime ≥ 20 (Vercel + local) — `supabase-js` dropped node-fetch in 2.79.0 ([#1830](https://github.com/supabase/supabase-js/pull/1830)).
2. **Co-bump both packages together** (peer-dep alignment is mandatory):
   ```bash
   pnpm add @supabase/supabase-js@2.108.2 @supabase/ssr@0.12.0
   ```
3. **Regenerate DB types** (the generated Insert/Update types are the foundation of the fix):
   ```bash
   pnpm db-types        # → types/database.types.ts
   # or the fuller: pnpm sync-types  (DB + Python API types + type-check)
   ```
4. **Typecheck** to surface the full error set:
   ```bash
   pnpm tsc --noEmit    # (or the repo's type-check script)
   ```
5. **Fix the ~34 `RejectExcessProperties` errors** using §2 Pattern 1/2/3 (prefer typing payloads to `TablesInsert`/`TablesUpdate`). Triage by payload origin. **No `as never`.**
6. **Fix any incidental `from()`/`eq()`/`neq()` type errors** that surface from 2.96.0/2.100.1 tightening (stale table/column names) — these point at real drift, fix them.
7. **Audit `@supabase/ssr` cookie adapter** (`createServerClient` `setAll`): apply the new cache headers in the proxy per [docs](https://supabase.com/docs/guides/auth/server-side/creating-a-client). Confirm `getSession()` is **not** used for any authorization decision.
8. **Audit auth lifecycle** for the 2.107.0 lock-mechanism change — nothing to change in code, but verify no reliance on the old `navigator.locks` timing.
9. **Run schema/doctrine guards:** `pnpm check:schema`, `pnpm check:migrations` (no DB changes here, but confirm no drift), lint.
10. **Manual QA** (see §6) before merge.
11. **Commit** with both `package.json` + `pnpm-lock.yaml` + regenerated `database.types.ts` + call-site fixes together.

---

## 6. Risk callouts — manual test matrix

The riskiest surface is **auth/session/cookie handling** (supabase-js 2.107.0 lock rework + 2.108.2 refresh-failure handling + ssr 0.12.0 cache headers). Test **before and after** the bump:

| Area | Test | Why |
|---|---|---|
| **Login** | Form login `admin@admin.com` / `Password1234#` at `/login`; dev auto-login route | 2.107.0 removed `navigator.locks` mutex; 2.108.2 changed refresh-failure handling |
| **Logout** | Sign out, confirm cookies cleared, no stale session | Lock rework + cookie changes |
| **Multi-tab / token refresh** | Open 2 tabs, let token approach expiry, confirm seamless refresh, no deadlock/duplicate refresh | The lock change directly affects concurrent refresh |
| **Session persistence on refresh failure** | Simulate a failed refresh (offline blip), confirm valid session is preserved, not nuked | [#2436](https://github.com/supabase/supabase-js/pull/2436) |
| **RLS reads** | Authenticated reads on RLS-protected tables return only permitted rows | Confirm auth token still flows correctly post-bump |
| **RLS writes** | `.insert()`/`.update()`/`.upsert()` on RLS tables succeed for owner, fail for non-owner | Verify the type fixes didn't drop required columns |
| **Custom-schema mutations** | A `.schema("ai"/"agent").from(...).insert/update(...)` round-trip | Most of the type fixes live here |
| **SSR auth in proxy** | Protected route guard via `getClaims`/`getUser`; CDN does not cache an authed response | ssr 0.12.0 cache-header change ([#176](https://github.com/supabase/ssr/issues/176)) |
| **Realtime** | Subscribe to a channel, confirm postgres_changes/broadcast still flow | 2.100.0 phoenix-lib swap + serializer changes |

---

## Sources
- supabase-js CHANGELOG: https://github.com/supabase/supabase-js/blob/master/CHANGELOG.md
- v2.102.0 release: https://github.com/supabase/supabase-js/releases/tag/v2.102.0
- v2.108.0 release: https://github.com/supabase/supabase-js/releases/tag/v2.108.0
- v2.108.2 release: https://github.com/supabase/supabase-js/releases/tag/v2.108.2
- PR #2186 (RejectExcessProperties): https://github.com/supabase/supabase-js/pull/2186
- Commit 9e51040: https://github.com/supabase/supabase-js/commit/9e5104091b93b716b6798db7605a4abd07b461a1
- Issue #1636 (root cause + workaround): https://github.com/supabase/supabase-js/issues/1636
- PR #2392 (auth lock removal): https://github.com/supabase/supabase-js/pull/2392
- ssr CHANGELOG: https://github.com/supabase/ssr/blob/main/CHANGELOG.md
- ssr 0.12.0 (PR #247): https://github.com/supabase/ssr/pull/247
- ssr README (getSession/getUser/getClaims): https://github.com/supabase/ssr/
- Creating a Supabase client for SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client
