# Commerce Configuration (scoped knobs, org + user tiers)

**Route:** `/commerce/settings` (admin map `/commerce/settings/admin`)
**Owner workstream:** W11 of the ebay-store-management build, folding in W1's frontend half
(`common-docs/projects/scoped-configuration/PLAN.md` §4).

## What it is

The org and user tiers of the Code → System → Org → User configuration hierarchy. The knob row
(`platform.feature_knob`) stays the ONE definition of a configuration; this surface only reads and
writes the override tables on top of it:

- `platform.feature_knob.override_scope` (`platform`|`org`|`user`) — the maximum tier permitted to
  override. Platform-only knobs (compliance controls) are deliberately NOT listed here.
- `platform.org_knob_override` — written ONLY via `platform.org_knob_set(p_organization_id,
  p_feature, p_key, p_value)` (org-admin gated server-side; NULL = reset/delete).
- `platform.user_knob_override` — written ONLY via `platform.user_knob_set(...)` (member-gated,
  self-only; org-qualified because one person may run two orgs).

The platform tier lives at `/administration/users/limits` (`features/admin/limits/`) — never
duplicated here. Resolution (user ?? org ?? platform, clamped to the knob's current range) is the
server's job; this UI shows the same chain for display.

## Files

| File | What |
|---|---|
| `types.ts` | Hand-declared rows + `PlatformConfigSchema` cast (see header — DELETE when `pnpm db-types` carries `override_scope` + the override tables/RPCs) · `ScopedKnob` UI shape · `effectiveValue`. |
| `service.ts` | `fetchScopedKnobs` (knobs joined with org + own-user overrides), `setOrgKnob`, `setUserKnob` — RPC-only writes. |
| `components/ScopedConfigPanel.tsx` | Organization tab (org-admin gated in UI, enforced server-side; non-admins read-only) + My settings tab. Inputs per `value_type`: number/integer with min/max shown and clamped, boolean switch, enum select over `allowed_values`, string. Reset = the explicit button (never a blank commit). |
| `billing-dimensions.ts` | The seeded commerce billable dimensions (items processed, listings published, storage) — the one vocabulary future billing wiring consumes. |

## Laws carried

- **Writes only through the two setters** — the override tables accept no client writes; the setter
  validates knob existence, scope permission, and type/range/enum.
- **The platform's range is the ceiling** — the input clamps to `min_value`/`max_value` so what the
  user sees saved is what the pipeline resolves.
- **No second registry** — do not add a parallel settings store for anything server-resolvable;
  pure UI preferences with no server behavior stay in the frontend settings system.

## Change Log

- 2026-08-29 — Created (W11): org + user config surface over the live scoped-configuration tables,
  billing dimensions module, admin map.
