# FEATURE — Devices & sync (browser half of folder sync)

**What it is:** Settings → **Devices & sync** (`files.devices`). Every machine
signed in to this account, every folder each one syncs, what is true about each
right now, and the controls the browser is allowed to operate. Plus the storage
meter, and the admin view of the same data with no paths in it.

Campaign: folder-sync register item **FS-L5**. Frozen contracts live in
`common-docs/projects/folder-sync/` — `SCOPE.md` §3.1 items 29–31 and 35,
`specs/SPEC-SERVER.md` §1 and §6, `specs/SPEC-ENGINE.md` §3.6,
`specs/CONTRACT-RULINGS.md` (C3, C4, C11, C14), `DECISIONS.md` (D5, D6, D11,
D12, D16, D21). Read those before changing anything here; this file is the
local mechanics only.

## The shape

| File | What it owns |
|---|---|
| `DevicesSyncTab.tsx` | The settings tab: meter, live/polling banner, device cards, empty and error states. |
| `components/DeviceCard.tsx` | One device: name, platform, app version, "silent since", its mappings. |
| `components/MappingRow.tsx` | One synced folder: direction, state + remedy, knobs, pause/resume/remove. |
| `useDevicesAndSync.ts` | The read, the realtime subscription, the announced polling fallback. |
| `service.ts` | Direct-to-Supabase reads and the three intent writes. |
| `honest-states.ts` | The mapping-state vocabulary as this browser renders it. |
| `honest-states-parity.ts` | **Guard** — diffs the titles against the engine's generated artifact. |
| `useNow.ts` | The shared clock (a `Date.now()` in a render body is impure). |
| `app/(admin)/administration/files/devices/` | The admin page over `files.sync_mapping_admin_status`. |

## The five things that are easy to get wrong

1. **Who writes what (C4).** The browser writes `desired_state`, `direction`
   and `knobs` — the user's INTENT. The daemon writes `state`, `state_reason`,
   `last_seen_at`, `last_synced_at`, `items_total`, `bytes_total` — its
   OBSERVATION. `files.sync_mappings_column_ownership` refuses the other lane's
   columns, so this is enforced, not documented. That split is why Pause
   survives the next heartbeat; while they disagree the row shows "Pausing…".
2. **`local_path`, `device_id` and `organization_id` are fixed at creation**,
   for both lanes — re-pointing a live mapping would skip admission (D20). The
   trigger names the column and the remedy.
3. **Paths never ride realtime.** The publication carries an explicit 17-column
   list with no `local_path`, `local_path_display`, `state_reason` or `knobs`.
   An event means "re-read this row", never "here is the row".
4. **The state words are not ours.** Values and titles come from
   `matrx-local/crates/matrx-sync/contracts/honest_states.json`, the same
   artifact that generates the `state` CHECK constraint. Run
   `pnpm tsx features/files/devices/honest-states-parity.ts` after touching
   `honest-states.ts`; it fails on any drift in either direction, and fails
   (never skips) when the matrx-local checkout is missing.
5. **A remedy the browser cannot perform gets a sentence, not a button.** Most
   remedies are physical acts on a machine — grant a folder permission, free
   disk space, resolve a conflict. The row says which machine. Only
   resume (`desired_state`) and "get more storage" (`/pricing`) are the
   browser's to do.

## The storage meter

`useStorageQuota` / `StorageQuotaChip` (in `features/files/hooks` and
`features/files/components/surfaces/desktop`). It reads `get_usage_status`
direct-to-Supabase, and:

- the RPC **synthesizes zeros** when `files.user_storage_usage` has no row, so
  the flattener reports `ledger_measured` and the chip renders "Usage being
  recalculated" with no bar rather than "0 of 5 GB" about an unmeasured
  account (SPEC-SERVER §8: metering only just landed, FS-L6 still rebuilds and
  re-grains the ledger);
- the plan **name** comes from `billing.plan_status` for the effective
  organization (D11), not the retiring `files.account_tiers` ladder;
- over quota and blocked link to `/pricing`, and a failed read says so with a
  Retry.

## Guards

| Command | What it proves |
|---|---|
| `pnpm tsx features/files/devices/honest-states-parity.ts` | The browser's state titles equal the engine artifact's, verbatim. |
| `pnpm tsx features/files/utils/user-visible-parity.ts` | The one visibility rule: the TS mirror equals the live SQL functions, and the browser's rendered set equals the predicate's set (needs `AI_ADMIN_*`). |
| `npx jest features/files/hooks/useStorageQuota.test.ts features/files/utils/user-visible.test.ts` | The unmeasured-ledger and visibility unit covers. |

## Change log

- **2026-09-15** — Created (FS-L5): the Devices & sync tab, the honest storage
  meter, the admin page, and the deletion of the browser's second copy of the
  visibility rule.
