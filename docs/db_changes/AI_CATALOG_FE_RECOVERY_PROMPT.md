# AI Model Catalog — Frontend State: Recovery + Consolidation

> **This doc has two jobs.** (1) It is the **recovery reference** for the live `ai.model_definition`
> column-drop reshape (still true, still load-bearing). (2) It is the **consolidation brief** for
> collapsing every model-data path in the frontend onto **one slice, one set of actions and
> selectors, one picker** — with an admin variant. Part A is the DB reality. Part B is the target
> architecture. Part C is the current (partially consolidated) state and the worklist. The appendix is
> the impacted-file inventory + live usage map.
>
> **This is an interim doc.** Once the consolidation lands it gets rewritten into a clean
> `features/ai-models/FEATURE.md`-anchored reference. Keep it accurate while the work is in flight;
> do not polish it.

---

## Part A — The DB reality (LIVE on `txzxabzwovsujtloxrus`)

A live migration on Supabase project `txzxabzwovsujtloxrus` (this app's DB) **dropped four columns**
from `ai.model_definition` and moved each fact elsewhere. The change is LIVE NOW. Any code still
reading a dropped column throws a PostgREST **400 (42703 "column does not exist")**.

### What `ai.model_definition` no longer has
`provider` (free text), `endpoints`, `pricing`, `capabilities_pre_canonical`.
(`api_class`, `controls`, `constraints`, `model_class`, `model_provider`, `capabilities` still exist.)

Each dropped fact now lives elsewhere:
- **maker / brand** = `model_provider` FK → `ai.provider.name` (NOT the old free-text `provider`)
- **routing** = `ai.offering` → `ai.service.wire_format` (decided server-side; the FE never routes)
- **pricing** = `ai.offering.pricing`

### The two read surfaces (views)
- **`ai.model_public`** (users; anon + authenticated) — resolved names, **masked** service, points,
  no secrets. Columns: `id, name, common_name, model_class, capabilities, context_window,
  max_tokens, is_primary, is_premium, mid_fallback_id, guest_fallback_id, release_date, description,
  maker, service_name, usage_basis, token_billed, points_per_million_input,
  points_per_million_output`.
- **`ai.model_admin`** (admins only) — adds `offering_id, provider_model_id, pricing (raw $), vendor,
  wire_format, service_internal_name, service_display_name, service_has_base_url, is_deprecated`.
  > ⚠️ **GRANT GAP (found 2026-07-09):** the `sb_secret_*` role that `createAdminClient()` uses
  > **cannot** read `model_admin`/`model_public`/`model_offering`/`offering`/`service`
  > (`42501 permission denied`) — it only has `model_definition` + `provider` in the `ai` schema.
  > The views are granted to `authenticated`/`anon` (the app reads `model_public` fine), NOT to the
  > secret role. So the documented "reach `model_admin` via `service_role`" path is currently broken.
  > Fix = `GRANT SELECT ON ai.model_admin TO service_role;` (needs an MCP-authed session — the MCP was
  > unauthenticated when this was found). Until then, admin reads must go through the authenticated
  > client (super-admin RLS), and `model_admin`'s grant to `authenticated` is unverified.

### Routability is the invisible trap
A bare `model_definition` row is **not callable** — it needs ≥1 available `ai.offering`. `ai.model_offering`
is the user-facing join of available offerings × active services × non-deprecated models. If a model
isn't there, `resolve_call_profile` raises. **The canonical options fetch filters by `model_offering`**
(this is why a model can look "set up fine" in admin while every call fails).

### SSR
`get_ssr_shell_data` and `get_ssr_agent_shell_data` return `ai_models` rows that already include the
resolved **`maker`** field. Consumed by `utils/supabase/ssrShellData.ts` → `hydrateModels`.

> **Rule:** verify column/view shape against the live DB (Supabase MCP or direct query) before
> assuming. No shims, no `any`/`as any`/`@ts-ignore`, no hardcoded provider/model-name lists — the
> fact is in the DB. If a fact seems unavailable, STOP and report; never invent a fallback.

---

## Part B — The target architecture: one slice, one API, one picker

The goal is **exactly one canonical path** for model data on the consumer side, with a **thin admin
variant** for the CRUD/catalog-management surface. Nothing else reads models.

### The ONE slice — `features/ai-models/redux/modelRegistrySlice.ts`
Normalized entity registry (`entities: id → AIModelRecord`, `activeIds`, `deprecatedIds`,
`fetchScope`). Progressive detail: records upgrade `options → full`, never downgrade.

- **Actions (the only ones):**
  - `fetchModelOptions()` — lightweight dropdown options from `ai.model_public`, filtered to routable
    IDs via `ai.model_offering`. Guarded (skips if already loaded).
  - `fetchModelById(id)` — full record from `ai.model_definition`. Guarded (skips if already `full`).
  - `hydrateModels({ models, fetchType, fetchScope, lastFetched })` — SSR hydration path.
- **Selectors (the only ones):** `selectModelOptions`, `selectAllModelOptions`, `selectActiveModels`,
  `selectDeprecatedModels`, `selectAllModels`, `selectModelById` / `makeSelectModelById`,
  `selectModelLabelById`, `selectModelNameById`, `selectModelControls`, `selectModelFetchType`,
  `selectModelFullyLoaded`, and the readiness booleans (`selectActiveModelsReady`, …).
- **Consumption is via hooks, never raw dispatch/select in components:**
  `features/ai-models/hooks/useModels.ts` — `useModels`, `useModelOptions`, `useAllModelOptions`,
  `useDeprecatedModels`, `useAllModels`, `useModelFull(id)`, `useModelById(id)`, `useModelFetchType`.

### The ONE picker — `SmartModelSelect` (`features/ai-models/components/smart/SmartModelSelect.tsx`)
Self-wired: dispatches `fetchModelOptions` on mount, `fetchModelById` on value change, reads
`selectModelOptions`. Callers pass only `value` + `onValueChange` (+ optional `priorityValues`,
`disabled`, `className`, `placeholder`). **No component should render its own model `<Select>`.**
Wrapper components (override semantics, settings badges, etc.) compose `SmartModelSelect` — they do
not re-implement it.

### The admin variant — `features/ai-models/service.ts` (`aiModelService`)
The admin catalog surface (`/administration/ai/ai-models`) needs full CRUD across
`model_definition` / `provider` / `offering` / `service` and the admin-only fields. This is the
**sanctioned variant** — it goes through `aiModelService` (and `ai.model_admin` where masked fields
are needed), NOT the consumer registry slice. Two paths, one for each audience, no third path.

**Decision to confirm with Arman:** admin can either (a) keep `aiModelService` as a distinct
read/write service (current state — recommended, since admin needs raw/secret fields the public
view masks), or (b) fold admin reads into a `modelAdminRegistry` variant slice. Default = (a); do not
change without direction.

### Temporary: the model-picker Lab (data-validation, pre-bakeoff)
Built 2026-07-09 to prove the *data* for a rich picker before the ui-bakeoff. **Temporary — remove
when the bakeoff winner replaces `SmartModelSelect`.**
- `features/ai-models/hooks/useModelCatalog.ts` — self-contained hook (NOT the registry slice);
  `variant: "user"` reads `ai.model_public` (routable-filtered), `variant: "admin"` reads
  `ai.model_admin`. Loud on error (no silent fallback).
- `features/ai-models/components/lab/ModelPickerLab.tsx` — searchable, sortable picker with
  capability badges (input→output content types + feature flags), context window, pricing
  (points for user / vendor·wire_format + raw pricing for admin), and primary/premium/deprecated
  flags.
- Wired into `AgentModelConfiguration.tsx` behind a `Picker lab: off | user | admin` toggle.
- **Known live-test caveat:** the `user` variant is proven sound (the app already reads
  `model_public`). The `admin` variant depends on `ai.model_admin` being readable by the
  authenticated super-admin — unverified, and blocked for `service_role` (see the GRANT GAP above). If
  the admin toggle shows a `42501` permission error, that grant is the fix.

---

## Part C — Current state + the canonicalization worklist

### Already canonical (verified)
- `modelRegistrySlice` is the single consumer state store, with the full action/selector set above.
- `useModels` hook family wraps it.
- `SmartModelSelect` is consumed by `AgentModelConfiguration`, `ModelSelectorRow`, `RunModelPicker` /
  `QuickRunModelSelect`.
- Consumer fetches read the views (`ai.model_public`) + `ai.model_offering`; `maker` is resolved, no
  dropped column is read.

### Still fragmented — the worklist (kill these)
1. **`AgentModelConfiguration.tsx`** *(first target — flagged broken across the app)* — stale header
   comment claims "Uses AiModelSelect" (a component that no longer exists; canonical picker is
   `SmartModelSelect`). Verify it pins the agent default via `priorityValues` where appropriate and
   uses the canonical selectors only.
2. **`components/official/settings/primitives/SettingsModelPicker.tsx`** — reimplements its own
   `<Select>` instead of composing `SmartModelSelect`, and filters by
   `userPreferences.aiModels.activeModels`. Collapse onto `SmartModelSelect` with a filter/scope prop
   so the user-active subset is a picker option, not a second implementation.
3. **`features/agent-comparison/modes/model/components/ModelColumnHeader.tsx`** — inline dropdown off
   `selectModelOptions`. Collapse onto `SmartModelSelect`.
4. **Deprecated aliases in the slice** — `fetchActiveModels`, `fetchAvailableModels`,
   `selectAvailableModels`, `selectModelRegistryReady`. Remove once consumers are migrated.
5. **Stale `provider` comments** referencing the dropped column — `modelRegistrySlice.ts` (options
   docstrings ~L24, L118–119), `useModels.ts` (~L50 "provider"), any picker JSDoc. `provider` is
   gone; the field is `maker`.
6. **Direct `selectModelOptions` / `fetchModelOptions` consumers** that should be a hook or
   `SmartModelSelect` — `ConversationInput` (cx-chat + cx-conversation), `AgentViewContent`,
   `AgentSneakPeekModal`, `AgentSettingsCore`, agent-comparison thunks/columns. Audit each: if it
   just needs a picker, use `SmartModelSelect`; if it needs options data, use `useModelOptions`.
7. **`features/public-chat/components/ChatInputWithControls.tsx`** — the one picker NOT wired to the
   slice; takes `availableModels: AIModel[]` via **prop-drilling** with no page-level source found
   passing it. Wire it to `SmartModelSelect` / the registry.

### Redundant / dead fetch paths (there are ~7 DB reads of the same catalog — collapse to the two canonical ones)
- ✅ **DELETED 2026-07-09:** `features/ai-models/server/ai-models-server.ts` (`fetchAIModels`) had
  **zero consumers** — a duplicate `model_offering` + `model_definition` + `ai.provider` fetch. Gone.
- **Likely orphaned — verify then delete/repoint:** `app/api/ai-models/route.ts` (12h CDN-cached REST
  list) has **no live client consumer** (only a code-comment reference in cx-dashboard).
- **Bypasses the slice:** `features/cx-dashboard/service.ts#resolveAiModels` does its own
  `model_definition` + `provider` JS join. Admin surface, so it MAY stay on the admin variant — but it
  should read `ai.model_admin`, not re-join by hand.
- Keep only: (1) `modelRegistrySlice` thunks + SSR `hydrateModels` for consumers, (2) `aiModelService`
  for admin CRUD.

### Overlapping model-id STATE stores (reconcile, don't merge blindly)
- **Two `selectAgentModelId` selectors, name collision:** `features/agents/redux/agent-definition/selectors.ts`
  (the builder's draft agent) and `lib/redux/slices/agentCacheSlice.ts` (cached saved agent). Different
  sources of "the agent's model" — audit callers, rename one, document which is authoritative.
- **`instanceModelOverrides`** (per-conversation override) and **`agentSettings`** (pending model
  switch) hold model-id state derived from the registry but stored separately — correct by design
  (they're override/edit layers), but confirm they read labels/capabilities from the registry, never
  re-fetch.
- **`userPreferences.aiModels`** (`defaultModel`, `activeModels[]`, `inactiveModels[]`, `newModels[]`,
  with a hard-coded default UUID) is a **parallel per-user model list** unaware of the registry.
  Decide: should it become a *view/filter over* `modelRegistry` (the user's active subset) rather than
  a second catalog? The hard-coded default UUID is a defect regardless — the default belongs in the DB
  (`is_primary`), not a constant.

### Verification (every touched surface must load with zero 400s / zero dropped-column errors)
`/administration/ai/ai-models` (table, filter, detail Details/Controls/Constraints save, read-only
Pricing tab, "+ new" / clone), `/administration/ai/ai-models/audit`, `/administration/ai/ai-models/offerings`,
the **agent-builder model picker**, user **model preferences**, and the **cx-dashboard usage** pages
(model brand renders, not "Unknown").

---

## Recovery playbook (if the app is reported down on a model page)

0. **Reproduce first.** Open the failing page; capture the exact request in the network tab (look for
   400 / `42703` / `PGRST` on `.../rest/v1/model_definition?...`) and server logs. The captured error
   is truth; everything here is hypothesis.
1. **Regenerate types.** `pnpm db-types` — drops the 4 columns, adds the two views in
   `types/database.types.ts`.
2. **Hunt every reader** (`.select()` string literals are invisible to tsc):
   ```bash
   grep -rn '\.select(' features lib app --include=*.ts --include=*.tsx \
     | grep -iE '"[^"]*\b(provider|endpoints|pricing|api_class|capabilities_pre_canonical)\b'
   ```
   For each hit: does it target `ai.model_definition` (BAD — repoint) or `ai.provider` / `ai.offering`
   / an unrelated table (FINE)? `.from("model_definition").select("*")` is safe (it adapts). Then
   `pnpm type-check` and fix property-access reads of dropped columns. Repoint: maker →
   `model_provider`→`ai.provider.name` (pattern in `app/api/ai-models/route.ts`); pricing →
   `ai.offering.pricing` / `ai.model_admin`; routing → `ai.service.wire_format`.
3. **Check writes.** Any insert/update/upsert to `model_definition` carrying a dropped column KEY →
   400. Grep service/form/clone-dialog payloads. (`model_provider` is fine — it's kept.)
4. **Rebuild, load, verify** every surface in the Verification list above.

**Most likely root cause of "down":** stale build. If `git log --oneline -15` lacks the reshape
commits (maker resolution in `aiModelService`/SSR/`GET /api/ai-models`, picker on `ai.model_public`,
pricing editor removed, `PricingAuditTab` deleted, `AiModel`/`AIModelRecord` carrying `maker`), the
running app is on stale code — get onto current `main` and rebuild.

> **Note on "pricing editor removed":** `ModelPricingEditor.tsx` is NOT deleted — it was **repurposed
> to edit offering-level pricing** and is still imported/rendered by `offerings/OfferingForm.tsx`. The
> model *detail* Pricing tab is read-only (`OfferingPricingReadOnly`). `PricingAuditTab` IS deleted.

---

## Appendix 1 — Impacted file inventory (226 files — refresh before shipping)

> **Accuracy note:** this inventory was generated 2026-07-09 by ripgrep + directory `find`, so some
> entries are directory padding with zero catalog references — verified non-touchpoints:
> `cx-dashboard/components/{CxKpiCard,CxEmptyState,CxJsonViewer,CxDashboardErrorBoundary,CxCostVerificationModal}.tsx`,
> `cx-dashboard/utils/format.ts`, `agent-comparison/modes/settings/components/SettingsToolbar.tsx`.
> All other paths exist and are real. Re-run before shipping if you add new model-catalog surfaces:

```bash
rg -l --glob '*.{ts,tsx}' \
  'model_definition|model_public|model_admin|model_provider|capabilities_pre_canonical|@/features/ai-models|modelRegistrySlice|resolveAiModels|get_ssr_shell_data|ssrShellData|selectModelOptions|AIModelRecord|hydrateModels|schema\("ai"\)' \
  features app lib utils components actions types
find features/ai-models 'app/(admin)/administration/ai/ai-models' app/api/ai-models app/api/admin/ai-models features/cx-dashboard 'app/(admin)/administration/chat/cx-dashboard' -type f
```

### Types & generated schema (5)
- `types/database.types.ts`
- `types/generated/entity-types.generated.ts`
- `types/python-generated/api-types.ts`
- `types/python-generated/openapi.json`
- `types/reduxTypes.ts`

### Schema guard / tooling (3)
- `scripts/schema-check/current-schema.json`
- `scripts/dead-relations.json`
- `jest.setup.ts`

### Migrations — ai catalog & SSR shell RPCs (12)
- `migrations/ai_catalog_provider_backfill.sql`
- `migrations/ai_model_capabilities_canonical.sql`
- `migrations/apply_rls_super_admin_system_insert.sql`
- `migrations/communication_move_phase2.sql`
- `migrations/create_agent_context_menu_view.sql`
- `migrations/create_context_menu_unified_view.sql`
- `migrations/definer_rpc_ssr_shell_anon_revoke.sql`
- `migrations/drop_compat_shim_views_transition_batch.sql`
- `migrations/get_ssr_agent_shell_data_rpc.sql`
- `migrations/get_ssr_shell_data_rpc.sql`
- `migrations/ROLLBACK_compat_shim_views.sql`
- `migrations/voices_canonicalize_and_move_to_ai_schema.sql`

### API routes (4)
- `app/api/ai-models/route.ts`
- `app/api/ai-models/provider-sync/route.ts`
- `app/api/ai-models/revalidate/route.ts`
- `app/api/admin/ai-models/replace-references/route.ts`

### Admin routes — `/administration/ai/ai-models` (10)
- `app/(admin)/administration/ai/ai-models/layout.tsx`
- `app/(admin)/administration/ai/ai-models/page.tsx`
- `app/(admin)/administration/ai/ai-models/audit/page.tsx`
- `app/(admin)/administration/ai/ai-models/deprecated-audit/page.tsx`
- `app/(admin)/administration/ai/ai-models/offerings/page.tsx`
- `app/(admin)/administration/ai/ai-models/provider-sync/page.tsx`
- `app/(admin)/administration/ai/ai-models/providers/page.tsx`
- `app/(admin)/administration/ai/ai-models/services/page.tsx`
- `app/(admin)/administration/ai/ai-models/settings/page.tsx`
- `app/(admin)/administration/utilities/server-cache/page.tsx`

### Admin routes — cx-dashboard (brand/model resolution) (16)
- `app/(admin)/administration/chat/cx-dashboard/layout.tsx`
- `app/(admin)/administration/chat/cx-dashboard/page.tsx`
- `app/(admin)/administration/chat/cx-dashboard/CxDashboardLayoutClient.tsx`
- `app/(admin)/administration/chat/cx-dashboard/overview-content.tsx`
- `app/(admin)/administration/chat/cx-dashboard/usage/page.tsx`
- `app/(admin)/administration/chat/cx-dashboard/usage/usage-content.tsx`
- `app/(admin)/administration/chat/cx-dashboard/requests/page.tsx`
- `app/(admin)/administration/chat/cx-dashboard/requests/requests-content.tsx`
- `app/(admin)/administration/chat/cx-dashboard/requests/[id]/page.tsx`
- `app/(admin)/administration/chat/cx-dashboard/requests/[id]/request-detail-content.tsx`
- `app/(admin)/administration/chat/cx-dashboard/conversations/page.tsx`
- `app/(admin)/administration/chat/cx-dashboard/conversations/conversations-content.tsx`
- `app/(admin)/administration/chat/cx-dashboard/conversations/[id]/page.tsx`
- `app/(admin)/administration/chat/cx-dashboard/conversations/[id]/conversation-detail-content.tsx`
- `app/(admin)/administration/chat/cx-dashboard/errors/page.tsx`
- `app/(admin)/administration/chat/cx-dashboard/errors/errors-content.tsx`

### `features/ai-models` — core service, server, redux (59 files)
- `features/ai-models/FEATURE.md`
- `features/ai-models/CONSTRAINTS-EDITOR-SPEC.md`
- `features/ai-models/types.ts`
- `features/ai-models/service.ts`
- `features/ai-models/format.ts`
- `features/ai-models/usageBasis.ts`
- `features/ai-models/server/ai-models-server.ts`
- `features/ai-models/server/replace-model-references.ts`
- `features/ai-models/redux/modelRegistrySlice.ts`
- `features/ai-models/hooks/useModels.ts`
- `features/ai-models/hooks/useTabUrlState.ts`
- `features/ai-models/capabilities/types.ts`
- `features/ai-models/capabilities/parse.ts`
- `features/ai-models/constants/excluded-provider-models.ts`
- `features/ai-models/utils/filterUtils.ts`
- `features/ai-models/utils/model-normalizer.ts`
- `features/ai-models/utils/providerSyncComparison.ts`
- `features/ai-models/utils/serializeProviderSyncForAi.ts`
- `features/ai-models/audit/auditTypes.ts`
- `features/ai-models/audit/AuditOverviewTab.tsx`
- `features/ai-models/audit/AuditRulesConfig.tsx`
- `features/ai-models/audit/AuditSummaryBar.tsx`
- `features/ai-models/audit/AuditTableShell.tsx`
- `features/ai-models/audit/CapabilitiesAuditTab.tsx`
- `features/ai-models/audit/CoreFieldsAuditTab.tsx`
- `features/ai-models/audit/ModelAuditDashboard.tsx`
- `features/ai-models/audit/ModelDetailSheet.tsx`
- `features/ai-models/components/AddProviderModelDialog.tsx`
- `features/ai-models/components/AiModelDetailPanel.tsx`
- `features/ai-models/components/AiModelFilterBar.tsx`
- `features/ai-models/components/AiModelForm.tsx`
- `features/ai-models/components/AiModelTabBar.tsx`
- `features/ai-models/components/AiModelTable.tsx`
- `features/ai-models/components/AiModelsContainer.tsx`
- `features/ai-models/components/ConstraintsEditor.tsx`
- `features/ai-models/components/ControlsEditor.tsx`
- `features/ai-models/components/DeprecatedModelsAudit.tsx`
- `features/ai-models/components/DeprecatedModelsAuditPage.tsx`
- `features/ai-models/components/JsonFieldEditor.tsx`
- `features/ai-models/components/ModelPricingEditor.tsx`
- `features/ai-models/components/ModelSettingsReviewDialog.tsx`
- `features/ai-models/components/ModelUsageAudit.tsx`
- `features/ai-models/components/ProviderReferenceModal.tsx`
- `features/ai-models/components/ProviderSyncCopyForAi.tsx`
- `features/ai-models/components/ProviderSyncDashboard.tsx`
- `features/ai-models/components/offerings/OfferingForm.tsx`
- `features/ai-models/components/offerings/OfferingTable.tsx`
- `features/ai-models/components/offerings/OfferingsContainer.tsx`
- `features/ai-models/components/providers/ProviderForm.tsx`
- `features/ai-models/components/providers/ProviderTable.tsx`
- `features/ai-models/components/providers/ProvidersContainer.tsx`
- `features/ai-models/components/services/ServiceForm.tsx`
- `features/ai-models/components/services/ServiceTable.tsx`
- `features/ai-models/components/services/ServicesContainer.tsx`
- `features/ai-models/components/settings/SettingForm.tsx`
- `features/ai-models/components/settings/SettingTable.tsx`
- `features/ai-models/components/settings/SettingsContainer.tsx`
- `features/ai-models/components/smart/SmartModelConfigs.tsx`
- `features/ai-models/components/smart/SmartModelSelect.tsx`

### SSR shell hydration & Redux wiring (10)
- `utils/supabase/ssrShellData.ts`
- `features/shell/components/DeferredShellData.tsx`
- `lib/redux/rootReducer.ts`
- `lib/redux/store.ts`
- `lib/redux/slices/agentContextMenuCacheSlice.ts`
- `lib/redux/slices/contextMenuCacheSlice.ts`
- `lib/redux/slices/agent-settings/agentSettingsSlice.ts`
- `lib/redux/slices/agent-settings/selectors.ts`
- `lib/redux/slices/agent-settings/internal-utils.ts`
- `lib/redux/slices/agent-settings/ui-gates.ts`

### User model preferences (10)
- `lib/redux/preferences/userPreferencesSlice.ts`
- `lib/redux/preferences/defaultUserPreferences.ts`
- `lib/redux/preferences/userPreferenceSelectors.ts`
- `components/user-preferences/AiModelsPreferences.tsx`
- `components/user-preferences/StandalonePromptsPreferences.tsx`
- `features/settings/tabs/AiModelsTab.tsx`
- `features/settings/registry.ts`
- `features/settings/components/SettingsShellOverlay.tsx`
- `app/(transitional)/settings/preferences/page.tsx`
- `hooks/user-preferences/usePreferencesModal.ts`

### Model pickers & settings UI (6)
- `components/official/settings/primitives/SettingsModelPicker.tsx`
- `features/agent-settings/components/ModelSelectorRow.tsx`
- `features/agent-settings/components/AgentSettingsContent.tsx`
- `features/agent-settings/components/AgentSettingsDrawer.tsx`
- `features/agent-settings/components/AgentSettingsModal.tsx`
- `features/agent-settings/components/AgentSettingsPanel.tsx`

### Agents — runtime, validation, pickers, settings (43)
- `features/agents/types/agent-definition.types.ts`
- `features/agents/types/agent-execution-config.types.ts`
- `features/agents/services/agentService.types.ts`
- `features/agents/route/AgentViewContent.tsx`
- `features/agents/route/SystemAgentCopyForAiMenu.tsx`
- `features/agents/hooks/useModelControls.ts`
- `features/agents/hooks/useDiffEnrichment.ts`
- `features/agents/import/ImportQuickFixes.tsx`
- `features/agents/runtime/get-model-capabilities.ts`
- `features/agents/runtime/pickRuntime.ts`
- `features/agents/runtime/validation.ts`
- `features/agents/runtime/realtime/launchRealtimeSession.thunk.ts`
- `features/agents/redux/execution-system/thunks/process-stream.ts`
- `features/agents/redux/execution-system/thunks/execute-instance.thunk.ts`
- `features/agents/components/builder/AgentModelConfiguration.tsx`
- `features/agents/components/agent-listings/AgentSneakPeekModal.tsx`
- `features/agents/components/settings/AgentSettingsForm.tsx`
- `features/agents/components/settings-management/AgentSettingsCore.tsx`
- `features/agents/components/settings-management/not-used/AgentInlineControls.tsx`
- `features/agents/components/settings-management/ui-gates/UiGatesEditor.tsx`
- `features/agents/components/settings-management/reconciliation/ModelChangeReconciliation.tsx`
- `features/agents/components/settings-management/reconciliation/analyze.ts`
- `features/agents/components/settings-management/validation/types.ts`
- `features/agents/components/settings-management/validation/constraints.ts`
- `features/agents/components/settings-management/validation/resolve-config.ts`
- `features/agents/components/settings-management/validation/rules.ts`
- `features/agents/components/settings-management/validation/apply-fix.ts`
- `features/agents/components/settings-management/validation/useConfigValidation.ts`
- `features/agents/components/settings-management/validation/__tests__/unsupported-by-model.test.ts`
- `features/agents/components/run-controls/RunModelPicker.tsx`
- `features/agents/components/run-controls/RunConfigOverrides.tsx`
- `features/agents/components/run-controls/SimpleRunSettings/SimpleRunSettings.tsx`
- `features/agents/components/run-controls/SimpleRunSettings/SimpleRunSettingsButton.tsx`
- `features/agents/components/run-controls/SimpleRunSettings/capabilities.ts`
- `features/agents/components/run-controls/AdvancedRunSettings/algorithm/rules/constraints.ts`
- `features/agents/components/inputs/smart-input/RunToolPicker.tsx`
- `features/agents/components/inputs/smart-input/RunControlsTabPanel.tsx`
- `features/agents/components/inputs/smart-input/PlusAttachMenu.tsx`
- `features/agents/components/tools-management/AgentToolsManager.tsx`
- `features/cx-chat/components/user-input/ConversationInput.tsx`
- `features/cx-conversation/ConversationInput.tsx`
- `features/public-chat/components/ChatInputWithControls.tsx`

### Agent comparison — model-battle columns (16)
- `features/agent-comparison/shared/activeBattleColumns.ts`
- `features/agent-comparison/modes/model/types.ts`
- `features/agent-comparison/modes/model/redux/selectors.ts`
- `features/agent-comparison/modes/model/redux/thunks.ts`
- `features/agent-comparison/modes/model/components/ModelBattlePage.tsx`
- `features/agent-comparison/modes/model/components/ModelColumn.tsx`
- `features/agent-comparison/modes/model/components/ModelColumnHeader.tsx`
- `features/agent-comparison/modes/model/components/ModelToolbar.tsx`
- `features/agent-comparison/modes/settings/types.ts`
- `features/agent-comparison/modes/settings/redux/thunks.ts`
- `features/agent-comparison/modes/settings/components/ColumnOverridesEditor.tsx`
- `features/agent-comparison/modes/settings/components/SettingsColumnHeader.tsx`
- `features/agent-comparison/modes/settings/components/SettingsToolbar.tsx`
- `features/agent-comparison/modes/tuning/redux/thunks.ts`
- `features/agent-comparison/modes/tuning/components/TuningColumnHeader.tsx`
- `features/agent-comparison/modes/tuning/components/TuningSummaryPanel.tsx`

### CX dashboard feature layer (12)
- `features/cx-dashboard/service.ts` ← **`resolveAiModels()`** (direct `model_definition` reader)
- `features/cx-dashboard/types/cxDashboardTypes.ts`
- `features/cx-dashboard/components/CxCostVerificationModal.tsx`
- `features/cx-dashboard/components/CxDashboardErrorBoundary.tsx`
- `features/cx-dashboard/components/CxDashboardRedirect.tsx`
- `features/cx-dashboard/components/CxEmptyState.tsx`
- `features/cx-dashboard/components/CxFiltersBar.tsx`
- `features/cx-dashboard/components/CxJsonViewer.tsx`
- `features/cx-dashboard/components/CxKpiCard.tsx`
- `features/cx-dashboard/utils/export.ts`
- `features/cx-dashboard/utils/filters.ts`
- `features/cx-dashboard/utils/format.ts`

### Other direct `ai` schema readers (1)
- `features/podcasts/generator/voiceCatalog.ts`

### Admin chrome & cache (3)
- `components/admin/server-cache/ServerCacheManager.tsx`
- `components/admin/state-analyzer/stateViewerTabs.tsx`
- `features/admin/constants/admin-categories.ts`

### Demos referencing catalog shapes (2)
- `app/(dev)/demos/agent-cards/page.dev.tsx`
- `app/(dev)/demos/run-settings/run-settings-demo/page.tsx`

### Cross-feature docs referencing catalog columns (14)
- `docs/db_changes/AI_CATALOG_FE_RECOVERY_PROMPT.md` (this file)
- `FOUND_DEFECTS.md`
- `docs/MODEL_PICKER_CAPABILITIES.md` ← still documents dropped `provider` in `fetchModelOptions`
- `docs/other/agent-schema-reference.md` ← documents `ai.service.wire_format` routing
- `docs/upgrades/research/supabase.md`
- `features/agents/FEATURE.md`
- `features/agents/migration/DECISIONS.md`
- `features/agents/migration/FINAL-AUDIT-2026-05-04.md`
- `features/agents/migration/INVENTORY.md`
- `features/agents/migration/phases/phase-03-unified-context-menu.md`
- `features/agents/migration/phases/phase-05-integration-sweep.md`
- `features/organizations/FEATURE.md`
- `features/settings/FEATURE.md`
- `features/voice-agent/FEATURE.md`

### Highest-risk direct DB touchpoints (verify first in Step 2)
These are the files most likely to 400 if a dropped column is still in a `.select()` or write payload:

| File | Why |
|---|---|
| `features/ai-models/service.ts` | CRUD on `model_definition`, `provider`, `offering`, `service` |
| `features/ai-models/server/ai-models-server.ts` | SSR/admin server reads |
| `features/ai-models/redux/modelRegistrySlice.ts` | `fetchModelOptions` → `ai.model_public`; routable filter |
| `app/api/ai-models/route.ts` | Admin list + `maker` resolution |
| `app/api/ai-models/provider-sync/route.ts` | Provider catalog sync |
| `features/cx-dashboard/service.ts` | `resolveAiModels()` on `model_definition` |
| `features/ai-models/components/AddProviderModelDialog.tsx` | Insert payload (dropped-column denylist) |
| `utils/supabase/ssrShellData.ts` | Consumes SSR `ai_models` rows (now include `maker`) |

---

## Appendix 2 — Live usage map (model pickers & registry consumers)

Every component/hook/selector that consumes model data, grouped by which path it uses. Generated
2026-07-09.

### State stores holding model data
| Store (state key) | File | What it holds | Hydration |
|---|---|---|---|
| `modelRegistry` **(canonical)** | `features/ai-models/redux/modelRegistrySlice.ts` | `entities` map + `activeIds`/`deprecatedIds`, per-record `_fetchType`, resolved `maker` | SSR `hydrateModels` (from `DeferredShellData.tsx`), `fetchModelOptions` (`model_offering`+`model_public`), `fetchModelById` (`model_definition`) |
| `userPreferences.aiModels` | `lib/redux/preferences/userPreferencesSlice.ts` | `defaultModel`, `activeModels[]`, `inactiveModels[]`, `newModels[]` (+ hard-coded default UUID) | `user_preferences` table + SSR `setModulePreferences` |
| `agentCache` | `lib/redux/slices/agentCacheSlice.ts` | each saved agent's `settings.model_id` (`selectAgentModelId`) | agent cache |
| `instanceModelOverrides` | `features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice.ts` | per-conversation model override (3-state) | override actions |
| `agentSettings` | `lib/redux/slices/agent-settings/agentSettingsSlice.ts` | `PendingModelSwitch` (reads registry to drive capability-conflict flow) | derived |
| `agentComparisonModel` | `features/agent-comparison/modes/model/redux/slice.ts` | `ModelColumn[]` (reads registry entities directly in thunks) | derived |

### Fetch / service paths
| Path | File | Source | Status |
|---|---|---|---|
| Registry options thunk | `modelRegistrySlice.ts:131` | `ai.model_offering` + `ai.model_public` | **canonical** |
| Registry single-model thunk | `modelRegistrySlice.ts:209` | `ai.model_definition` | **canonical** |
| SSR shell RPC | `utils/supabase/ssrShellData.ts:52` | `get_ssr_shell_data.ai_models[]` | **canonical hydration** |
| Admin CRUD service | `features/ai-models/service.ts` (`aiModelService`) | `model_definition`/`provider`/`model_offering` | **admin variant (keep)** |
| SSR server fetch | `features/ai-models/server/ai-models-server.ts:65` `fetchAIModels` | offering+definition+provider | **DEAD — 0 consumers → delete** |
| Next API route | `app/api/ai-models/route.ts:8` (12h CDN) | `model_definition`+`provider` | **orphaned — no live consumer** |
| cx-dashboard resolver | `features/cx-dashboard/service.ts:51` `resolveAiModels` | own `model_definition`+`provider` join | bypasses slice; should read `model_admin` |
| Provider sync | `/api/ai-models/provider-sync` | provider cache | special-purpose (keep) |

### Picker components
| Picker | File | Consumes | Verdict |
|---|---|---|---|
| **SmartModelSelect** | `features/ai-models/components/smart/SmartModelSelect.tsx` | registry directly | **the primitive** |
| ModelSelectorRow | `features/agent-settings/components/ModelSelectorRow.tsx` | wraps `SmartModelSelect` + agentSettings | OK (composes) |
| RunModelPicker / QuickRunModelSelect | `features/agents/components/run-controls/RunModelPicker.tsx` | wraps `SmartModelSelect` + overrides | OK (composes) |
| AgentModelConfiguration | `features/agents/components/builder/AgentModelConfiguration.tsx` | `SmartModelSelect` + `selectAgentModelId` | **worklist #1** (stale header) |
| SettingsModelPicker | `components/official/settings/primitives/SettingsModelPicker.tsx` | `useModels()` + own `<Select>` filtered by `userPreferences.aiModels.activeModels` | **worklist #2** (reimplements dropdown) |
| ModelColumnHeader | `features/agent-comparison/modes/model/components/ModelColumnHeader.tsx:72` | `selectModelOptions` + inline `<Select>` | **worklist #3** |
| cx-chat ConversationInput | `features/cx-chat/components/user-input/ConversationInput.tsx:297` | `selectModelOptions` + overrides | audit (worklist #6) |
| cx-conversation ConversationInput | `features/cx-conversation/ConversationInput.tsx:295` | `selectModelOptions` + own uiState override | audit (worklist #6) |
| public-chat ChatInputWithControls | `features/public-chat/components/ChatInputWithControls.tsx` | `availableModels` **via prop** (orphaned) | **worklist #7** |
| ColumnOverridesEditor | `.../modes/settings/components/ColumnOverridesEditor.tsx:59` | `selectActiveModels`+`fetchModelOptions` | OK (registry) |
| SettingsColumnHeader | `.../modes/settings/components/SettingsColumnHeader.tsx:36` | `selectModelById` | OK (registry) |
| TuningSummaryPanel | `.../modes/tuning/components/TuningSummaryPanel.tsx:67` | `fetchModelOptions` | OK (registry) |
| AiModelsPreferences | `components/user-preferences/AiModelsPreferences.tsx:29` | `useModels()` + writes `userPreferences.aiModels` | OK (registry + prefs) |

### Selectors
All catalog selectors live in `features/ai-models/redux/modelRegistrySlice.ts` (see Part B). Hooks
wrapping them: `features/ai-models/hooks/useModels.ts`. **Two non-catalog `selectAgentModelId`
selectors collide by name** — `agent-definition/selectors.ts:278` (draft agent) vs
`agentCacheSlice.ts:409` (cached agent); reconcile.
