# FEATURE.md — `ai-models`

**Status:** `stable`
**Tier:** `2`
**Last updated:** `2026-07-03`

---

## Purpose

The catalog and configuration surface for every LLM available to the product — model identity (id, provider, class, deprecated flag), capabilities, controls schema, pricing tiers, and declarative runtime constraints. Agents (and legacy prompts/builtins) reference rows from this registry by ID; the Agent Builder uses it as a picker.

---

## Entry points

**Imports:** There is no root `index.ts` barrel — import from `components/…`, `service.ts`, `types.ts`, `hooks/…`, `redux/…`, `audit/…`, and `server/…` as needed.

**Routes**
- `app/(admin)/administration/ai-models/page.tsx` — admin model registry (table + detail panel + tab presets)
- `app/(admin)/administration/ai-models/audit/page.tsx` — `ModelAuditDashboard` (data-quality rules across models)
- `app/(admin)/administration/ai-models/deprecated-audit/page.tsx` — deprecated-reference cleanup
- `app/(admin)/administration/ai-models/provider-sync/page.tsx` — pull live model lists from provider APIs
- `app/(admin)/administration/ai-models/providers/page.tsx` — `ProvidersContainer`, full CRUD on `ai.provider` (name, slug, links, logo, visibility)
- `app/(admin)/administration/ai-models/services/page.tsx` — `ServicesContainer`, full CRUD on `ai.service` (wire format, base URL, auth, controls, request defaults)
- `app/(admin)/administration/ai-models/offerings/page.tsx` — `OfferingsContainer`, full CRUD on `ai.offering` (Manage tab) + a Coverage tab reporting `ai.model_offering` and the models with zero offerings
- `app/(admin)/administration/ai-models/settings/page.tsx` — `SettingsContainer`, full CRUD on `ai.setting` (the canonical settings vocabulary)

All four routes are registered in `features/admin/constants/admin-categories.ts` under the "AI Models" category alongside Registry/Audit/Deprecated/Provider Sync.

**API endpoints**
- `GET /api/ai-models` — cached (12h s-maxage, 24h SWR) list of active models for client/SSR readers
- `POST/GET /api/ai-models/provider-sync` — fetch-and-cache model lists from Anthropic / OpenAI / Groq APIs into `ai.provider.provider_models_cache`
- `POST /api/ai-models/revalidate` — cache-tag invalidation

**Hooks** (`features/ai-models/hooks/useModels.ts`)
- `useModels()` — active-model options (lightweight, for dropdowns); triggers `fetchModelOptions` thunk
- `useModelOptions()` — `{ value, label, provider }` options for dropdowns
- `useAllModelOptions()` — active + deprecated (admin tooling)
- `useDeprecatedModels()` / `useAllModels()` — full lists
- `useModelFull(id)` — gates on `_fetchType === 'full'`, returns `undefined` until the full row is loaded; auto-dispatches `fetchModelById`
- `useModelById(id)` — any fetch level (options or full)
- `useModelFetchType(id)` — readiness check for conditional rendering
- `useTabUrlState()` — URL-persisted tab/filter presets for the admin table

**Services**
- `features/ai-models/service.ts` — `aiModelService`: client-side CRUD (`fetchAll`, `create`, `update`, `remove`, `bulkPatchField`, `patchField`), provider-cache ops, usage lookup (`fetchUsage` across `agent.definition`/`agent.template`), and deprecation-migration helpers (`replaceModelIn*`). `public.prompts`/`prompt_builtins` are graveyarded — `fetchUsage`/`replaceModelInPrompts` treat that leg as a no-op (0 rows, intentional). Also: `fetchAllProviders`/`createProvider`/`updateProvider`/`deleteProvider`, `fetchServices`/`createService`/`updateService`/`deleteService`, `fetchOfferings`/`createOffering`/`updateOffering`/`deleteOffering`/`fetchModelOfferingView`, `fetchSettings`/`createSetting`/`updateSetting`/`deleteSetting` — full CRUD for the reshape's other four tables/view.
- `features/ai-models/server/ai-models-server.ts` — `fetchAIModels()` (React-cached server reader for SSR shells)

