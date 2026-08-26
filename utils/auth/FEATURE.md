# Auth Destination — where the user lands after signing in

**Status:** live · **Owner primitive:** [`utils/auth/auth-destination.ts`](./auth-destination.ts)

A user who asks for a page and has to authenticate first **always** ends up on
that page. Not the dashboard. No matter how long the detour — wrong password,
a password reset by email, an OAuth round-trip, wandering across every auth
page — the destination survives.

## The law

1. **Capture once.** The bounce that sends a signed-out user to `/login` turns
   the page they asked for (path, query, **and client-visible fragment**) into
   the destination.
2. **Never mint a second.** `withAuthDestination()` is a **no-op when the target
   already carries one**. Every later hop can only pass it along.
3. **Never lose it on an error path.** Every redirect that re-renders an auth
   page carries it — wrong password, mismatched confirm, expired link.
4. **An auth page is never a destination.** `/login`, `/reset-password`,
   `/auth/*`, `/` are refused, so a stale param cannot loop or dead-end.

## The API — read/forward through this, never hand-roll a param

| Function | Use it for |
|---|---|
| `captureAuthDestination(pathname, search, hash?)` | THE capture point — a bounce or a client "Sign in" link |
| `readAuthDestination(source)` | Read from `URLSearchParams` / `FormData` / Next `searchParams` / a URL string. `null` when absent |
| `authDestinationOr(source, fallback?)` | Read at the END of a flow, where someone must be sent somewhere (`/dashboard`) |
| `withAuthDestination(target, dest)` | Attach — **never overwrites an existing one** |
| `preserveAuthDestination(target, source, extra?)` | The workhorse: carry forward + add `error`/`success` |
| `loginHref(dest)` / `signUpHref(dest)` | Build a sign-in / sign-up link |
| `useLoginHref()` ([hook](../../hooks/auth/useLoginHref.ts)) | Client components — captures the current route automatically |
| `serverLoginHref()` ([helper](./server-login-href.ts)) | Server layouts/actions — rebuilds the request from the canonical proxy headers |
| `withAuthFlowParams(target, params)` | Adds an auth result query without moving it behind an existing fragment |

**`encodedRedirect(type, path, message, destinationSource)`** ([`utils/utils.ts`](../utils.ts))
— **always pass the 4th argument** on an auth surface. Omitting it is how the
destination was being destroyed.

## Param names — write one, read four

Canonical written param: **`redirectTo`**. Also READ: `next`, `returnUrl`,
`return_to` — three spellings had grown in the codebase and only `redirectTo`
was ever read, so 25 links shipped dead. New code writes `redirectTo` (the
helpers do this for you); the aliases stay readable so old links keep working.

## The onboarding funnel never overrides a destination

**`/welcome` is the DEFAULT landing for a new user with no page in mind — not an
override.** A new user is the *most* important person to deliver to what they
asked for: they came to make meta titles or try agent creation, and that intent
is what earned the signup.

| Arriving with | Lands on |
|---|---|
| no destination, or the generic hub (`/dashboard`) | `/welcome` |
| any specific destination (`/agents/all`, `/tasks`, …) | that page |

The funnel therefore lives in **exactly one route** —
[`app/(core)/dashboard/layout.tsx`](../../app/(core)/dashboard/layout.tsx) —
because "send me to the hub" is what "no particular intent" looks like. **Never
add a second call site.** The root layout, the middleware and the auth actions
all see users who DO have a destination, and would silently eat it. The
destination system knows nothing about onboarding.

Guarded by
[`__tests__/onboarding-funnel-scope.test.ts`](./__tests__/onboarding-funnel-scope.test.ts),
which fails the moment `isNewUser` / `WELCOME_ROUTE` appears outside that route.
**Search every tracked source file via `git grep`.** Never hand-list directories;
`actions/`, root files, hooks, providers, and future top-level paths must stay covered.

## Marketing surfaces never trap a signed-in user

Every module landing (`features/auth/components/module-landing/landings/`)
gates the marketing pitch behind a guest check — either redirecting authed
visitors to the real surface (`/agents` → `/agents/all`, `/files` → `/files/all`,
`/voice` → `/voice/playground`, `/war-room` → `/war-room/all`) or rendering the
workspace in place (`/notes`, `/tasks`, `/rag`, …). **A new landing page must do
one of those two things**, or a user whose destination is that route lands on a
sales page after signing in.

## Invariants

- **`safeRelativePath` ([safe-redirect.ts](./safe-redirect.ts)) owns the
  open-redirect rules** — protocol-relative, backslash, userinfo, percent-encoded
  variants. `normalizeAuthDestination` delegates to it. Never re-implement them.
- **Source detection is duck-typed** (`typeof source.get === "function"`), not
  `instanceof`. A server action's `FormData` can come from a different realm; a
  failed `instanceof` would silently drop the destination with no error.
