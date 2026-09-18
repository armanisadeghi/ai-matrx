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
- **`/connect-computer` never renders a download it cannot resolve.** The base
  URL comes from the knob `residential_egress.helper_download_base_url` through
  `useScopedKnobs`; a missing or malformed row prints the reason and the remedy.
  "No organization active yet" is a WAIT, not a missing setting — reporting it
  as missing was a confident wrong sentence on every first paint.
- **The cloud-browser renders are guarded on presence**, so a run started before
  the server half deploys looks exactly as it does today.

## 🚨 Two TODOs the owner closes after this lands

1. **`pnpm db-types`** — `platform.egress_device` landed live mid-build (the
   aidream migration applied 2026-09-18, and the table is already in the
   `supabase_realtime` publication, so the live channel works today). It is not
   yet in `types/database.types.ts`. After regenerating, delete `EgressDatabase`
   and the `egressDb()` helper in `service.ts`; nothing else changes.
2. **`pnpm sync-types` + typed-client** — the `/egress/*` routes are not in
   `types/python-generated/api-types.ts` yet, so `service.ts` calls them through
   `lib/python-client.ts`'s raw helpers with hand-typed shapes. After
   regenerating, move those four calls to `lib/api/typed-client.ts`.

## Verified (2026-09-18, `http://<session>.localhost:3001`, admin@admin.com)

- Devices & sync shows a Home connection row under every device card; a seeded
  row appeared **live, with no reload**, proving the realtime binding.
- The switch wrote `enabled` under RLS and the badge moved Paused → Offline.
- Remove named its consequence in `<ConfirmDialog>`; confirming against the
  not-yet-deployed route said so and left the computer connected.
- `/connect-computer` rendered the three downloads from the live knob, and
  `?code=ABCD-1234` rendered the unknown-code card with its remedy. Mobile
  (375×812) stacks with no horizontal scroll.
- Not yet exercisable here: an APPROVED pairing and a real residential run —
  both need the aidream `/egress/*` routes deployed.

## Change log

- 2026-09-18 — Created. Frontend half of the residential-egress contract v1.