**Redux slice**
- `features/ai-models/redux/modelRegistrySlice.ts` — `modelRegistry` slice: normalized `entities` + `activeIds`/`deprecatedIds`, `fetchScope`, per-record `_fetchType` (`'options' | 'full'`). Thunks: `fetchModelOptions`, `fetchModelById`. Action: `hydrateModels` (SSR). Memoized selectors including factory `makeSelectModelById` for multi-ID subscribers.

---

## Data model

**Database tables** (Supabase, `ai` schema — renamed/canonicalized 2026-07-02 "AI-catalog reshape", was flat `public.ai_*`)
- `ai.model_definition` (was `ai.model`) — master registry row. Columns include `id`, `name`, `common_name`, `provider`, `model_provider`, `model_class`, `context_window`, `max_tokens`, `is_deprecated`, `is_primary`, `is_premium`, two self-FK columns `mid_fallback_id` + `guest_fallback_id` (see Tier fallbacks below), and JSONB blobs: `capabilities`, `controls`, `constraints`, `pricing`, `endpoints`.
- `ai.provider` — provider catalog (Anthropic, OpenAI, Groq, …) + `provider_models_cache` JSONB (last live fetch from provider API).
- `ai.endpoint` — endpoint rows referenced by model.
- `ai.voices` — TTS voice catalog (provider-agnostic), canonicalized alongside the reshape; consumed by `features/podcasts/generator/voiceCatalog.ts`, not this feature.
- Referenced by (read side): `agent.definition.model_id` / `agent.template.model_id` (+ `model_tiers.primary_model_id`). The old `public.prompts`/`prompt_builtins`/`agx_agent`/`agx_agent_templates` were migrated into `agent.definition`/`agent.template` and are now `graveyard.*` — no live reads against them.

**Added in the reshape, now with full CRUD (2026-07-03):**
- `ai.service` — a callable route (translator/wire-format token consumed by matrx-ai; internal name, base URL, auth ref, controls, request defaults). Managed at `/administration/ai-models/services` (`ServicesContainer`/`ServiceTable`/`ServiceForm`).
- `ai.offering` — `model_id × service_id` = the actual callable unit; per-service pricing/availability/capability overrides over `model_definition`. Managed at `/administration/ai-models/offerings` (`OfferingsContainer`, Manage tab; reuses `ModelPricingEditor` for the pricing tiers and `AdminAuditTable` for the dense grid).
- `ai.setting` — canonical settings vocabulary (temperature, reasoning_effort, …). Managed at `/administration/ai-models/settings` (`SettingsContainer`/`SettingTable`/`SettingForm`). **Still not wired as the render source for the model Constraints/Controls UI** — that architectural switch (controls rendering from `ai.setting` instead of ad hoc per-model `controls` JSONB) remains a separate, unstarted initiative; this CRUD only gives admins visibility/management of the vocabulary rows.
- `ai.model_offering` (view) — joins `offering` + `service` + `model_definition` into a user-facing row with points-based pricing (`points_per_million_input/output/cached_input`). Surfaced read-only in the Offerings page's Coverage tab, alongside a computed gap list of models with zero offerings.
- `ai.model_definition.model_provider` (FK → `ai.provider.id`) is now the **sole** way to set a model's provider — `AiModelForm.tsx`'s free-text Provider input was removed; the plain-text `provider` column is derived from the selected provider's name on save, never hand-typed. A backfill migration (`migrations/ai_catalog_provider_backfill.sql`) fixed 33 previously-null and ~10 previously-mis-assigned `model_provider` rows and added the providers that existed only as free text (Black Forest, ByteDance, ElevenLabs, Ideogram, Kuaishou, Luma, MiniMax, Recraft, Runway, Together, WAN).
- All four new CRUD screens home newly-created rows in the global system org via `resolveSystemOrgId()` (`lib/organizations/systemOrg.ts`) — **do not** rely on the `_stamp_org_default` trigger for these tables; it defaults to the *creating user's personal org*, not the system org, which would mis-home new catalog rows relative to the existing system-owned seed data.

