# FEATURE.md — `ai-models` (local mechanics)

> Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/agents/ai-models/STATE.md — read it before touching this feature in ANY repo.

What this feature IS, what the catalog means, every decision behind it, and the remaining work live
in that node kit. This file holds only the file map and the rules an agent editing THIS directory
must obey.

## Where things are

- Admin routes: `app/(admin)/administration/ai/ai-models/{page,audit,deprecated-audit,provider-sync,providers,endpoints,offerings,settings,aliases}` (display metadata in `features/admin/constants/admin-{categories,navigation}.ts`).
- Decision playground: `app/(core)/decisions` (normal authenticated route, sidebar Agents → Decisions in `features/shell/constants/nav-data.ts`), rendering `decisions/DecisionPlayground.tsx`. It moved OUT of admin on Arman's ruling (2026-09-20: "we never put playgrounds, demos or normal UI in the admin system"); `/administration/ai/ai-models/decisions` no longer exists. Its default model is the settings knob `agents.model_prefs.decision_default_model` via `preferredDecisionModel.ts` (sibling of `preferredChatModel.ts`), falling back to the catalog's first `interaction: "decision"` model, else the ready-check says "Choose a decision model" — never a hard-coded id.
- API routes: `GET /api/ai-models` (CDN-cached 12h/24h SWR), `POST /api/ai-models/revalidate`, `POST /api/admin/ai-models/replace-references`. `app/api/ai-models/provider-sync` is DELETED (2026-09-11) — Provider Sync's model refresh is server-side now (aidream `POST /admin/ai-catalog/provider-models/refresh`), never a Next.js middle tier.
- No barrel: import from `components/…`, `service.ts`, `types.ts`, `hooks/…`, `redux/…`, `audit/…`, `server/…`, `controls/…`, `capabilities/…`, `usageBasis.ts`, `format.ts`.
- Slice `redux/modelRegistrySlice.ts` · service `service.ts` · reload thunk `catalogReload.ts` · provider-models refresh thunk `providerModelsRefresh.ts` · SSR reader `server/ai-models-server.ts` · identity display `components/official/entity-ref/AiIdentityRef.tsx` · picker favorites `hooks/useModelFavorites.ts` (canonical write: `platform.user_entity_state` via `ues_set`/`ues_list` for `ai_model`; preferences JSON is the instant cache). Replace review dialog `components/ModelSettingsReviewDialog.tsx` hosts `RunConfigOverrides` (does not fork settings rows).

## 🚨 Rules

- **There is ONE platform model picker: `components/lab/ModelListDropdown.tsx`.** Every UI that
  chooses an `ai.model_definition` row renders that component, directly or through a thin settings/
  run-control adapter. Constrain it with `allowedModelIds`, `catalogVariant`, `inputModalities`,
  `outputModalities`, `emptyOptionLabel`/`onClear`, `priorityModelIds`, and trigger styling — never
  fork its roster. Search, filters, sort, favorites, details, mobile drawer, and the admin catalog
  are inseparable parts of model choice. Picker stars go through
  `hooks/useModelFavorites.ts` — never a second favorite store. Provider wire-model enums (Cartesia/Google/test harnesses)
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
- **Providers, Settings, Endpoints and APIs use the package table controls.** Stable identities `ai/providers`, `ai/settings`, `ai/endpoints` and `ai/apis` scope saved layouts; title, search, sort/filter menus, refresh, Add, column management, export, and bottom spacing are shared. `rowActions` returns flat controls or fragments only: `MatrxDataTable` owns the nonwrapping action strip and intrinsic Actions-column sizing. Endpoint vendor/translator values are plain text. Tabs, record detail editors, system-record restrictions, and create/delete handlers are feature-owned. Complete source reads feed local pagination; these lists are not server-append demonstrations. Provider/Setting containers invalidate pending refreshes after successful mutations. Provider editors preserve same-record drafts and report an observed newer revision; this local check is not database compare-and-swap protection. Rollout/browser acceptance lives in `common-docs/projects/npm-package-extraction/TABLE-ROLLOUT-REGISTER.md`.
- `/api/ai-models` is CDN-cached: registry changes need `POST /api/ai-models/revalidate` to reach SSR.

> **Keep-docs-live rule (CLAUDE.md):** a change to this directory's file map or to any rule above
> updates this file in the same change; a change to what the catalog MEANS updates the node's STATE.md.

## Change log

- **2026-09-19** — **Deprecated-model replace errors are readable, and Review uses the agent settings panel.** A failed Quick replace used to dump the raw Postgres provenance refusal into the Actions cell (and again, truncated, in the Review footer), so the row wrapped into garbage and the dialog ran off the screen. The row now shows a short "Couldn't replace"; Review mounts `RunConfigOverrides` (`structured`) — the same Redux-backed settings table agents already use — so defaults and availability come from the replacement model's full registry record. The failure itself is a wrapping banner (human title + detail), never a cell dump. Shared mapping: `components/official/error-detail/explainError.ts`.

- **2026-09-19** — **Model picker stars persist, and the filter/list layout is readable.** Favorites were only written into `userPreferences.aiModels.favoriteModels` — a last-write-wins JSON blob — so a later preference save from a stale snapshot emptied the stars. They now dual-write to `platform.user_entity_state` (`ai_model`) via direct `ues_set`/`ues_list` (JWT `auth.uid()`, not the associations `requireUserId` Redux gate) and reconcile on mount (`hooks/useModelFavorites.ts`). A hollow remote blob can no longer replace in-session stars (`mergeFavoriteModelIds` on load). Filter panel: 3-col maker/service tiles with Any in the grid, single-row sort/input/output chips, multilingual + include-deprecated as a bottom button row, delayed tooltips (400ms, no skip) on truncated names, taller/wider popover, and Speed/Context/Cost columns (speed as a word; context window; cost as the $ band — "Usage" and a points column that looked like context were lies).

