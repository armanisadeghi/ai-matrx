# FEATURE.md — `ai-models`

**Status:** `stable`
**Tier:** `2`
**Last updated:** `2026-04-25`

---

## Purpose

The catalog and configuration surface for every LLM available to the product — model identity (id, provider, class, deprecated flag), capabilities, controls schema, pricing tiers, and declarative runtime constraints. Agents (and legacy prompts/builtins) reference rows from this registry by ID; the Agent Builder uses it as a picker.

---

## Entry points

**Imports:** There is no root `index.ts` barrel — import from `components/…`, `service.ts`, `types.ts`, `hooks/…`, `redux/…`, `audit/…`, and `server/…` as needed.

**Routes**
- `app/(authenticated)/(admin-auth)/administration/ai-models/page.tsx` — admin model registry (table + detail panel + tab presets)
- `app/(authenticated)/(admin-auth)/administration/ai-models/audit/page.tsx` — `ModelAuditDashboard` (data-quality rules across models)
- `app/(authenticated)/(admin-auth)/administration/ai-models/deprecated-audit/page.tsx` — deprecated-reference cleanup
- `app/(authenticated)/(admin-auth)/administration/ai-models/provider-sync/page.tsx` — pull live model lists from provider APIs

**API endpoints**
- `GET /api/ai-models` — cached (12h s-maxage, 24h SWR) list of active models for client/SSR readers
- `POST/GET /api/ai-models/provider-sync` — fetch-and-cache model lists from Anthropic / OpenAI / Groq APIs into `ai_provider.provider_models_cache`
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
- `features/ai-models/service.ts` — `aiModelService`: client-side CRUD (`fetchAll`, `create`, `update`, `remove`, `bulkPatchField`, `patchField`), provider-cache ops, usage lookup (`fetchUsage` across `prompts`/`prompt_builtins`/`agx_agent`/`agx_agent_templates`), and deprecation-migration helpers (`replaceModelIn*`)
- `features/ai-models/server/ai-models-server.ts` — `fetchAIModels()` (React-cached server reader for SSR shells)

**Redux slice**
- `features/ai-models/redux/modelRegistrySlice.ts` — `modelRegistry` slice: normalized `entities` + `activeIds`/`deprecatedIds`, `fetchScope`, per-record `_fetchType` (`'options' | 'full'`). Thunks: `fetchModelOptions`, `fetchModelById`. Action: `hydrateModels` (SSR). Memoized selectors including factory `makeSelectModelById` for multi-ID subscribers.

---

## Data model

**Database tables** (Supabase)
- `ai_model` — master registry row. Columns include `id`, `name`, `common_name`, `provider`, `model_provider`, `model_class`, `api_class`, `context_window`, `max_tokens`, `is_deprecated`, `is_primary`, `is_premium`, two self-FK columns `mid_fallback_id` + `guest_fallback_id` (see Tier fallbacks below), and JSONB blobs: `capabilities`, `controls`, `constraints`, `pricing`, `endpoints`.
- `ai_provider` — provider catalog (Anthropic, OpenAI, Groq, …) + `provider_models_cache` JSONB (last live fetch from provider API).
- `ai_endpoint` — endpoint rows referenced by model.
- Referenced by (read side): `prompts.model_id`, `prompt_builtins.model_id`, `agx_agent.model_id` (+ `model_tiers.primary_model_id`), `agx_agent_templates.model_id`.