**Key types** (`features/ai-models/types.ts`)
- `AiModel` — `AiModelRow` with JSONB columns narrowed to `ControlsSchema | null`, `ModelConstraint[] | null`, `PricingTier[] | null`, `string[] | null` (endpoints), capabilities record.
- `AiProvider` — provider row with `provider_models_cache: ProviderModelsCache | null`.
- `PricingTier` — `{ max_tokens, input_price, output_price, cached_input_price, usage_basis?, note? }`. `usage_basis` is the **billing unit** the prices map to (`null`/absent = standard $/1M-token billing; other values: per-image, per-second, per-character, …). The full taxonomy + per-basis price labels + validation live in `features/ai-models/usageBasis.ts`, a **mirror of the matrx-ai server SSOT** (`matrx_ai/config/usage_config.py::USAGE_BASIS_SPECS`).
- `ControlsSchema = Record<string, ControlParam>` — per-field param definitions (type, min/max, default, allowed, enum, required).
- `ModelConstraint` — discriminated union:
  - `UnconditionalConstraint`: `{ id, rule: 'required'|'fixed'|'min'|'max'|'one_of'|'forbidden', field, value?, severity, message }`
  - `ConditionalConstraint`: `{ id, when: FieldCondition, require: FieldCondition, severity, message }` where `FieldCondition = { field, op: ConditionOp, value? }` and `ConditionOp = eq|neq|gt|gte|lt|lte|in|not_in|exists|not_exists`
  - `isConditionalConstraint(c)` discriminates by presence of `when`+`require` vs `rule`+`field`
- `AIModelRecord` (registry slice) — `AIModelRow & { _fetchType: 'options' | 'full' }`. Status only upgrades; a `'full'` record is never downgraded.
- Audit types (`audit/auditTypes.ts`): `CapabilityKey` (20 canonical capability keys — `text_input`, `function_calling`, `streaming`, `vision`, `structured_output`, …), `AuditRuleConfig`, `ModelAuditResult`.

---

## Key flows

### (a) Adding / editing a model in the registry

1. Admin opens `/administration/ai-models/`. `AiModelsContainer` calls `aiModelService.fetchAll()` + `fetchProviders()`.
2. Clicks "+ new" → `AiModelDetailPanel` opens in create mode with an empty `AiModelForm`.
3. On save: `aiModelService.create(insert)` inserts into `ai.model_definition`. The new row is prepended in component state and becomes the selected record.
4. Edit path uses `aiModelService.update(id, patch)` — returns the updated row; `handleSaved` replaces in list. JSON fields (`controls`, `constraints`, `pricing`, `endpoints`, `capabilities`) are edited via dedicated sub-editors in tabs.
5. Cache invalidation: `POST /api/ai-models/revalidate` clears the SSR cache tag; the client Redux registry is refreshed on next `fetchModelOptions` / `fetchModelById`.

### (b) Setting constraints on a model

