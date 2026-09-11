# FEATURE.md — `ai-models` (local mechanics)

> Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/agents/ai-models/STATE.md — read it before touching this feature in ANY repo.

What this feature IS, what the catalog means, every decision behind it, and the remaining work live
in that node kit. This file holds only the file map and the rules an agent editing THIS directory
must obey.

## Where things are

- Admin routes: `app/(admin)/administration/ai/ai-models/{page,audit,deprecated-audit,provider-sync,providers,endpoints,offerings,settings,aliases}` (display metadata in `features/admin/constants/admin-{categories,navigation}.ts`).
- API routes: `GET /api/ai-models` (CDN-cached 12h/24h SWR), `POST /api/ai-models/revalidate`, `POST /api/admin/ai-models/replace-references`. `app/api/ai-models/provider-sync` is DELETED (2026-09-11) — Provider Sync's model refresh is server-side now (aidream `POST /admin/ai-catalog/provider-models/refresh`), never a Next.js middle tier.
- No barrel: import from `components/…`, `service.ts`, `types.ts`, `hooks/…`, `redux/…`, `audit/…`, `server/…`, `controls/…`, `capabilities/…`, `usageBasis.ts`, `format.ts`.
- Slice `redux/modelRegistrySlice.ts` · service `service.ts` · reload thunk `catalogReload.ts` · provider-models refresh thunk `providerModelsRefresh.ts` · SSR reader `server/ai-models-server.ts` · identity display `components/official/entity-ref/AiIdentityRef.tsx`.

## 🚨 Rules

- **There is ONE platform model picker: `components/lab/ModelListDropdown.tsx`.** Every UI that
  chooses an `ai.model_definition` row renders that component, directly or through a thin settings/
  run-control adapter. Constrain it with `allowedModelIds`, `catalogVariant`, `inputModalities`,
  `outputModalities`, `emptyOptionLabel`/`onClear`, `priorityModelIds`, and trigger styling — never
  fork its roster. Search, filters, sort, favorites, details, mobile drawer, and the admin catalog
  are inseparable parts of model choice. Provider wire-model enums (Cartesia/Google/test harnesses)
  are a different identity domain and require a nearby reasoned `canonical-model-picker-exempt:`
  comment. Guard (also protects the ONE agent picker): `pnpm check:canonical-pickers`, blocking in
  release gates.
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
  The Models and Offerings tables render the same input/cached-input/output provider-price columns;
  Models shows the preferred available offering and Offerings shows each exact route.
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

- **2026-09-11** — Provider Sync's dashboard mount loader no longer asks its parent to
  reload. The parent skeleton is first-load-only, so explicit refreshes after writes keep the
  dashboard mounted instead of creating an unbounded mount → parent reload → unmount loop.
  Policy saves also await the dashboard's classification reload before closing and announcing
  success, so rapid edits cannot display the previous policy's counts. The lifecycle guard
  covers both the mount contract and this asynchronous save boundary.

- **2026-09-11** — Provider-sync copy actions rebuilt on the canonical `CopyButtons` pair (`ProviderSyncCopyForAi.tsx`): the provider menu and page control lose their bespoke dropdown / visible "Copy for AI" text / local clipboard copy, keep the status variants (All / Matched / Not in DB / Extra / Excluded), gain Copy JSON + JSON/CSV downloads, and carry **"Filter & sort before copying…"** — the platform `copy-subset` window (`components/agent-copy/copy-subset/FEATURE.md`) over `{ provider, comparison }` rows (Model · Provider id · Provider · Status · Released · DB name · Deprecated · Type). Serializer: `buildProviderSyncSubsetPayload` (`status_filter: "custom"`, shaping attributes); flat records: `providerSyncComparisonRecord`.

- `2026-09-11` — `ModelListDropdown` keeps every fixed desktop column reachable
  below its 808px/1208px user/admin inner widths by scrolling the inner panel
  horizontally inside its viewport-clamped popover; list/detail/offering panes
  retain their own vertical scrollports.
- `2026-09-11` — All finite admin selectors now import directly from
  `@ai-matrx/design-system`; the deprecated-model replacement control now uses
  `ModelListDropdown` with its active-model allowlist, so it retains the full
  platform catalog behavior instead of building a second model roster.
- `2026-09-11` — Offering rule parsing now normalizes a null optional `processor` to an absent
  property, matching the sparse-rule contract while retaining strict validation for configured
  processors.