- **2026-09-14** — **Provider Sync's classification view was readable by nobody, and now reads like its five siblings (DD-238).** `ai.provider_sync_candidates` carried NO acl at all (`pg_class.relacl` null), so `fetchProviderSyncCandidates`'s `select("*")` came back `42501 permission denied for view provider_sync_candidates` at HTTP 403 for every signed-in visitor — two such rows reached `ops.system_error` from `/administration/ai/ai-models/provider-sync` on 2026-09-12 and the screen has not been opened since. The view is `security_invoker=true` and its siblings in the same schema (`model_admin`, `model_config`, `model_offering`, `model_offering_admin`, `model_public`, `ui_enum_drift`) all carry `authenticated=r`; the grant was simply missed. `migrations/dd238_the_sync_candidates_view_reads_like_its_siblings.sql` adds it. The access delta is 0, measured in a rolled-back transaction before the file was written: the view's five base relations are already readable by `authenticated` under RLS, and a plain member can already read the classification's inputs straight from `ai.provider` (8 rows carrying `provider_models_cache`, 524 model entries, 32 `sync_policy` rows). After: `test@test.com` reads 544 rows and `admin@admin.com` 557 — RLS still separating them — and `anon` is still refused. Guarded by `pnpm check:client-reads-granted`.

- **2026-09-14** — **Every model swap ends in the change-impact batch panel (Agent Change Impact I5).** `DeprecatedModelsAudit`'s bulk confirm now embeds `features/mandates/admin/ImpactBatchPanel` in `dry_run` mode — the impact read with `delta.model_id` per replaced model, "N agents, M mandates: x safe / y to check / z red", pins chosen there pre-selected after the write — and every replacement (bulk, quick, with settings) opens the `impactBatchWindow` scoped to the `agent_ids` the writer returns; the bulk write is per model (`Promise.allSettled`), never all-or-nothing, and names each failure. `server/replace-model-references.ts` returns `agent_ids` (every `agent.definition` rewritten) and stamps `change_note` on the version rows the snapshot trigger creates (PostgREST cannot set `app.change_note`, so the note is written onto the row the UPDATE produced). The route now surfaces a PostgrestError's message instead of "Unknown error" — which exposed the live refusal: the service-role write is refused by the provenance guard (`23514`, "declares actor_tier=code, but names no actor_system") since wf_051 (2026-09-12), so the sweep cannot write today; filed as a platform class (every `createAdminClient()` route writing a tier-stamped table), not worked around here. Dialog width uses `w-[min(72rem,96vw)]` (the `calc(100vw-2rem)` form does not compile under Tailwind v4).
- **2026-09-13** — Shared table shell now owns a single 8px outer inset and the flat nonwrapping row-action strip; Providers, Settings, Endpoints, and APIs removed duplicated table wrappers. Provider local pagination is 50 rows; the other stable-list sizes remain unchanged pending the requested census.

- **2026-09-12** — Four requested table corrections are verified: design-system `0.18.12` is published and installed, with lock adoption `eaa760047d` merged in `675aa834`. Root Settings IAB67 proof at 1280px shows 122 real keys, Key 272px, Description 406px, five toolbar controls at 44×44 with 14px SVGs, correct Refresh/New paths, and no standalone Save; search, Refresh retention, Clear, view-menu Save/Cancel, Columns/Cancel, and Add/Cancel passed. Independent mobile review at 375px found no overflow and verified Provider/Endpoint 44px controls with 14px SVGs and no Save. Endpoint Close's initial failure was an animation false positive; direct verification showed 14 rows with the panel absent. Full design-system 511 tests, design-system/dashboard type checks, and the final frontend `pnpm type-check` passed. Wider table rollout and human review remain open.

- **2026-09-12** — Providers and Settings now expose the same package toolbar and saved views as Endpoints/APIs, with labeled row/close actions, retained-row refresh errors and Retry, and full-width mobile detail panels. Refresh/mutation ordering and Provider draft preservation are regression-covered; rollout acceptance remains separately recorded in the shared table register.

- **2026-09-12** — Model Aliases now uses the shared `MatrxDataTable` over complete local `ai.model_alias` rows, ordered by alias/id and paged at 25. Alias target labels and the nondeprecated picker allowlist use a separate complete minimal `model_definition` identity read; this leaves the pricing-enriched model catalog untouched. The parent retains the inline editor, system-org create, soft-delete confirmation, model door, and save/error behavior; package detail is disabled so a row opens only that editor. Phone cards keep the alias editor and model door distinct, and fetch failure exposes Retry.

- **2026-09-12** — Provider and setting delete confirmations describe removal from active lists, matching the existing soft-delete services without claiming irreversible erasure or lost references.

- **2026-09-12** — Settings Vocabulary now uses the shared `MatrxDataTable` over a complete local `ai.setting` read, ordered by key/id and paged at 25. The parent remains the only owner of the selected detail editor and CRUD callbacks; loading failure exposes Retry. Phone cards make the setting-name door and row actions explicit, while system-delete protection remains intact.

- **2026-09-12** — Providers now use the shared `MatrxDataTable` over a complete local `ai.provider` read. The table defaults to 25 local rows per page and preserves provider selection, URL-driven detail opening, mobile cards, outbound links, and the system-provider delete lock. The parent editor owns row opening: the package detail panel is disabled to prevent double opening, and mobile card names explicitly open that same editor.

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