**Key types** (`features/ai-models/types.ts`)
- `AiModel` — `AiModelRow` with JSONB columns narrowed to `ControlsSchema | null`, `ModelConstraint[] | null`, `PricingTier[] | null`, `string[] | null` (endpoints), capabilities record.
- `AiProvider` — provider row with `provider_models_cache: ProviderModelsCache | null`.
- `PricingTier` — `{ max_tokens, input_price, output_price, cached_input_price }`.
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
3. On save: `aiModelService.create(insert)` inserts into `ai_model`. The new row is prepended in component state and becomes the selected record.
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
3. On pick, `onValueChange(modelId)` dispatches `setAgentField({ field: 'modelId', value: modelId })` on the `agentDefinition` slice. The agent row stores the ID in `agx_agent.model_id`; converters map it back as `modelId` (`features/agents/redux/agent-definition/converters.ts`).
4. For controls/context_window/max_tokens/etc., `SmartModelConfigs` calls `useModelFull(modelId)` — triggers `fetchModelById` and returns the `'full'` record only once loaded.
5. At invocation time, the Builder ships the full agent definition (including `modelId`) to `POST /prompts`; Runner/Chat/Shortcut/App ship only the agent ID, and the server resolves the model row.

### (d) Audit — who changed what / data quality

1. `/administration/ai-models/audit` mounts `ModelAuditDashboard`. It pulls `aiModelService.fetchAll()`, filters deprecated out by default, runs `runAudit(models, rules)` against `DEFAULT_AUDIT_RULES`.
2. Tabs (`overview`, `core_fields`, `pricing`, `api_class`, `capabilities`, `configurations`) show per-category failures. `AuditRulesConfig` lets admins tune thresholds live (client-only state).
3. Inline fixes: each row has a quick-edit that calls `aiModelService.patchField(id, field, value)` or `bulkPatchField(patches)`; local `models` state is updated via `handleModelUpdated`.
4. Deprecated-reference cleanup: `DeprecatedModelsAudit` uses `aiModelService.fetchUsage(id)` to find every prompt/builtin/agent/template still pointing at a deprecated model, then `replaceModelInPrompts` / `replaceModelInBuiltins` / `replaceModelInAgents` / `replaceModelInAgentTemplates` to rewrite `model_id` (and merge `settings->model_id`) in one pass.
5. Provider sync: `/administration/ai-models/provider-sync` → `POST /api/ai-models/provider-sync` fetches live model lists from provider APIs and caches in `ai_provider.provider_models_cache`; admins diff against registry to spot new or removed models. (Note: historical row-level change audit is not stored in-app — the dashboard is data-quality audit, not who-changed-what.)

---

## Invariants & gotchas

- **The `ai_model` table is the single source of truth for model IDs, capabilities, pricing, and constraints.** Never hard-code provider model strings (`"claude-3-5-sonnet-…"`, `"gpt-4o"`) at call sites. Resolve via `useModelFull` or the server reader.
- **Agents reference models by `model_id` only.** `agx_agent.model_id` is a UUID pointing at `ai_model.id` — never a provider string. Converters (`features/agents/redux/agent-definition/converters.ts`) preserve this on both read and write.
- **Constraints are advisory at the agent level and enforced server-side at call time.** The Builder/Runner UI MAY surface constraint violations as warnings but MUST NOT block save. The LLM-call layer runs `ModelConstraint[]` evaluation against the assembled request and rejects/downgrades per `severity`.
- **Registry records have two data levels.** `_fetchType: 'options'` only guarantees `id`, `name`, `common_name`, `provider`, `model_class`, `is_deprecated`. Anything else (`controls`, `context_window`, `pricing`, `constraints`, `capabilities`) requires `_fetchType: 'full'`. Always gate on `useModelFull()` or `selectModelFullyLoaded()` before reading those fields.
- **Status never downgrades.** Once a record is `'full'`, subsequent `fetchModelOptions` calls will not overwrite it back to `'options'`. The slice has explicit guards — do not bypass them.
- **`/api/ai-models` is CDN-cached for 12h** (`s-maxage=43200, stale-while-revalidate=86400`). Changes to the registry require `POST /api/ai-models/revalidate` to propagate to SSR consumers; in-app Redux reads use the client thunks and see changes immediately.
- **Deprecating a model is destructive at the reference layer.** Flip `is_deprecated=true` in `ai_model`, then run the deprecated-audit migration helpers — do not rely on downstream features to catch stale references. `fetchUsage` is the canonical list of everything to migrate.
- **`replaceModelIn*` helpers patch both column and `settings->model_id`.** Some legacy rows store the model in either place. Always let the helper fetch-then-patch; never write raw SQL that ignores the JSONB path.
- **Provider-cache and registry are separate.** `ai_provider.provider_models_cache` is live provider data — not the canonical list. Adding a model to the registry is always an explicit create against `ai_model`.

