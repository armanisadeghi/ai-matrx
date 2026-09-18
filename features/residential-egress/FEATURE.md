# Residential egress — the web app's half

**Status:** built, partly live · **Cross-repo system of record:**
[`common-docs/systems/platform/residential-egress/FEATURE.md`](../../../common-docs/systems/platform/residential-egress/FEATURE.md)
— that document is the ONE contract; this file only says what THIS repo does and
where its pieces are. Never restate the wire protocol, the table, the knobs or
the helper here.

A person can lend AI Matrx one of their own computers as the way out to the
internet, **used only when a site blocks our data centre**. This feature is the
browser half: the list, the switch, the pairing approval, and the two places a
run says which way it went out.

## The words a person reads

The contract fixes them (§ Names): **"Home connection"**, and the switch reads
"Use this computer's internet connection when AI Matrx gets blocked". **Never
"proxy", "egress", "residential" or "IP"** in copy. `residential_egress` is the
internal identifier only — in code, in knob keys, in table names, nowhere else.

## The pieces

| File | What it is |
|---|---|
| [`types.ts`](./types.ts) | Every shape, hand-typed from the contract, plus `homeConnectionStatus()` — the DERIVED badge (Connected / Offline / Paused / Not set up). Holds the two 🚨 TODO blocks below. |
| [`service.ts`](./service.ts) | Direct Supabase reads/writes for `platform.egress_device`, and the four Python `/egress/*` calls. |
| [`hooks/useHomeConnections.ts`](./hooks/useHomeConnections.ts) | The live list: `postgres_changes` on `platform.egress_device` + the announced one-minute polling fallback. |
| [`hooks/useHomeConnectionFocus.ts`](./hooks/useHomeConnectionFocus.ts) | `?computer=<id>` on the devices list: scrolls that computer into view and rings it once. |
| [`components/HomeConnectionRow.tsx`](./components/HomeConnectionRow.tsx) | One computer's row: badge, switch, last used, pages, bytes, rename, Remove. |
| [`components/ConnectComputerPage.tsx`](./components/ConnectComputerPage.tsx) | `/connect-computer` — approval card with `?code=`, downloads without. |
| [`app/(core)/connect-computer/page.tsx`](<../../app/(core)/connect-computer/page.tsx>) | The route. Signed-in; a signed-out visitor comes back **with the code intact**. |

Hosts outside this folder:
[`features/files/devices/DevicesSyncTab.tsx`](../files/devices/DevicesSyncTab.tsx)
(the Settings → Devices & sync list and the **Other computers** section) ·
[`features/files/devices/components/DeviceCard.tsx`](../files/devices/components/DeviceCard.tsx)
(the row under each device) ·
[`features/cloud-browser/components/TelemetrySurface.tsx`](../cloud-browser/components/TelemetrySurface.tsx)
("Browsing through <name>" and the "Set up a home connection" door).

## The decisions this half makes

- **THE BADGE IS DERIVED, NEVER STORED.** `enabled` is the person's intent;
  `connected` is the gateway's observation. Paused beats Offline — a computer
  someone switched off is not "offline", it is off because they said so.
- **The browser writes exactly two columns** (`enabled`, `display_name`) and
  the gateway writes the rest, so a pause can never be erased by the next
  heartbeat. The hand-typed `EgressDatabase` in `types.ts` encodes that: a third
  column in an `.update()` is a type error.
- **Removing goes through Python**, not a soft-delete from the browser: only the
  server can revoke the token and close the live socket.
- **A status we could not read says so.** `HomeConnectionRow` renders the read
  error in place rather than showing "Not set up", because those are different
  facts and only one of them is true.
- 🚨 **A BLANK `helper_download_base_url` MEANS "NOT PUBLISHED YET", AND THAT IS
  THE LIVENESS CHECK.** The standalone installers live on a release tag whose
  packaging workflow has never run, so the buttons were three 404s aimed at a
  non-technical person. There is no browser-side reachability test worth
  trusting (a cross-origin `HEAD` to the release host comes back opaque), and
  the server half is not the place for a "does this tag exist" route, so the
  KNOB is the switch: blank → the page says
  *"The standalone helper for computers without the AI Matrx desktop app is not
  published yet."* and points at the desktop app; a web address → the three
  buttons, with no release of this repo in between. Missing row, blank string
  and not-a-URL are all the same answer. Guard:
  [`components/__tests__/download-availability.test.ts`](./components/__tests__/download-availability.test.ts).
  "No organization active yet" is a WAIT, not an answer — reporting it as
  missing was a confident wrong sentence on every first paint.
