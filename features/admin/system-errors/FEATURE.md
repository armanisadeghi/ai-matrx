# FEATURE.md — `admin/system-errors`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-13`

---

## Purpose

The super-admin's two views onto the durable `public.system_error` ledger: the
**page** you open when you already suspect a problem, and the **notice** that
finds you when a provider is down and you do not yet suspect anything.

---

## Entry points

**Routes**

- `app/(admin)/administration/utilities/system-errors/page.tsx` — hosts
  `SystemErrorsPanel`. Deep-linkable: `?kind=…&hours=…` seeds the filters, so an
  alarm can point at its own evidence.

**Components**

- `SystemErrorsPanel.tsx` — the ledger reader: filter by `kind`, by window, by
  unresolved; expand a row for its traceback; Copy for AI.
- `PlatformOutageBanner.tsx` — the global outage notice. Mounted ONCE, in
  `app/DeferredSingletonCore.tsx` (the singleton body under `Providers`, which
  `AppShell` renders for both `(core)` and `(admin)` — the one shell slot both
  route groups share).

**Modules**

- `open-outages.ts` — the read (`GET /admin/system-errors/open-outages`) plus the
  pure sentence builder (`describeOutage`, `buildOutageNotice`).
- `outage-mute.ts` — per-outage, one-hour, `localStorage` mute.

**API endpoints**

- `GET /admin/system-errors/recent` — the ledger page's read (in the generated
  contract; called through `apiGet`).
- `GET /admin/system-errors/open-outages` — one row per provider per open
  outage; empty array means every provider is healthy. The SERVER opens the row
  and closes it when calls succeed again, so the client never dedupes and never
  decides whether something is still down.

**Redux slice(s)**

None. Gating reads `selectIsSuperAdmin` / `selectAuthReady` / `selectAccessToken`
from `lib/redux/selectors/userSelectors`.

---

## Admin map

Not applicable. `features/admin/FEATURE.md` governs `/administration` **routes and
destinations** (`admin-navigation.ts`, audited by `scripts/check-admin-catalog.ts`
against discovered page patterns), and the per-feature `/[feature]/admin` map
covers a feature's own routes and panels. `PlatformOutageBanner` is neither: it is
a shell-level singleton with no route. Its route half — the system-errors page it
links to — is already declared in the admin navigation registry.

---

## Invariants

- **A notice never modifies the page underneath it** (Arman, 2026-09-12). The
  outage notice FLOATS: fixed, movable (`useDraggableFloat`), mutable. It
  publishes no height, measures nothing, and reserves no layout — a full-width
  bar wedged into `AppShell` between the header and the page body is the exact
  shape that was ruled out after the schedule alarm shipped it. Guard:
  `styles/__tests__/no-overlay-layout-reservation.test.ts`; the deleted
  reservation is documented in `styles/shell.css` § NO GLOBAL BANNER CLEARANCE.
- **Super-admin only, gated BEFORE the read.** Everyone else renders null and
  issues no request, so an admin endpoint is never polled by a normal user.
- **Nothing to report renders NOTHING.** Never an "all providers healthy" strip
  — wallpaper is how the next outage gets missed.
- **A failed poll is not an outage.** It renders nothing loud; the failure is
  already captured once into the Error Inspector by `lib/python-client`'s
  `capturePythonClientError`. No toast, ever, on a 60-second timer.
- **The mute is per outage id and timed.** A NEW outage is never muted by an old
  mute, and every mute expires (`MUTE_MS`, one hour). Every storage read and
  write is wrapped; the fallback is always "show it".
- **`OUTAGE_POLL_MS = 60_000`** is the one named constant for the cadence.

---

## Known gaps

- `open-outages.ts` reads through `getJson` with a locally declared response
  interface because the path is not yet in
  `types/python-generated/api-types.ts` (the aidream half landed after this
  file, and a generated file is never hand-edited). **Move it to
  `apiGet("/admin/system-errors/open-outages")` as soon as `pnpm sync-types`
  carries the path** — until then this is a hand-mirrored contract, the exact
  class `lib/api/typed-client.ts` exists to kill.
- The notice has not been seen against a live outage: it was built while the
  endpoint was still being written.

---

## Change Log

- **2026-09-13** — Added `PlatformOutageBanner`, `open-outages.ts`,
  `outage-mute.ts` and their test, and mounted the banner in
  `app/DeferredSingletonCore.tsx`. Built for the 2026-09-12 incident in which
  Anthropic refused every call from 20:31Z to 23:21Z and no screen in the
  product said so. Created this FEATURE.md (the folder had none).