1. In `AiModelDetailPanel`, the **Constraints** tab mounts `ConstraintsEditor` (spec: `CONSTRAINTS-EDITOR-SPEC.md`).
2. Two add buttons: `[+ Add Simple]` → `UnconditionalConstraint`, `[+ Add Conditional]` → `ConditionalConstraint`. Each row gets a generated `id`, a severity (`error`/`warning`/`info`), and a `message`.
3. Value inputs are rendered dynamically by rule/op: hidden for `required`/`forbidden`/`exists`/`not_exists`, number for `min`/`max`/`gt`/`gte`/`lt`/`lte`, chip input for `one_of`/`in`/`not_in`, auto-detected for `fixed`/`eq`/`neq`. Field dropdowns pull suggestions from `KNOWN_CONTROLS` but accept arbitrary keys.
4. `[Raw JSON ↔]` toggle swaps to `EnhancedEditableJsonViewer` for bulk edits (same pattern as `ControlsEditor`).
5. Save: `onSave(constraints) → aiModelService.update(model.id, { constraints })`. Server-side validation against agent settings at call time treats the array as the source of truth.

### (c) Model selection in the Agent Builder

1. Builder renders `AgentModelConfiguration` / `AgentSettingsCore`, which mount `SmartModelSelect` (`features/ai-models/components/smart/SmartModelSelect.tsx`).
2. `SmartModelSelect` calls `useModels()` → `fetchModelOptions` thunk populates `modelRegistry` with `_fetchType:'options'` records. Dropdown renders from `selectModelOptions`.
3. On pick, `onValueChange(modelId)` dispatches `setAgentField({ field: 'modelId', value: modelId })` on the `agentDefinition` slice. The agent row stores the ID in `agent.definition.model_id`; converters map it back as `modelId` (`features/agents/redux/agent-definition/converters.ts`).
4. For controls/context_window/max_tokens/etc., `SmartModelConfigs` calls `useModelFull(modelId)` — triggers `fetchModelById` and returns the `'full'` record only once loaded.
5. At invocation time, the Builder ships the full agent definition (including `modelId`) to `POST /prompts`; Runner/Chat/Shortcut/App ship only the agent ID, and the server resolves the model row.

### (d) Audit — who changed what / data quality

1. `/administration/ai-models/audit` mounts `ModelAuditDashboard`. It pulls `aiModelService.fetchAll()`, filters deprecated out by default, runs `runAudit(models, rules)` against `DEFAULT_AUDIT_RULES`.
2. Tabs (`overview`, `core_fields`, `pricing`, `capabilities`, `configurations`) show per-category failures. `AuditRulesConfig` lets admins tune thresholds live (client-only state).
3. Inline fixes: each row has a quick-edit that calls `aiModelService.patchField(id, field, value)` or `bulkPatchField(patches)`; local `models` state is updated via `handleModelUpdated`.
4. Deprecated-reference cleanup: `DeprecatedModelsAudit` uses `aiModelService.fetchUsage(id)` to find every builtin/agent/template still pointing at a deprecated model (against `agent.definition`/`agent.template` — `prompts`/`prompt_builtins` are graveyarded no-ops), then `replaceModelInBuiltins` / `replaceModelInAgents` / `replaceModelInAgentTemplates` to rewrite `model_id` (and merge `settings->model_id`) in one pass.
5. Provider sync: `/administration/ai-models/provider-sync` → `POST /api/ai-models/provider-sync` fetches live model lists from provider APIs and caches in `ai.provider.provider_models_cache`; admins diff against registry to spot new or removed models. (Note: historical row-level change audit is not stored in-app — the dashboard is data-quality audit, not who-changed-what.)

---

## Invariants & gotchas