- **No internal identifier ever reaches the screen.** The banned set is wider
  than the contract's four words: a setting key, a table, a route or an RPC
  name in user copy is the same defect. The refusal sentence used to print
  `residential_egress.helper_download_base_url` verbatim at a person who has
  never seen a settings register; the resolver now returns a BOOLEAN and the
  sentence lives in one constant the test asserts against.
- **`?computer=<id>` lands on the row, not on the list.** The helper's tray has
  an item meaning "take me to this computer"; the devices page now scrolls that
  card into view and rings it for 2.6 s. It waits until BOTH reads on that page
  have finished (the home connections answer first, and scrolling into a
  half-built page put the ring off-screen the moment the device cards loaded
  above it), scrolls instantly rather than smoothly (a deep link is a
  destination, not a tour — and a background tab defers a smooth scroll for
  seconds), and runs once per id so a realtime heartbeat cannot yank the page
  back. A computer the list does not have says so in a line rather than leaving
  the person hunting.
- **The cloud-browser renders are guarded on presence**, so a run started before
  the server half deploys looks exactly as it does today.

## Both landing TODOs are closed

`platform.egress_device` is in `types/database.types.ts` and the `/egress/*`
routes are in `types/python-generated/api-types.ts`. `service.ts` now reads
`platform.egress_device` through the generated `Database` type
(`egressDb()`, same pattern as `features/files/filesDb.ts`) and calls every
`/egress/*` endpoint through `lib/api/typed-client.ts` (`apiGet`/`apiPost`/
`apiDelete` + `buildPath`), so the path and request body are contract-checked.
The four Python calls' 200 responses are still asserted against the
hand-typed shapes in `./types.ts` — the contract generates each of those
responses as an untyped `{ [key: string]: unknown }` dict (a plain-dict
return, not a Pydantic response model), so there is no real response shape to
derive from yet.

## Verified (2026-09-18, `http://<session>.localhost:3001`, admin@admin.com)

- Devices & sync shows a Home connection row under every device card; a seeded
  row appeared **live, with no reload**, proving the realtime binding.
- The switch wrote `enabled` under RLS and the badge moved Paused → Offline.
- Remove named its consequence in `<ConfirmDialog>`; confirming against the
  not-yet-deployed route said so and left the computer connected.
- `/connect-computer` rendered the three downloads from the live knob, and
  `?code=ABCD-1234` rendered the unknown-code card with its remedy. Mobile
  (375×812) stacks with no horizontal scroll.
- **2026-09-18, second pass** — with the live knob blanked to `""`, the page
  rendered the not-published sentence and the desktop-app path and **no
  buttons**; `/user-settings/files/devices?computer=<id>` scrolled a real
  `platform.egress_device` row (a disposable one owned by the admin test user,
  deleted afterwards) into view with the ring; `?computer=x` showed the
  "not on this list" line and no error.
- Not yet exercisable here: an APPROVED pairing and a real residential run —
  both need the aidream `/egress/*` routes deployed.

## 🚨 The tray's link does not reach this page — and it is matrx-local's to change

The contract has the helper's tray open `/settings?tab=devices&computer=<id>`.
That URL hits `app/(transitional)/settings/page.tsx`, which redirects to
`/settings/profile` and **drops the whole query string on the way** — so
neither the tab nor the computer id ever arrives (walked live, 2026-09-18: it
lands on Profile, no error, nothing to see). `tab=devices` is ambiguous on top
of that: the settings registry's `devices` id is the camera-and-microphone tab;
this list is `files.devices`.

The durable URL is **`/user-settings/files/devices?computer=<id>`**
(`HOME_CONNECTIONS_HREF` + `HOME_CONNECTION_FOCUS_PARAM` in
[`types.ts`](./types.ts)). Every link this repo owns now points there. The
helper's tray item and the contract's § "Tray menu" still say the old one, and
changing the shipped Rust binary is `matrx-local`'s call, not this lane's.

## Change log

- 2026-09-18 — Created. Frontend half of the residential-egress contract v1.
- 2026-09-18 — Review fixes (Claude Opus 5): the downloads are gated on a
  NON-BLANK knob (blank = not published yet, with the plain sentence and the
  desktop path, never a button); the refusal copy no longer prints the setting
  key or any other internal identifier; `?computer=<id>` on the devices list
  scrolls and rings that computer (`hooks/useHomeConnectionFocus.ts`); every
  link this repo owns moved to the durable `/user-settings/files/devices`,
  because `/settings?tab=devices` drops its query and never arrives.
- 2026-09-18 — Switched `service.ts` off hand-typed `EgressDatabase`/raw
  `lib/python-client.ts` calls onto the generated `Database` type and
  `lib/api/typed-client.ts`, now that `platform.egress_device` and `/egress/*`
  are both in the generated contract; `type-check` clean for this feature.