---

## Tier fallbacks — `mid_fallback_id` + `guest_fallback_id`

Two self-FKs on `ai_model` let admins declare what the aidream backend should substitute when the caller is past a tier:

- **`mid_fallback_id`** — picked when an authenticated user is past their soft limit. Today this is plumbed but not enforced; the column captures the intent so the eventual quota gate can read it without further schema changes.
- **`guest_fallback_id`** — picked when the caller is unauthenticated (`X-Fingerprint-ID` header from the matrx-extend Chrome extension or any future surface). Aidream's `swap_model_for_auth_tier` runs inside `prepare_agent_run` and silently rewrites `config.model`. The original is stashed on the run's `ctx.metadata['original_model']`.

Both default to `NULL`, which means "no swap; keep the agent's declared model". Set them for premium models that shouldn't run for free (Opus → Haiku for guests, Opus → Sonnet for paying users at limit; GPT-5/4o → gpt-4.1-mini for guests; Gemini Pro → Gemini 3 Flash Preview, etc.).

**Editing**: every model row in `AiModelDetailPanel` has Mid-tier Fallback + Guest Fallback Selects under the Flags section. The dropdowns are grouped by provider, exclude the current model (no self-references) and deprecated rows. Choose "— no swap —" to clear the field.

**Migration**: aidream `db/migrations/0045_guest_mode_and_model_tiers.sql` adds the columns + a `cx_user_usage_summary` table + an `AFTER UPDATE OF completed_at` trigger on `cx_user_request` that maintains rolling 6h/24h usage windows per user (so future enforcement is O(1)).

**TS regen**: until `pnpm db:generate` refreshes `types/database.types.ts`, the two columns are added to the augmented `AiModel` type in `features/ai-models/types.ts` and the detail panel's save path casts through `unknown`. Drop those casts after the next regen.

---

## Related features

- **Depends on:** `utils/supabase/*` (client, server, admin/script clients), `types/database.types` (generated Supabase types)
- **Depended on by:** `features/agents/` (Builder model picker, settings, runtime resolution), `features/prompts/` + `features/prompt-builtins/` (legacy consumers — being retired per `features/agents/migration/`)
- **Cross-links:**
  - [`features/agents/FEATURE.md`](../agents/FEATURE.md) — consumer of the registry
  - [`features/agents/docs/AGENT_BUILDER.md`](../agents/docs/AGENT_BUILDER.md) — Builder flow that surfaces `SmartModelSelect`
  - [`features/ai-models/CONSTRAINTS-EDITOR-SPEC.md`](./CONSTRAINTS-EDITOR-SPEC.md) — full spec for the constraints tab

---

## Current work / migration state

Configuration surface is stable. The consumer side is mid-migration: prompt/builtins references to `model_id` are being collapsed into agent references as part of the agents migration (`features/agents/migration/MASTER-PLAN.md`). No breaking changes planned to the `ai_model` schema or to `ModelConstraint` shape.

---

## Change log

- `2026-05-17` — Added Tier Fallbacks section + form Selects in `AiModelDetailPanel` for `mid_fallback_id` and `guest_fallback_id` (aidream migration 0045). Powers the guest-mode model swap for the matrx-extend Chrome extension.
- `2026-04-25` — Removed `features/ai-models/index.ts`; admin routes and provider-sync use direct imports to `components/*` and `service.ts` (same exports as before).
- `2026-04-22` — claude: initial doc.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this feature — especially to the `ai_model` schema, `ModelConstraint` shape, registry slice fetch contracts, or the constraints editor — update this file's Entry points / Data model / Invariants sections and append to the Change log. Stale FEATURE.md cascades across parallel agents working on Builder, audits, and model picking.