- **The recovery hop is the one place `/reset-password` is a legal target** —
  `/auth/callback` and `/auth/confirm` apply it as the next HOP, with the user's
  real destination nested inside it as its own param.
- **Social OAuth returns to the origin where it started.**
  [`request-origin.ts`](./request-origin.ts) derives `/auth/callback` from the
  request, including the localhost port; every local origin must also exist in
  Supabase Auth's Redirect URLs allowlist.
- **The middleware destination check runs BEFORE the authed login/sign-up
  bounce.** That bounce sends every authenticated visitor to `landing`; ordered
  the other way it eats the destination.
- **Logout is not a destination flow.** Sign-out goes to a bare `/login`.
- **A remembered account is display data, never authority.**
  [`remembered-account.ts`](./remembered-account.ts) stores only a display name,
  optional avatar URL, and timestamp. Tokens, ids, email addresses, roles, and
  the identity-scoped Redux profile cache never cross into this guest-readable
  record.
- **Protected product routes stop before product data loads.**
  [`protected-routes.ts`](./protected-routes.ts) is the shared proxy policy.
  A guest must see the sign-in experience, never a database, mandate, or
  permissions error from inside the product.
- **Session loss clears client authority before cleanup.**
  [`AuthSessionWatcher.tsx`](../../components/layout/AuthSessionWatcher.tsx)
  dispatches `clearUserAuth()` on `SIGNED_OUT` or a booted tab's empty
  `INITIAL_SESSION`; identity-scoped islands must unmount before they can call
  PostgREST as `anon`. Idempotent operations using
  [`runWithSessionRetry`](../../lib/supabase/authRetry.ts) also preflight the
  browser session at the database boundary, closing the event-to-effect race.
- **External app redirects are registered capabilities, not user input.**
  [`trusted-app-redirect.ts`](./trusted-app-redirect.ts) requires an exact
  first-party origin and the exact `/oauth/callback` path before any access or
  refresh token may leave this app. Validate both before OAuth starts and in
  the callback.
- **`x-pathname` + `x-search-params`** are set in
  [`utils/supabase/middleware.ts`](../supabase/middleware.ts) so server layouts
  can rebuild the destination. Both must be set — `app/(admin)/layout.tsx` read
  `x-search-params` for months while nothing set it.

## Tests

[`__tests__/auth-destination.test.ts`](./__tests__/auth-destination.test.ts) —
the rules. [`__tests__/auth-flow.e2e.test.ts`](./__tests__/auth-flow.e2e.test.ts)
— full journeys hop by hop (wrong-then-right password, the reset odyssey, OAuth,
50-hop walks, open-redirect refusal). `request-origin.test.ts` locks OAuth to
the initiating localhost port or deployment origin. `auth-entrypoints.test.ts`
scans every tracked and untracked source file and rejects raw internal login
links and the nonexistent `/signup` route. `pnpm check:auth-destinations` runs
the complete auth suite and is part of both release-gate modes.

## Change Log

- **2026-08-26** — Session-retry operations now stop before PostgREST when the
  browser session is already absent, so the auth-event/React-effect race cannot
  emit a guaranteed anonymous 401.

- **2026-08-25** — Session loss now clears Redux auth authority before global
  product islands can fan one expiry into unrelated anonymous database calls.

- **2026-08-24** — Social OAuth callbacks now preserve the initiating request
  origin, including localhost ports 3000/3001/3002; added origin-validation and
  proxy-authority regressions.

- **2026-08-20** — Closed the signed-out product-error and lost-return-route
  classes platform-wide: protected routes stop before data resolution; header,
  dialogs, conversion prompts, module gates, module signup CTAs, and server
  redirects all use canonical destination capture; client fragments survive;
  cold signed-out visitors get a remembered-account-safe sign-in heading;
  callback and recovery error paths preserve their destination; external app
  token callbacks require an exact allowlist. Added source, route-policy,
  remembered-account, fragment, and malicious-redirect regressions to the
  release gates.

- **2026-08-12** — Expanded the funnel guard to every tracked source file via
  `git grep`, including root files, `actions/`, hooks, and providers.

- **2026-08-12** — Verified and documented the onboarding-funnel boundary: a new
  user with a real destination reaches it (the funnel fires only on `/dashboard`),
  and every module landing already bounces or in-place-renders for authed users.
  Added `onboarding-funnel-scope.test.ts` so a second funnel call site fails CI.
- **2026-08-12** — Created. Consolidated four independent destination-losing
  mechanisms onto one primitive: `encodedRedirect` rebuilding URLs without the
  destination, `next`/`returnUrl` being written but never read, `/reset-password`
  never handing the destination to its action (and `forgotPasswordAction`
  hardcoding a bare `/reset-password` into the emailed link), and bare `/login`
  links that captured nothing. Added the `x-search-params` header the admin
  layout had always read but nothing set.
