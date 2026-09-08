# lib/deployment — which origin can serve this path

One repo, three Vercel builds (`next.config.js` § `MATRX_PROFILE`, `proxy.ts`
§ "Deployment split"): `www` serves the app without `(admin)`, `manage` serves
only `(admin)`, `demos` serves only `(dev)`. `proxy.ts` covers the gap by
redirecting a foreign path to the origin that owns it.

**The split runs BOTH ways.** `www` lacks `(admin)`; `manage` lacks the main app,
and `proxy.ts`'s satellite gate bounces everything outside `/administration/*`
(plus the shared auth paths) home. A satellite build is therefore not "a build
missing two prefixes" — it serves ONE prefix and sends everything else to www.

**That redirect is correct for a document navigation and fatal for a Next
`<Link>`.** A `<Link href="/administration/…">` prefetches on hover with an RSC
`fetch()` carrying `RSC` / `Next-Router-Prefetch` headers — a preflighted
cross-origin request the moment the proxy redirects it, and a preflight may
never be redirected. Production, 2026-09-08, reproduced by hovering the sidebar:

> Access to fetch at `https://manage.aimatrx.com/administration/launchpad`
> (redirected from `https://www.aimatrx.com/administration/launchpad?_rsc=…`)
> … blocked by CORS policy: Redirect is not allowed for a preflight request.

The mirror image, found by WALKING `manage` after the first fix shipped and the
reason this section exists at all:

> Access to fetch at `https://www.aimatrx.com/settings` (redirected from
> `https://manage.aimatrx.com/settings?_rsc=…`) from origin
> `https://manage.aimatrx.com` … Redirect is not allowed for a preflight request.

## The door

- **`surfaces.ts`** — the ONE table of the split (`DEPLOYMENT_SURFACES`), read
  by `proxy.ts` and by the client, so the redirect and the link can never
  disagree about which origin owns a path. `crossDeploymentHref(href)` returns
  the sibling's absolute URL, or null when this build serves the path itself.
- **`components/navigation/AppLink.tsx`** — use instead of `next/link` for any
  href that can point at a split surface. A foreign path becomes a plain `<a>`
  with an absolute URL: a document navigation, no prefetch, no preflight. On the
  build that owns the path it is `next/link`, unchanged.
- **`navigate.ts`** — `pushAppHref` / `replaceAppHref`, the same rule for
  `router.push` / `router.replace`.

A plain lowercase `<a href="/administration">` was never broken and needs no
change: the browser navigates the document and the proxy redirect is honoured.
It is the Next ROUTER that must never be handed a foreign path.

## Loaded-document evidence

`browser-provenance.ts` owns the existing loaded-script deployment-ID and Next build-ID readers, shared by overlay diagnostics and the canonical error capture store. Every captured occurrence snapshots deployment IDs, a random page-session ID, page start/age, origin, online state, and visibility. `persistCapturedErrors` sends that snapshot in `context.browserProvenance` for authenticated and guest captures. It never fetches the latest deployment to label an older document, and stores no authentication tokens or storage contents. Missing evidence is null; no stale-build conclusion follows from a failure signature alone.

## The guard

`pnpm check:cross-deployment-links` (`:strict` in the release gates,
`:self-test` proves the detector still catches the original defect). It flags a
`<Link>`, any capitalised wrapper, or a `router.push`/`replace` carrying a
literal split-surface path outside the route group that owns it. Wrappers that
own their own anchor and route it through `AppLink` are listed in the script's
`DOOR_ELEMENTS`; adding a name there that does NOT go through the door re-opens
the class.

In the SATELLITE TREES (`app/(admin)/`, `app/(dev)/`, `features/shell/`,
`components/layout/`, `features/admin/`, `features/administration/`) the rule is
the blunt one — `next/link` may not be imported at all, because any internal
href there can be foreign and no prefix list can tell which. The one honest
exemption: a tree that renders ONLY on the deployment owning a surface may name
that surface freely (`app/(admin)` → `/administration`), because those links are
same-origin by construction. `features/shell/` and `components/layout/` get no
such exemption — they render on both hosts.

It also knows the split-surface CONSTANTS (`export const X = "/administration…"`),
because the first census missed `AdminSidebarSection`'s
`href={ADMIN_LAUNCHPAD_PATH}` — the Admin Launchpad button whose hover produced
the console error. A literal-only guard would have called the class closed while
the reproduction still fired.

**RED 78 offences (exit 2) at `71986f3eab`** → GREEN, **plus the 79th the
constant-aware pass found**, and then **RED 87 (exit 2) at the deployed
`d299920279`** once the guard learned the satellite direction → **GREEN 0 (exit
0)**. `lib/deployment`: 20 tests, of which the 5 satellite-direction legs were
**RED 4 failed / 13 passed** at that same deployed SHA.
`/demos` was breaking identically on www and is fixed by the same table.

**Verified:** 2026-09-08.

## Change Log

- 2026-09-08 — Shared loaded-document provenance now accompanies canonical error persistence, retaining occurrence-time identity across the debounce.