- `2026-09-11` — The admin Offerings catalog now accepts nullable pricing directions from the
  live `ai.offering.pricing` contract. A non-applicable direction remains `null` and renders as
  absent; non-null prices still fail closed unless they are finite numbers. Previously the first
  character-input offering with a null output price rejected the entire live catalog.
- `2026-09-09` — **Deprecated models RUN; retired is the dead state** (ai_075, ruling in
  `../../../common-docs/systems/agents/ai-models/DECISIONS.md`). Deprecating Gemini 3.7 Flash had
  made it vanish: `ai.model_config`/`model_public` filtered deprecated rows, so `fetchModelById`
  rejected 263 times with "Unknown error" on a mandate page that referenced it. The views now
  EXPOSE `is_deprecated` / `retired_at` / `successor_id`; `fetchModelById` reads any model by id
  (a missing row is now the honest `recordUnavailable`), the registry keeps deprecated records,
  `ModelListDropdown`'s user variant hides deprecated rows by default behind an
  **Include deprecated** toggle (filter panel + bottom bar, off by default; the selected model
  always stays listed), the admin variant always shows them badged, and a **retired** row is
  visible-but-unselectable everywhere (`refuseIfRetired` guards every selection path).

- `2026-09-11` — **Provider Sync renders the DATABASE's classification, and the policy is editable.**
  The screen used to decide "excluded" from a hardcoded constant
  (`constants/excluded-provider-models.ts`, now DELETED, no shim) while the model sync agent read
  `ai.provider.sync_policy` — two answers that could drift, neither changeable without a deploy.
  `utils/providerSyncComparison.ts` now maps `ai.provider_sync_candidates.status` (matched /
  excluded / before_cutoff / missing) verbatim; the only row kind computed here is `extra_local`,
  which the view cannot produce. `ProviderSyncPolicyDialog` edits the per-provider cutoff date and
  exclusion list (also reachable from a row's **Exclude** / **Un-exclude**), writing
  `ai.provider.sync_policy` direct via supabase-js behind a confirm that names the consequence.
  Every row also shows the preferred offering's tier-0 price per MTok with its usage basis and a
  verification badge from `ai.offering.pricing_verified_at` — a column that does not exist yet, so
  the badge reads **not tracked** rather than implying a check happened; Groq's own per-token
  price is converted ×1e6 and a drift shows both numbers. `no offering` and `no price` are distinct
  visible states. Per-provider snapshot age replaces the raw timestamp and flags past 24h.
  RESOLVED 2026-09-11 (see below): Sync Now now calls aidream's server-side refresh.

- `2026-09-11` — **Provider Sync's model refresh moved server-side; the duplicate Next.js
  fetchers are gone.** Sync Now now dispatches `providerModelsRefresh.ts` (`refreshProviderModels`,
  mirroring `catalogReload.ts`) against aidream's `POST /admin/ai-catalog/provider-models/refresh`
  — the on-demand half of its daily `provider_models_refresh` system task, and the ONLY writer of
  `ai.provider.provider_models_cache` now. `app/api/ai-models/provider-sync` (both the four
  provider-API fetchers and the GET summary endpoint) is DELETED, no shim — the dashboard's
  provider summaries now derive directly from the `providers` prop (already a plain supabase-js
  read owned by the parent page), and Refresh re-pulls it via `onModelsChanged`. The server
  supports xAI, which the old Next route never did. A `missing_key` / `no_provider_row` / `failed`
  result is a reported row from the server, shown as the sync error for that provider — never
  hidden or silently retried.

- `2026-08-30` — Provider Sync now gives its mobile toolbar distinct stats,
  legend, and action rows plus the canonical coarse-pointer touch floor while
  preserving the compact desktop toolbar.
- `2026-08-29` — `service.ts` now validates catalog API responses and JSONB model/provider/
  endpoint/API/offering/setting fields at ingress, then constructs generated update shapes without
  boundary assertions. Malformed stored contracts fail closed instead of being trusted by cast.
- `2026-08-28` — Consolidated every platform model-selection surface onto `ModelListDropdown`,
  including Model Settings, chat overrides, comparisons, imports, user defaults, observational
  memory, and admin relationship editors; deleted `SmartModelSelect` and added the blocking
  `check:canonical-pickers` guard for both model and agent picker forks.
- `2026-08-26` — Restored directly comparable input, cached-input, and output provider pricing on
  both admin catalog tables, with each value labeled by its real billing unit.
- `2026-08-25` — Restored the admin registry's single mobile scrollport so sticky identity and
  action cells remain pinned while the wide table scrolls.
