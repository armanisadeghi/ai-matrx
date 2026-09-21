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
| `honest-states-parity.ts` | **Guard** — `pnpm check:honest-states-parity` (+ `:self-test`). Diffs values, titles and remedy actions against the engine's generated artifact, both directions. Wired into CI (`honest-states-parity` job, gated on `MATRX_LOCAL_REPO_TOKEN`) and both release-gate lanes. |
| `components/SyncStorageMeters.tsx` | One storage meter per organization that OWNS a synced folder. |
| `@/features/files/storage-meter/` | The meter itself — billing is its only source (D11). See that folder's header. |
| `useNow.ts` | The shared clock (a `Date.now()` in a render body is impure). |
| `app/(admin)/administration/applications/sync/` | The admin page over `files.sync_mapping_admin_status`. |

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
   `pnpm check:honest-states-parity` after touching `honest-states.ts`; it
   fails on any drift in either direction, and fails (never skips) when the
   matrx-local checkout is missing. CI runs it too, gated on
   `MATRX_LOCAL_REPO_TOKEN` and SKIPPED-with-a-warning without it.
5. **A remedy the browser cannot perform gets a sentence, not a button.** Most
   remedies are physical acts on a machine — grant a folder permission, free
   disk space, resolve a conflict. The row says which machine. Only
   resume (`desired_state`) and "get more storage" (`/pricing`) are the
   browser's to do.

## The storage meter

`features/files/storage-meter/` — `summarizeOrgStorage` (pure), `useOrgStorageMeter`
(the two reads) and `OrgStorageMeter` (the chip), rendered here by
`components/SyncStorageMeters.tsx`, ONE per organization that owns a synced
folder. D11: storage limits come from ONE resolver, `billing.resolve_capability`,
metered to the organization.

- The plan NAME **and** the limit come from the SAME read,
  `billing.plan_status(p_org)`, whose every dimension is literally
  `resolve_capability(user, capability, org)`. They cannot drift apart.
- **Nothing falls back.** A failed billing read renders the sentence and a Try
  again, never a number from somewhere else. `readPlanStatus` exists for exactly
  that reason: `fetchPlanStatus` collapses every failure to `null`, which is how
  a retired ladder's 5 GB came to sit under billing's plan word (L5-1).
- `files.account_tiers` is NOT read here, directly or through
  `public.get_usage_status` → `public.get_user_limits`. The measured bytes come
  straight from `files.user_storage_usage` under RLS.
- No ledger row → "Usage being recalculated", no bar. A confident 0% about an
  unmeasured account is a lie.
- The GRAIN is stated on screen: `public.apply_usage_delta` is keyed on the
  user, so the bytes are this person's files and the limit is the
  organization's. SPEC-SERVER §8's amendment permits that until FS-L6 re-grains
  the ledger, and requires the two never be read as one sentence. Delete
  `GRAIN_NOTE` the day FS-L6 lands.
- The cloud-files sidebar (`NavSidebar` → `StorageQuotaChip` →
  `useStorageQuota`) still reads the old ladder. That is the remaining
  `account_tiers` reader on a user-facing surface; it is out of this item's
  scope and belongs to FS-L6.

## Guards

| Command | What it proves |
|---|---|
| `pnpm check:honest-states-parity` | The browser's state values, titles and remedy actions equal the engine artifact's, verbatim, both directions. CI job + both release-gate lanes. |
| `pnpm check:honest-states-parity:self-test` | …and that guard still goes red (three planted drifts). |
| `pnpm check:user-visible-parity` | The one visibility rule: the TS mirror equals the live SQL functions, and the browser's rendered set equals the predicate's set (needs `AI_ADMIN_*`). Set-based — 4,945 paths in under a second through `files.is_user_visible_paths`. Knobs: `PARITY_PATH_BATCH`, `PARITY_MAX_PATHS`. |
| `npx jest features/files/storage-meter features/files/devices features/files/utils/user-visible.test.ts` | The meter's honest states, the one-sentence-per-row rule, and the visibility unit covers. |

## Change log

- **2026-09-21** — Verification findings L5-1…L5-4 fixed. The meter is
  rebuilt on billing (see above) and no longer reads `files.account_tiers`; a
  folder row derives ONE sentence from the state enum AND `last_seen_at`
  (`describeMappingReport`), so a six-day-old `syncing` can no longer say
  "Files are moving" beside "Silent since 6 days ago"; the knowledge toggle
  says what it actually does (it writes the C11 knob, and the file service does
  not honour it yet); and both parity guards are wired to `check:*` scripts
  that CI and the release gates run.

- **2026-09-18** — Each `DeviceCard` gained a **Home connection** row, and the
  tab gained an **Other computers** section for a computer that lends its
  internet connection but syncs no folders (the standalone helper registers no
  `app_instances` row, so no device card can carry it). Both render
  `features/residential-egress/components/HomeConnectionRow.tsx`; the list is
  read ONCE here through `useHomeConnections` and handed down, never re-read per
  card. The live sentence at the top is now the SLOWER of the two channels —
  "Live" while half the page polls would be a lie. Contract:
  `common-docs/systems/platform/residential-egress/FEATURE.md`.
- **2026-09-15** — Created (FS-L5): the Devices & sync tab, the honest storage
  meter, the admin page, and the deletion of the browser's second copy of the
  visibility rule.
