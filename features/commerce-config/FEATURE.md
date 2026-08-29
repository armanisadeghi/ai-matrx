# Commerce Configuration (commerce lens on scoped configuration)

**Route:** `/commerce/settings` (admin map `/commerce/settings/admin`)
**Owner workstream:** W11 of the ebay-store-management build.
**SoR for the mechanism:** `../common-docs/systems/platform/feature-knobs/FEATURE.md`.

## What it is

A thin commerce-scoped view over the ONE scoped-configuration primitive
(Code → System → Org → User). There is no commerce-specific config mechanism: this feature only
filters and mounts the canonical client stack in `lib/scoped-config/`:

- **Read:** `useScopedKnobs` → RPC `platform.knob_index(org, feature_prefix, user_id,
  overridden_only)` — one call returns resolution state (origin, effective value, org/user
  overrides) plus presentation metadata (`overridable_by`, `platform_locked`, `out_of_range`,
  ranges, labels).
- **Write:** `KnobOverrideRow` (the ONE editor row all surfaces mount) → RPC
  `platform.knob_override_set` (NULL value = clear the override; refusals come back as structured
  reasons, rendered by the row).
- **Scope of this lens:** `commerce.*` features plus the `batch.deadline` knobs commerce pipelines
  ride. Org tab shows knobs whose `overridable_by` includes `organization` (org-admin gated
  server-side); My settings tab shows those whose `overridable_by` includes `user`.

The platform tier lives at `/administration/users/limits`; the all-features org surface is
`/organizations/[orgId]/settings/configuration`; the all-features user surface is the Personal
configuration settings tab. This page duplicates none of their logic.

## Files

| File | What |
|---|---|
| `components/ScopedConfigPanel.tsx` | The two-tab commerce filter over `useScopedKnobs` + `KnobOverrideRow`. No local read/write/edit logic. |
| `billing-dimensions.ts` | The seeded commerce billable dimensions (items processed, listings published, storage) — the one vocabulary future billing wiring consumes. |

## Laws carried

- **One primitive** — never add a commerce-local read of `platform.feature_knob`/`knob_override`
  or a second write path beside `knob_override_set`; extend `lib/scoped-config/` instead.
- **No second registry** — pure UI preferences with no server behavior stay in the frontend
  settings system; anything server-resolved is a knob.

## Change Log

- 2026-08-29 — Rewritten onto the canonical scoped-configuration stack: deleted the parallel
  mechanism (service.ts/types.ts over `override_scope`, `org_knob_override`/`user_knob_override`,
  `org_knob_set`/`user_knob_set` — all dropped from the live DB) and remounted the panel on
  `lib/scoped-config/` (`knob_index` / `knob_override_set`).
- 2026-08-29 — Created (W11): org + user config surface, billing dimensions module, admin map.