- **The `ai.model_definition` table is the single source of truth for model IDs, capabilities, pricing, and constraints.** Never hard-code provider model strings (`"claude-3-5-sonnet-…"`, `"gpt-4o"`) at call sites. Resolve via `useModelFull` or the server reader.
- **Agents reference models by `model_id` only.** `agent.definition.model_id` is a UUID pointing at `ai.model_definition.id` — never a provider string. Converters (`features/agents/redux/agent-definition/converters.ts`) preserve this on both read and write.
- **Constraints are advisory at the agent level and enforced server-side at call time.** The Builder/Runner UI MAY surface constraint violations as warnings but MUST NOT block save. The LLM-call layer runs `ModelConstraint[]` evaluation against the assembled request and rejects/downgrades per `severity`.
- **Registry records have two data levels.** `_fetchType: 'options'` only guarantees `id`, `name`, `common_name`, `provider`, `model_class`, `is_deprecated`. Anything else (`controls`, `context_window`, `pricing`, `constraints`, `capabilities`) requires `_fetchType: 'full'`. Always gate on `useModelFull()` or `selectModelFullyLoaded()` before reading those fields.
- **Status never downgrades.** Once a record is `'full'`, subsequent `fetchModelOptions` calls will not overwrite it back to `'options'`. The slice has explicit guards — do not bypass them.
- **`/api/ai-models` is CDN-cached for 12h** (`s-maxage=43200, stale-while-revalidate=86400`). Changes to the registry require `POST /api/ai-models/revalidate` to propagate to SSR consumers; in-app Redux reads use the client thunks and see changes immediately.
- **Deprecating a model is destructive at the reference layer.** Flip `is_deprecated=true` in `ai.model_definition`, then run the deprecated-audit migration helpers — do not rely on downstream features to catch stale references. `fetchUsage` is the canonical list of everything to migrate.
- **`replaceModelIn*` helpers patch both column and `settings->model_id`.** Some legacy rows store the model in either place. Always let the helper fetch-then-patch; never write raw SQL that ignores the JSONB path.
- **Provider-cache and registry are separate.** `ai.provider.provider_models_cache` is live provider data — not the canonical list. Adding a model to the registry is always an explicit create against `ai.model_definition`.
- **A media/audio model's `pricing.usage_basis` MUST match how its provider reports usage — wrong/absent basis silently mis-bills.** This is the bug class behind a gpt-image model billing $30/image (missing basis → synthetic per-image charge against a $/1M-token price), TTS billing $0 (units never populated), and ElevenLabs billing 1,000,000× too little ($/character entered as $/1M-character). The pricing editor (`ModelPricingEditor`) now requires a basis per tier, labels each price field with its real unit, and surfaces inline errors via `validatePricingTiers` (`usageBasis.ts`) — the same checks the server runs in `scripts/validate_model_pricing.py` (loud drift guard) and `matrx_ai.config.usage_config.validate_model_pricing`. "Is this a media model" is derived from the canonical `capabilities` shape (`isMediaModel`), NOT from the dead `api_class` column. Token-billed media models (gpt-image-*, Gemini native image, Gemini TTS) legitimately use no basis and are listed in `TOKEN_BILLED_MEDIA_MODEL_PATTERNS` — 🔴 a per-model fact that no column records; the durable fix is a `token_billed` boolean on `ai.offering`/`ai.service`, after which those patterns must be deleted. **When adding a media model, pick the basis; never leave it on "Token" for a non-token-billed media model.**

---

## Tier fallbacks — `mid_fallback_id` + `guest_fallback_id`

Two self-FKs on `ai.model_definition` let admins declare what the aidream backend should substitute when the caller is past a tier:

- **`mid_fallback_id`** — picked when an authenticated user is past their soft limit. Today this is plumbed but not enforced; the column captures the intent so the eventual quota gate can read it without further schema changes.
- **`guest_fallback_id`** — picked when the caller is unauthenticated (`X-Fingerprint-ID` header from the matrx-extend Chrome extension or any future surface). Aidream's `swap_model_for_auth_tier` runs inside `prepare_agent_run` and silently rewrites `config.model`. The original is stashed on the run's `ctx.metadata['original_model']`.

Both default to `NULL`, which means "no swap; keep the agent's declared model". Set them for premium models that shouldn't run for free (Opus → Haiku for guests, Opus → Sonnet for paying users at limit; GPT-5/4o → gpt-4.1-mini for guests; Gemini Pro → Gemini 3 Flash Preview, etc.).

