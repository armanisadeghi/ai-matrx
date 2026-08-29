# Commerce Config — billing dimensions ONLY (no commerce settings page)

**Owner workstream:** W11 of the ebay-store-management build.
**SoR for the config mechanism:** `../common-docs/systems/platform/feature-knobs/FEATURE.md`.

## There is NO commerce-local configuration surface — by ruling

Arman (2026-08-29): the `/commerce/settings` page "makes no sense" — a user-level page doing
org configuration — and broke the (core) route chrome. It was **deleted** per no-legacy
(page, layout, admin map, `ScopedConfigPanel`). Never rebuild a commerce lens over the
scoped-configuration primitive. Commerce knobs are ordinary registry rows
(`platform.feature_knob`, features `commerce.*` + `batch.deadline`) and render on the THREE
canonical surfaces automatically:

| Tier | Surface |
|---|---|
| Platform | `/administration/users/limits` (all knobs, unfiltered) |
| Organization | `/organizations/[orgId]/settings/configuration` (knobs `overridable_by` includes `organization`) |
| Personal | Settings → Personal configuration tab (knobs `overridable_by` includes `user`) |

Reads ride `platform.knob_index`; writes ride `platform.knob_override_set` — via
`lib/scoped-config/` (`useScopedKnobs` + `KnobOverrideRow`). Never a second read/write path.

## The one module left here

| File | What |
|---|---|
| `billing-dimensions.ts` | The seeded commerce billable dimensions (items processed, listings published, storage) — the ONE vocabulary future `billing.capability` / `billing.plan_limit` wiring consumes. No live consumer yet; surfaced in the Commerce Review admin map (`/commerce/review/admin`) so it is never orphaned. |

## Change Log

- 2026-08-29 — Deleted the parallel `/commerce/settings` surface (page + layout + admin map +
  `ScopedConfigPanel`) per Arman's ruling and no-legacy; repointed the store-connect onboarding
  step to `/organizations/[orgId]/settings/configuration`; registered `billing-dimensions.ts`
  in the Commerce Review admin map. This feature now holds only the billing-dimensions
  vocabulary module.
- 2026-08-29 — Restored the authenticated client grant for `platform.knob_index` after the
  client-door DDL guard correctly revoked `scfg_03`'s grant-before-registration ordering; the
  repair migration asserts both the door declaration and effective EXECUTE privilege.
- 2026-08-29 — Rewritten onto the canonical scoped-configuration stack: deleted the parallel
  mechanism (service.ts/types.ts over `override_scope`, `org_knob_override`/`user_knob_override`,
  `org_knob_set`/`user_knob_set` — all dropped from the live DB) and remounted the panel on
  `lib/scoped-config/` (`knob_index` / `knob_override_set`).
- 2026-08-29 — Created (W11): org + user config surface, billing dimensions module, admin map.
