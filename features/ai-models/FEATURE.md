# FEATURE.md — `ai-models` (local mechanics)

> Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/agents/ai-models/STATE.md — read it before touching this feature in ANY repo.

What this feature IS, what the catalog means, every decision behind it, and the remaining work live
in that node kit. This file holds only the file map and the rules an agent editing THIS directory
must obey.

## Where things are

- Admin routes: `app/(admin)/administration/ai/ai-models/{page,audit,deprecated-audit,provider-sync,providers,endpoints,offerings,settings,aliases}` (display metadata in `features/admin/constants/admin-{categories,navigation}.ts`).
- API routes: `GET /api/ai-models` (CDN-cached 12h/24h SWR), `POST|GET /api/ai-models/provider-sync`, `POST /api/ai-models/revalidate`, `POST /api/admin/ai-models/replace-references`.
- No barrel: import from `components/…`, `service.ts`, `types.ts`, `hooks/…`, `redux/…`, `audit/…`, `server/…`, `controls/…`, `capabilities/…`, `usageBasis.ts`, `format.ts`.
- Slice `redux/modelRegistrySlice.ts` · service `service.ts` · reload thunk `catalogReload.ts` · SSR reader `server/ai-models-server.ts` · identity display `components/official/entity-ref/AiIdentityRef.tsx`.

## 🚨 Rules

- **Read the VIEWS, never the dropped columns.** `ai.model_public` (picker/options), `ai.model_config`
  (resolved controls/constraints, `'full'` records), `admin_model_catalog()` / `admin_model_offerings()`
  RPCs for anything admin. `ai.model_admin` and `ai.model_offering_admin` have postgres-only grants —
  never `.from(...)` them, never grant them to `authenticated`. `metadata->'legacy'` is a frozen
  archive; app code never reads it.
- **Read `maker`, never `provider`.** Users must NEVER see serving vendors (Groq, Together, Cerebras…)
  or wire formats — only the branded `served_via`. Admin surfaces may.
- **Every rule/override save must dispatch `reloadAiCatalog()`** (scoped to `resolveSystemOrgId()`).
  A DB write without it leaves the live server translating with stale rules.
- **`controls/resolveControls.ts` is a mirror of `ai.resolve_model_config` — LOCKSTEP LAW.** Any change
  to the SQL resolver is mirrored here in the same session, and vice versa.
- **Registry records have two levels and never downgrade.** `'options'` guarantees only id/name/
  common_name/maker/ratings/is_primary/capabilities; `controls`, `constraints`, `context_window` need
  `'full'`. Gate on `useModelFull()` / `selectModelFullyLoaded()`; do not bypass the guards.
- **A model is not callable without an `ai.offering`.** Pickers and SSR readers MUST filter through
  `ai.model_offering`; creating a model without an offering is an incomplete create.
- **Agents reference models by UUID only** (`agent.definition.model_id`). Never hard-code a provider
  model string at a call site, and never render an FK raw — use `AiModelRef`.
- **Pricing is edited in exactly ONE place: the offering.** The model detail Pricing tab is read-only.
  Every tier needs a `usage_basis`; validate with `validatePricingTiers` (`usageBasis.ts`, the mirror
  of the server's `usage_config.USAGE_BASIS_SPECS` — keep them in sync). Fail-closed rule: media
  output AND null basis AND NOT `token_billed` ⇒ pricing bug. **Billing never reads a model name** —
  never reintroduce a model-name regex or hardcoded list.
- **The browser catalog is not an execution authority.** Interaction validation, constraint
  enforcement and deprecated-model fallback happen server-side at call time; constraints are advisory
  in the UI and MUST NOT block save.
- **"No model chosen" resolves through ONE place:** `redux/platformDefaultModel.ts`. Never hardcode a
  default model id in a seed or call site.
- **`parseCapabilities` screams on unknown values instead of coercing.** Adding a capability value to
  the DB requires extending `capabilities/types.ts` in the same change, or live data is discarded.
- **New catalog rows are homed via `resolveSystemOrgId()`**, never the `_stamp_org_default` trigger
  (which would home them in the creating admin's personal org).
- **Rating rendering is centralized** in `format.ts` (`costRatingTier`/`speedRatingLabel`, 1–6, 6 = "5+").
  Hardcoded maker/price maps are forbidden.
- **Deprecating a model is destructive at the reference layer.** Flip `is_deprecated`, then use
  `fetchUsage` + the `replaceModelIn*` helpers (they patch both the column and `settings->model_id`);
  never raw SQL that ignores the JSONB path.
- **Dirty-report callbacks must be ref-stable** — an inline arrow in `onDirtyChange` caused a setState
  ping-pong loop in `AiModelDetailPanel`.
- **The registry table has one scrollport.** Its `<table>` keeps `table overflow-visible`; the
  `overflow-auto` wrapper owns scrolling so sticky Display Name and Actions cells actually freeze.
- `/api/ai-models` is CDN-cached: registry changes need `POST /api/ai-models/revalidate` to reach SSR.

> **Keep-docs-live rule (CLAUDE.md):** a change to this directory's file map or to any rule above
> updates this file in the same change; a change to what the catalog MEANS updates the node's STATE.md.

## Change log

- `2026-08-25` — Restored the admin registry's single mobile scrollport so sticky identity and
  action cells remain pinned while the wide table scrolls.