**Editing**: every model row in `AiModelDetailPanel` has Mid-tier Fallback + Guest Fallback Selects under the Flags section. The dropdowns are grouped by provider, exclude the current model (no self-references) and deprecated rows. Choose "— no swap —" to clear the field.

**Migration**: aidream `db/migrations/0045_guest_mode_and_model_tiers.sql` adds the columns + a `cx_user_usage_summary` table + an `AFTER UPDATE OF completed_at` trigger on `cx_user_request` that maintains rolling 6h/24h usage windows per user (so future enforcement is O(1)).

**TS regen**: until `pnpm db:generate` refreshes `types/database.types.ts`, the two columns are added to the augmented `AiModel` type in `features/ai-models/types.ts` and the detail panel's save path casts through `unknown`. Drop those casts after the next regen.

---

## Related features

- **Depends on:** `utils/supabase/*` (client, server, admin/script clients), `types/database.types` (generated Supabase types)
- **Depended on by:** `features/agents/` (Builder model picker, settings, runtime resolution) via `agent.definition`/`agent.template`. The legacy `features/prompts/`/`features/prompt-builtins/` consumers are gone — those tables are graveyarded.
- **Cross-links:**
  - [`features/agents/FEATURE.md`](../agents/FEATURE.md) — consumer of the registry
  - [`features/agents/docs/AGENT_BUILDER.md`](../agents/docs/AGENT_BUILDER.md) — Builder flow that surfaces `SmartModelSelect`
  - [`features/ai-models/CONSTRAINTS-EDITOR-SPEC.md`](./CONSTRAINTS-EDITOR-SPEC.md) — full spec for the constraints tab

---

## Current work / migration state

Configuration surface is stable on the new `ai.model_definition`/`ai.provider`/`ai.endpoint` shape (2026-07-02 rename, fully repointed), and now also fully covers `ai.service`/`ai.offering`/`ai.setting` CRUD (2026-07-03). No breaking changes planned to `ModelConstraint` shape.

**Remaining gap (unstarted, not a bug):** switching the Builder/Constraints controls-rendering UI to read from `ai.setting`'s canonical vocabulary instead of ad hoc per-model `controls` JSONB. `ai.setting` now has full admin CRUD, but nothing in the Builder or model form consumes it as a render source yet.

---

## Change log

- `2026-07-05` — **Admin deprecated-model replace bypasses RLS.** `replaceModelIn*` helpers silently no-op'd when PostgREST UPDATE matched 0 rows (admin lacks editor on another user's agent). New super-admin route `POST /api/admin/ai-models/replace-references` + `features/ai-models/server/replace-model-references.ts` (admin client, verifies row counts, patches `model_tiers.default` + nested tier `model_id`). `aiModelService.replaceModelReferences()` is the canonical single call; usage/deprecated audits switched to it. `fetchUsage` OR filter fixed (`model_tiers->>default`, was stale `primary_model_id`). `iam.apply_rls`'s generated `std_insert` policy (used by every `'system'`-variant canonical table, including `ai.model_definition` itself) only allowed `organization_id IS NULL OR iam.has_org_access(organization_id)` — and `iam.system_orgs` has zero members by design, so NO admin could ever INSERT a new row explicitly homed in the system org; every existing system-catalog row (across this table and others) was seeded via service-role migration, never through the app. `iam.has_access` already had the correct bypass for UPDATE/DELETE/SELECT (system-org row + `is_super_admin()` ⇒ allowed) — `migrations/apply_rls_super_admin_system_insert.sql` adds the identical bypass to the INSERT check and re-applies RLS to `ai.provider/service/offering/setting/model_definition`. Purely additive; re-verified `iam.canonical_certify_ok` stays `true` on all five. Without this, every "Create" button below (including the pre-existing "+ new model" one) would 42501 the moment it tried to home a new row in the system org.
- `2026-07-03` — Admin UI audit found the reshape's relational layer was half-wired: `AiModelForm.tsx` still had a free-text Provider input living alongside the `model_provider` FK select (both independently editable, nothing kept them in sync — the root cause of visible drift), and `ai.service`/`ai.offering`/`ai.setting` had zero admin surface despite holding 23/188/106 real rows. Fixed: (1) `migrations/ai_catalog_provider_backfill.sql` added the 11 providers that existed only as free text and re-derived every `model_provider` FK from the free-text column, fixing 33 null and ~10 mis-assigned rows; (2) removed the free-text Provider input from `AiModelForm.tsx` — `provider` is now derived from the selected `model_provider`'s name on save, never hand-typed; (3) built full CRUD for all three previously-unmanaged tables: `/administration/ai-models/providers`, `/services`, `/offerings` (+ a Coverage tab reporting the `ai.model_offering` view and models with zero offerings), `/settings` — all registered in `features/admin/constants/admin-categories.ts`. New rows on all four screens are homed via `resolveSystemOrgId()`, not the `_stamp_org_default` trigger (see Data model note above for why).
- `2026-07-02` — AI-catalog reshape doc sync + drift cleanup. `ai.model` → `ai.model_definition` rename (plus new `ai.service`/`ai.offering`/`ai.setting` tables + `ai.model_offering` view) was already fully repointed in code across prior commits, sitting unpushed on local `main` — production was still on stale deployed code, throwing `PGRST205: ai.model not found`, not a code bug. Separately found and fixed a real drift: the checked-in `migrations/get_ssr_shell_data_rpc.sql` / `get_ssr_agent_shell_data_rpc.sql` still said `ai.model` while the live DB functions had already been patched to `ai.model_definition` out of band — synced both files to the live bodies, re-applied (no-op) via Supabase MCP, updated `_schema_migrations` ledger checksums. Deleted two dead code paths modeling the old flat shape: `lib/api/ai-models.ts` (unused duplicate fetch path) and `features/recipes/view-setup/` (dead sub-feature, hand-rolled `AISettings` type mirroring graveyarded `ai_settings`).
- `2026-06-30` — Provider sync: Copy for AI at row / provider (status-filtered dropdown) / page levels via `ProviderSyncCopyForAi`; in-code excluded-model registry (`constants/excluded-provider-models.ts`) marks legacy provider IDs as "Excluded" instead of "Not in DB".
- `2026-06-30` — Provider sync dashboard: sortable column headers per provider table; default sort is release date descending via `compareTimestamps` (newest models first).
- `2026-06-30` — Provider sync: dropped retired `anthropic-beta: models-2024-09-01` header; Anthropic `/v1/models` is GA and only needs `anthropic-version`. Added `usage_basis` (+ `note`) to `PricingTier`; new `features/ai-models/usageBasis.ts` (taxonomy + `validatePricingTiers`, mirrors the matrx-ai server SSOT). `ModelPricingEditor` now has a per-tier billing-basis dropdown, dynamic per-unit price labels, and inline validation. Closes the root cause of the media-billing bugs (freeform pricing JSONB with no guardrail). Server side: `usage_config.USAGE_BASIS_SPECS`, computed megapixel/second billing, and `scripts/validate_model_pricing.py` drift guard.
- `2026-05-17` — Added Tier Fallbacks section + form Selects in `AiModelDetailPanel` for `mid_fallback_id` and `guest_fallback_id` (aidream migration 0045). Powers the guest-mode model swap for the matrx-extend Chrome extension.
- `2026-04-25` — Removed `features/ai-models/index.ts`; admin routes and provider-sync use direct imports to `components/*` and `service.ts` (same exports as before).
- `2026-04-22` — claude: initial doc.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature — especially to the `ai.model_definition` schema, `ModelConstraint` shape, registry slice fetch contracts, or the constraints editor — update this file's Entry points / Data model / Invariants sections and append to the Change log. Stale FEATURE.md cascades across parallel agents working on Builder, audits, and model picking.
