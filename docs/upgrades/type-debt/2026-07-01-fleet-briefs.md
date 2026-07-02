# Type-debt decision briefs — fleet run 2026-07-01 (wf_c21078c7-29c)

27 escalations from the 14-agent Sonnet fleet. Review each and set Status:
`PENDING` -> `DECIDED: <verdict>` -> `FIXED (<commit>)` (or `REJECTED: <why>`).

## nocheck-sweep (9)

### BRIEF 1: features/agent-context/hooks/useContextItems.ts:388 — @ts-nocheck (unimplemented service contract)
**data:** useApplyTemplate(scopeType, scopeId, templateId, existingKeys) → expected {created, skipped}
**producedBy:** features/agent-context/hooks/useContextItems.ts:388-424 (hook) + features/agent-context/components/ContextTemplateBrowser.tsx:108-111,285-293 (live caller, per-item dedup UI)
**consumedBy:** contextService.applyTemplate(templateId, orgId) in features/agent-context/service/contextService.ts:349-416 — a DIFFERENT bootstrap-scope-types flow returning {createdScopeTypes, createdItems}, not {created, skipped}
**conflict:** The hook/UI expect a per-item apply (given a list of already-deduped ContextTemplate items + an existingKeys Set) that creates only the missing items and reports created/skipped counts. No such method exists on contextService — applyTemplate takes only (templateId, orgId) and does an entirely different whole-template scope-type bootstrap. contextService.resolvePrimaryValueScopeId (called from useCreateContextValue, hooks/useContextItems.ts:315) also does not exist anywhere in the file.
**decisionNeeded:** Either (A) add a new contextService method matching the per-item-apply contract the hook/UI already expect (dedup against existingKeys, insert only missing items, return {created, skipped}), or (B) redesign ContextTemplateBrowser's apply flow to use the existing whole-template applyTemplate bootstrap and drop the per-item existingKeys UI. Also decide/implement resolvePrimaryValueScopeId (or point useCreateContextValue at an existing equivalent) before this file can drop @ts-nocheck.
**Status:** PENDING

### BRIEF 2: features/public-chat/hooks/DEPRECATED-useAgentChat.ts:145 — @ts-nocheck (wire-contract field can't be mapped without a decision)
**data:** state.settings.thinkEnabled (boolean UI toggle) with no field on the generated LLMParams schema
**producedBy:** features/public-chat/context/DEPRECATED-ChatContext.tsx (ChatSettings.thinkEnabled boolean, still live — wired via ChatContainer.tsx, actively imported/used, NOT dead despite the DEPRECATED- filename)
**consumedBy:** types/python-generated/api-types.ts LLMParams.thinking_level: 'minimal'|'low'|'medium'|'high' | null (components['schemas']['LLMParams'])
**conflict:** LLMParams has no boolean 'think on/off' field — only a 4-level thinking_level plus include_thoughts/thinking_budget/clear_thinking/disable_reasoning. I already fixed the two mechanical renames in this file (ai_model_id→model, web_search_enabled→internal_web_search) since those were 1:1 renames; thinkEnabled has no 1:1 target.
**decisionNeeded:** Pick a thinking_level to send when thinkEnabled is true (e.g. 'medium'), or expose a level selector in the UI instead of a boolean. Until decided, config_overrides silently drops the thinking toggle server-side (pre-existing behavior, unchanged by my fix).
**Status:** PENDING

### BRIEF 3: hooks/tts/useWakeWord.ts:47 — @ts-nocheck (missing dependency, wired into 3 consumers)
**data:** usePorcupine() — called but never defined/imported anywhere in the repo
**producedBy:** hooks/tts/useWakeWord.ts:49-58 (the only reference to usePorcupine in the whole codebase)
**consumedBy:** components/voice/wake-word/WakeWordDebug.tsx, components/voice/wake-word/WakeWordIndicator.tsx, hooks/tts/useWakeWordVoiceChat.ts — all import and call useWakeWord() expecting isLoaded/isListening/error/init/start/stop/release
**conflict:** Neither @picovoice/web-voice-processor nor @picovoice/react-web-voice-processor (the packages the file's own @ts-ignore comment names) are in package.json or node_modules. This is an undefined-identifier error at compile time and a ReferenceError at runtime, not a type-only issue.
**decisionNeeded:** Install the real Picovoice package and wire its actual hook API (name/shape may differ from this stub), or decide wake-word detection is dead and remove useWakeWord.ts + its 3 consumers. Either is a dependency/product decision outside a type-only pass.
**Status:** PENDING

### BRIEF 4: lib/deepgram/SpeechTransition.ts:3 — @ts-nocheck (dead file, recommend deletion)
**data:** import { useNowPlaying } from 'react-nowplaying' — package not in package.json, not in pnpm-lock.yaml, not on disk anywhere
**producedBy:** n/a — SpeechTransition is not imported by any other file in the repo (grep confirms zero importers)
**consumedBy:** nothing — dead export
**conflict:** Unbuildable at the module level (missing dependency) and unreachable (no importer). Not a type-fix candidate.
**decisionNeeded:** Delete lib/deepgram/SpeechTransition.ts. If Deepgram speech-transition ducking is still wanted, it needs a from-scratch design against a real audio-player primitive (usePlayer/usePlayerSafe), not a resurrection of this file.
**Status:** PENDING

### BRIEF 5: lib/redux/app-runner/selectors/appletRuntimeSelectors.ts:25 — @ts-nocheck (missing Redux slice, half the file unreachable)
**data:** state.brokerValues.{values,history,neededBrokers,brokerDefinitions} — no brokerValues reducer registered anywhere
**producedBy:** lib/redux/app-runner/selectors/appletRuntimeSelectors.ts:25-32 (selectBrokerValues/selectBrokerHistoryMap/selectNeededBrokers/selectBrokerDefinitions) and everything downstream: selectBrokerValue, selectBrokerHistory, selectBrokerDefinition, selectAllBrokerValues, selectAllBrokerDefinitions, selectBrokerForComponentInstance, selectBrokerValueStatus, selectMissingNeededBrokers
**consumedBy:** app/(transitional)/apps/AppRendererTest.tsx — a debug/test page that calls every selector in this file via useAppSelector, including the broken brokerValues ones
**conflict:** lib/redux/rootReducer.ts registers componentDefinitions but never a brokerValues slice; grep finds zero other references to a brokerValues reducer anywhere in the codebase. I fixed the one independent `: any` (line 118, now typed FieldDefinition per componentDefinitionsSlice's real Record<string, Record<string, FieldDefinition>> shape) since it doesn't depend on the missing slice, but the file as a whole cannot drop @ts-nocheck until brokerValues exists.
**decisionNeeded:** Build the missing brokerValues slice (shape: values/history/neededBrokers/brokerDefinitions, each keyed by appId), or determine broker-value runtime state now lives elsewhere (e.g. inside componentDefinitions or customAppletRuntimeSlice) and repoint these selectors, or confirm AppRendererTest.tsx + this half of the file are dead debug scaffolding to be deleted.
**Status:** PENDING

### BRIEF 6: lib/redux/middleware/apiThunks.ts:24 — @ts-nocheck (RPC/type contract drift in the legacy dynamic-entity Redux system)
**data:** mapFetchOneArgs/mapFetchWithIfkArgs return type RpcFetchOneType['Args'] = Database['public']['Functions']['fetch_all_fk_ifk']['Args'] = {p_primary_key_values: Json, p_table_name: string}, but both builders construct {p_id, p_table_name} instead
**producedBy:** lib/redux/middleware/apiThunks.ts:24-32 (mapFetchOneArgs, unused dead code) and :29-32 (mapFetchWithIfkArgs, actually called at :150 against RPC 'find_fk_entries' — a THIRD, different RPC than the one named in the type alias)
**consumedBy:** types/reduxTypes.ts:53-54 RpcFetchOneType alias (points at fetch_all_fk_ifk); actual runtime call hits find_fk_entries (types/database.types.ts:24621), whose Returns is {fk_column_name, referenced_column_name, referenced_entry, referenced_table_name}[] — FK-lookup metadata, not the entity row — yet the caller (fetchOne) treats the result as the fetched entity and runs featureSchema.parse(data) on it
**conflict:** Three different RPCs are tangled under one type alias and one thunk: fetch_all_fk_ifk (aliased, unused), find_fk_entries (actually called, wrong Returns shape for the intended use), and fetch_custom_rels (only referenced in a commented-out block). This is load-bearing — createApiThunks is wired into every entry of featureSchemas via lib/redux/rootReducer.ts:176-184 — so a wrong fix here breaks real entity fetches across the legacy dynamic-entity system.
**decisionNeeded:** Determine which RPC fetchOne is actually supposed to call for a real single-entity-with-relations fetch (fetch_all_fk_ifk with p_primary_key_values, or something else entirely), fix mapFetchWithIfkArgs's args to match, and either wire mapFetchOneArgs in or delete it as dead code. This needs someone who knows the intended legacy-entity fetch semantics, not a blind type patch.
**Status:** PENDING

### BRIEF 7: lib/redux/ui/uiThunks.ts:4 — @ts-nocheck (undefined type + nonexistent state slices)
**data:** UISchema (return type of loadSchemaForContext) is never declared/imported anywhere in the repo; getState().globalCache and getState().entities reference slices absent from rootReducer.ts
**producedBy:** lib/redux/ui/uiThunks.ts:4-25 (both thunks)
**consumedBy:** lib/redux/ui/uiSlice.ts (imports + wires both thunks into extraReducers) → registered in rootReducer.ts as uiReducer, so it IS live in the store, just built on slices that no longer exist
**conflict:** types/reduxTypes.ts's header comment still mentions a 'GlobalCacheState' → 'globalCacheSlice.ts', but that file doesn't exist anywhere in lib/redux/ — the whole global-cache/entities dynamic-entity layer this file depends on appears to have been removed while uiThunks.ts (and uiSlice.ts, out of my scope) were left behind referencing it.
**decisionNeeded:** Either restore/relocate the globalCache + entities state (and define UISchema) if this UI-schema-driven rendering path is still wanted, or delete uiThunks.ts + the corresponding extraReducers in uiSlice.ts as dead legacy code. I fixed the independent Record<string, any> → Record<string, unknown> on loadDataForSchema's return type since it doesn't depend on the missing slices, but the file can't honestly drop @ts-nocheck until the UISchema/globalCache/entities question is resolved.
**Status:** PENDING

### BRIEF 8: lib/redux/slices/featureSliceCreator.ts:36 — @ts-nocheck (blocked by apiThunks.ts's RPC contract drift)
**data:** createFeatureSlice's extraReducers wire apiThunks.fetchOne/.fetchPaginated/.deleteOne/.deleteMany/.update/.create — all produced by the broken createApiThunks factory
**producedBy:** lib/redux/slices/featureSliceCreator.ts:36 (const apiThunks = createApiThunks(...)) — same-file coupling to lib/redux/middleware/apiThunks.ts
**consumedBy:** lib/redux/rootReducer.ts:176-184 — createFeatureSlice is called once per entry in featureSchemas and wired into the root reducer for every legacy dynamic-entity feature
**conflict:** This file's own body type-checks cleanly (I fixed the one independent Record<string, any> → SliceCaseReducers<SliceState<z.infer<T>>> on the additionalReducers param), but it re-exports the return value of createApiThunks, whose fetchOne is built on the mismatched find_fk_entries/fetch_all_fk_ifk contract documented in the apiThunks.ts brief above.
**decisionNeeded:** Same decision as the apiThunks.ts brief — once that RPC/type contract is resolved, this file should drop @ts-nocheck for free (no changes needed here beyond what I already made).
**Status:** PENDING

### BRIEF 9: utils/supabase/api-wrapper.ts:21 — @ts-nocheck (dead file, recommend deletion)
**data:** import { convertData, getRegisteredSchemas, getSchema, processDataForInsert, TableSchema } from '../schema/schemaRegistry' — that module doesn't exist anywhere in the repo
**producedBy:** n/a — utils/supabase/api-wrapper.ts (databaseApi export) is not imported by any other file (grep confirms zero importers)
**consumedBy:** nothing — dead export; databaseApi is eagerly instantiated at module load but the module itself is never pulled into any bundle
**conflict:** The entire dependency (utils/schema/schemaRegistry, a custom per-table schema/relationship registry: TableSchema, getSchema, convertData, processDataForInsert) has been deleted from the repo, leaving this 893-line generic CRUD wrapper class permanently unbuildable and unreachable.
**decisionNeeded:** Delete utils/supabase/api-wrapper.ts. If a generic typed Supabase CRUD wrapper is still wanted, it should be rebuilt against the current generated types/database.types.ts directly rather than resurrecting the deleted schemaRegistry abstraction.
**Status:** PENDING

## agents-ui (1)

### BRIEF 10: features/agents/components/settings-management/AgentSettingsCore.tsx:1035 — ?? {} at a possibly-unloaded-data boundary
**data:** currentSettings: FeLlmParams — the live agent-settings editing panel's working copy
**producedBy:** features/agents/redux/agent-definition/selectors.ts:341-344 selectAgentSettings (returns record?.settings ?? null — null while the agent record hasn't loaded/hydrated yet)
**consumedBy:** Every setAgentSettings dispatch in this file (handleSettingChange, response_format branch, reconciliation, defaults, etc.) — writes { ...currentSettings, [key]: value } back to Redux, which round-trips to agent.definition.settings in Postgres via the save thunk.
**conflict:** AgentSettingsCore renders unconditionally (no loading/empty guard) from both AgentSettingsModal.tsx and AgentModelPanel.tsx. If the user opens Settings and edits a field before the agent record has hydrated, currentSettings starts as {} (not the real settings), and the edit round-trips through { ...{}, [key]: value } as LLMParams — silently dropping every other real setting on save instead of merging with them.
**decisionNeeded:** Should AgentSettingsCore show a loading/skeleton state until selectAgentSettings resolves non-null (matching the `if (!agent) return <Skeleton/>` pattern already used in AgentSettingsForm.tsx), or is settings===null structurally impossible by the time this component mounts (e.g. guaranteed pre-hydrated by a parent)? If the latter, the null case should be an explicit invariant-violation error, not a silent {} fallback. This needs a human product/architecture call because changing it risks altering the panel's loading UX, and I could not verify from this file alone whether callers guarantee pre-hydration.
**Status:** PENDING

## agents-core (5)

### BRIEF 11: features/agents/redux/execution-system/message-crud/edit-message.thunk.ts:170 — as unknown as (guard-unusable — stale generated contract)
**data:** The row returned by the `cx_message_edit` RPC (content, content_history, status, agent_id, metadata, is_visible_to_model, is_visible_to_user)
**producedBy:** supabase.rpc("cx_message_edit", ...) — features/agents/redux/execution-system/message-crud/edit-message.thunk.ts
**consumedBy:** dispatch(updateMessageRecord(...)) in features/agents/redux/execution-system/messages/messages.slice.ts, which patches the live MessageRecord read by every message renderer
**conflict:** types/database.types.ts resolves cx_message_edit's Returns to Database["graveyard"]["Tables"]["message"]["Row"] — a retired, unrelated table shape (content: string|null, no agent_id/content_history/is_visible_to_model/metadata). The RPC almost certainly actually returns the live chat.message row; the type generator picked up a stale SETOF reference from the 2026 schema reorg (graveyard schema). A DbRpcRow guard can't be added against this generated type without it failing on the wrong shape.
**decisionNeeded:** Is this a DB-side fix (correct the RPC's declared return-table reference so `pnpm db-types` regenerates the right shape) or does the RPC genuinely target something in graveyard and the FE's assumed shape is wrong? Needs a human/DBA to check the actual SQL body of cx_message_edit and confirm/repoint its SETOF target, then regenerate types.
**Status:** PENDING

### BRIEF 12: features/agents/redux/execution-system/thunks/conversation-bundle.ts:55 — as unknown as (hand-written row interfaces drift from generated schema)
**data:** CxConversationRow / CxMessageRow / CxToolCallRow / CxUserRequestRow / CxRequestRow — hand-written interfaces mirroring chat.conversation / chat.message / chat.tool_call / chat.user_request / chat.request table rows
**producedBy:** supabase.from("conversation"|"message"|"tool_call"|"request"|"user_request").select("*") fallback queries in this same file (lines ~269-352)
**consumedBy:** Row-to-record converters further down conversation-bundle.ts, then the messages/observability slices used by every message and tool-call renderer
**conflict:** Confirmed via isolated tsc check: Database["chat"]["Tables"]["conversation"]["Row"].organization_id is non-nullable `string`, but CxConversationRow.organization_id is `string | null` (wider) — a DbRpcRow-style _Check guard fails on this mismatch. The hand-written interfaces also carry a different `visibility` type (ConversationVisibility vs the DB's Database["platform"]["Enums"]["visibility"]) and may be missing/adding columns relative to the current generated Row shapes.
**decisionNeeded:** Should these 5 interfaces be deleted and replaced with direct aliases to `Database["chat"]["Tables"][...]['Row']` (the Pattern-2-correct fix), accepting whatever nullability the DB now declares? Or is the extra nullability intentional (defending against a to_jsonb/RPC path that can produce nulls the plain table Row type doesn't show)? This is a multi-field audit across 5 interfaces + all their consumers — too large to safely do without tsc verification in this pass.
**Status:** PENDING

### BRIEF 13: features/agents/redux/agent-shortcuts/types.ts:303 — as unknown as (RPC row interface wider than generated contract, no guard)
**data:** UserShortcutItem (from agx_get_user_shortcuts()) and AdminNonGlobalShortcutRow (from agx_list_non_global_shortcuts_for_admin) — many fields declared `string | null` in the TS interface
**producedBy:** supabase.rpc("agx_get_user_shortcuts") / supabase.rpc("agx_list_non_global_shortcuts_for_admin") in features/agents/redux/agent-shortcuts/thunks.ts
**consumedBy:** The shortcuts management/admin pages that list every shortcut a user can see or administer
**conflict:** types/database.types.ts declares every column of agx_get_user_shortcuts' Returns as non-nullable `string` (description, icon_name, keyboard_shortcut, agent_name, etc.) but UserShortcutItem declares most of them `string | null`. Verified via isolated tsc: adding the standard DbRpcRow `_Check extends` guard fails immediately on this mismatch, so it can't be dropped in as a safe win.
**decisionNeeded:** Does the RPC's SQL genuinely never return NULL for these columns (matching the generated type), in which case UserShortcutItem should be tightened to match and the defensive `| null`s removed? Or can real rows have NULLs the generator missed (e.g. a LEFT JOIN), in which case the RPC's SQL/typing needs correction upstream? Needs a DBA/backend check of the actual SELECT before either interface is trusted.
**Status:** PENDING

### BRIEF 14: features/agents/services/mcp-client/token-refresh.ts:76 — as unknown as (RPC row interface wider than generated contract, no guard)
**data:** McpCredentials (refresh_token, token_expires_at, oauth_token_endpoint, oauth_client_id) from get_mcp_credentials()
**producedBy:** supabase.rpc("get_mcp_credentials", {p_server_id, p_user_id}) in this file
**consumedBy:** OAuth token-refresh flow for MCP server connections — a failed/incorrect read here silently breaks tool-server auth
**conflict:** types/database.types.ts types every column of get_mcp_credentials' Returns as non-nullable `string`, but the local McpCredentials interface marks refresh_token/token_expires_at/oauth_token_endpoint/oauth_client_id as `string | null` because the RPC is backed by a LEFT JOIN and connections that haven't completed OAuth genuinely have nulls in practice. A DbRpcRow guard would fail against the generated (overly optimistic) contract.
**decisionNeeded:** Should the get_mcp_credentials SQL be adjusted (or its generated type manually widened via a documented override) so the contract matches runtime reality, so a proper guard can be added? Left as an unguarded `as unknown as` with an inline comment for now; low risk since the code already defensively checks each field for null before using it.
**Status:** PENDING

### BRIEF 15: features/agents/redux/execution-system/thunks/execute-instance.thunk.ts:573 — as unknown as (thunk-config typing gap, not a data-shape guard case)
**data:** The return value of the plain (non-createAsyncThunk) `consumePendingCacheBypass` thunk, dispatched from inside an async createAsyncThunk body
**producedBy:** features/agents/redux/execution-system/message-crud/cache-bypass.slice.ts — consumePendingCacheBypass(conversationId) returns (dispatch, getState) => CacheBypassFlags | null
**consumedBy:** The cache_bypass flag object read immediately after, forwarded into the outbound /ai/agents or /ai/conversations request body so aidream's agent cache rebuilds from authoritative DB state
**conflict:** executeInstance's createAsyncThunk<ExecuteInstanceResult, ExecuteInstanceArgs, { state: RootState }> config only supplies `state`, not `dispatch: AppDispatch` — so inside the thunk body, `dispatch` is typed as the base RTK Dispatch<AnyAction> and can't infer the return type of a plain thunk function passed to it, forcing the `as never` / `as unknown as CacheBypassFlags | null` double-cast at the call site.
**decisionNeeded:** Widening the third generic to `{ state: RootState; dispatch: AppDispatch }` is the real fix, but execute-instance.thunk.ts is large (~2500 lines) with many other dispatch() calls whose inferred types could shift under the wider config — needs a full tsc pass to verify no new errors surface elsewhere in the file before landing. Flagged rather than risked blind in a no-tsc batch pass.
**Status:** PENDING

## files (2)

### BRIEF 16: features/files/redux/converters.ts:267 — ?? "" at a read-into-store boundary (silent data-corruption mask)
**data:** CloudFilePermission.granteeId: string (non-nullable) — dbRowToCloudFilePermission does `row.granted_to_user_id ?? row.granted_to_organization_id ?? ""`
**producedBy:** features/files/redux/converters.ts:258-274 (dbRowToCloudFilePermission), fed by public.permissions rows via features/files/redux/thunks.ts:1386 and features/files/redux/realtime-middleware.ts:513
**consumedBy:** Redux store (permissionsByResourceId), used for permission revocation/display in the sharing UI
**conflict:** public.permissions.granted_to_user_id AND granted_to_organization_id are both nullable in the generated schema with no visible CHECK constraint (in this repo) enforcing 'exactly one non-null'. If a row somehow has both null (DB bug, migration gap, or a genuinely unconstrained state), the converter silently produces granteeId: "" — a permission grant with a blank grantee that could misbehave in revoke/display flows instead of surfacing the malformed row.
**decisionNeeded:** Does public.permissions have (or should it have) a DB CHECK constraint guaranteeing exactly one of granted_to_user_id/granted_to_organization_id is set? If yes, the FE default is provably dead and can be simplified. If no (or unknown), should the converter throw / log-and-skip on both-null, or is this row shape genuinely expected in some flow (e.g., an org-wide public grant with neither) — a product decision on how permission grants without a distinguishable grantee should behave in the UI.
**Status:** PENDING

### BRIEF 17: features/files/redux/converters.ts:145 — as unknown as at an OpenAPI/Python boundary — code disagrees with the generated contract
**data:** apiFileRecordToCloudFile reads duplicate_of_file_id / canonical_processed_document_id / parent_file_id / derivation_kind / derivation_metadata off `row as unknown as { ...extra fields }` because these fields are NOT in the generated FileRecord OpenAPI schema
**producedBy:** features/files/redux/converters.ts:138-243 (apiFileRecordToCloudFile), documented as a Phase 2.0 dedup-handoff gap in the inline comment
**consumedBy:** features/files/types.ts CloudFile.duplicateOfFileId / canonicalProcessedDocumentId / parentFileId / derivationKind / derivationMetadata — surfaced in dedup UI and lineage chips (see features/files/utils/file-info-format.ts 'Derived from' / 'Derivation kind' lines)
**conflict:** types/python-generated/api-types.ts FileRecord schema (verified: line 20646) genuinely does not declare these 5 fields — the OpenAPI contract has not caught up to what the Python backend actually returns (per the inline comment, this was true as of the dedup-handoff and is STILL true today). This is exactly the 'code disagrees with the generated contract' case the type-safety skill says means 'fix the code' — except here the fix is upstream (regenerate/extend the Python OpenAPI schema), not something this repo's FE can correct.
**decisionNeeded:** Has the aidream Python FileRecord Pydantic model been updated to include duplicate_of_file_id / canonical_processed_document_id / parent_file_id / derivation_kind / derivation_metadata, and has `pnpm sync-types` been re-run since? If yes, this cast should be deleted and the fields read directly off `row`. If the Python model still lacks them, this is a live wire-contract gap that needs a Python-side ticket, not an FE workaround.
**Status:** PENDING

## research (1)

### BRIEF 18: features/research/hooks/useResearchStream.ts:133 — as unknown as
**data:** See notableFixes / remaining fields above.
**producedBy:** n/a
**consumedBy:** n/a
**conflict:** n/a
**decisionNeeded:** n/a
**Status:** PENDING

## tasks (1)

### BRIEF 19: features/tasks/services/projectService.ts:171 — as unknown as
**data:** getProjectsWithTasks() result of `.from('projects').select('*, tasks(*)')` — a real relational join (FK tasks.project_id -> projects.id), not a Json field. Cast to ProjectWithTasks[] uses `as unknown as` (double-cast) rather than a single `as ProjectWithTasks[]`.
**producedBy:** features/tasks/services/projectService.ts:141-176 (single call site; workspaceDb(supabase).from('projects').select('*, tasks(*)'))
**consumedBy:** Callers of getProjectsWithTasks() (grep shows no in-scope callers under features/tasks/, but the exported function is part of the service's public surface)
**conflict:** If PostgREST/Supabase-js's embedded-relation type inference for a `select('*, tasks(*)')` template-string join already produces a structurally compatible type, a single-step `as ProjectWithTasks[]` would compile and this `as unknown as` is an unnecessary double-cast (the 'cast it harder' anti-pattern the type-safety skill calls out). If inference does NOT produce a compatible type (e.g. the generated Database types don't model the FK-embed shape for this join), a single-step cast would fail to compile and `as unknown as` is currently masking a genuine shape mismatch that needs Pattern-4-style field narrowing or a Zod parse instead.
**decisionNeeded:** Run `tsc` (forbidden for me to run in this batch mode) on a version with `as ProjectWithTasks[]` (single-step) to see whether it compiles. If it does, downgrade the cast and drop `as unknown as`. If it does not, the join result needs proper typing via a dedicated `Database['workspace']['Functions']`-style row type or Pattern-4 field narrowing on the `tasks` sub-array, rather than the current double-cast — a human/CI verification pass should decide which, since I cannot run tsc/build in this task mode.
**Status:** PENDING

## notes (2)

### BRIEF 20: features/notes/hooks/useNoteIngestStatus.ts:46 — as any (cross-feature Supabase schema typing)
**data:** supabase.schema("docproc") — the client typed with Database (which does declare a docproc schema in types/database.types.ts) still requires (supabase as any) to call .schema("docproc") without a TS error.
**producedBy:** The (supabase as any).schema("docproc") pattern is NOT specific to features/notes — it recurs verbatim at 38 call sites across the repo (features/pdf/hooks/usePdfSurfaceLinks.ts, features/pdf/services/saveDerivative.ts, features/rag/hooks/usePageVerificationSummary.ts, features/rag/components/source-inspector/usePageBundle.ts, features/page-extraction/data-review/data.ts, and more).
**consumedBy:** Supabase docproc.processed_documents table (workbench-adjacent schema); read-only in this file (feeds a UI 'indexed' dot / documentId for /rag/viewer).
**conflict:** Every other schema-scoped table access in the repo has a canonical typed wrapper (filesDb(supabase), per the memory note 'schema-helper wrappers: workspaceDb/contextDb/filesDb/schedulerDb/transcriptsDb/appDb'). No docprocDb(supabase) wrapper exists yet, so every docproc callsite falls back to (supabase as any).schema(...) instead. I attempted removing the cast in isolation (supabase.schema("docproc").from(...) directly) but could not verify it compiles without running tsc (forbidden by this task's hard rules), and the fact that 38 call sites across unrelated features/repos independently reach for the same cast strongly suggests a real TS limitation with .schema() generic resolution against a Database type with this many schemas/tables (a known class of 'type instantiation excessively deep' issue), not just copy-paste laziness.
**decisionNeeded:** Should a canonical docprocDb(supabase) helper (mirroring features/files/filesDb.ts) be added to give every docproc call site a typed, cast-free schema client in one place? This is a cross-feature architecture change (new shared helper + a repo-wide sweep of 38 call sites) that a single-feature-scoped agent should not do unilaterally. Until decided, this file's cast is left untouched (reverted after a failed in-place attempt) rather than risk an unverifiable compile break.
**Status:** PENDING

### BRIEF 21: features/notes/redux/notes.types.ts:284 — ?? "" (empty-shape-as-data at record construction)
**data:** organization_id: partial.organization_id ?? "" inside createBlankNoteRecordFromPartial — organization_id is a NOT NULL DB column (workbench.notes.organization_id: string, required) yet every other field in this same constructor defaults to null (an honest 'unknown/absent' sentinel) while this one field defaults to the empty string "", which is not a valid organization id.
**producedBy:** features/notes/redux/notes.types.ts:272-330 (createBlankNoteRecordFromPartial), called from features/notes/redux/slice.ts:354 inside the upsertNoteFromServer reducer whenever a server-pushed note (list fetch or realtime event) doesn't yet have a local record.
**consumedBy:** The resulting NoteRecord lives in Redux (features/notes/redux/slice.ts state.notes[id]) and feeds every notes UI (sidebar grouping by org, save/update thunks that pass organization_id back to Supabase workbench.notes, agent-context builders). A note record with organization_id: "" would silently look like a real (but empty) org rather than a flagged data problem.
**conflict:** In practice partial.organization_id should always be populated (DB column is NOT NULL, so any real server row has it) — this fallback only fires if a caller passes an incomplete Partial<Note> that's missing organization_id, which would itself be a bug upstream. Silently coercing to "" hides that bug instead of surfacing it, unlike every sibling field in the same function which honestly defaults to null.
**decisionNeeded:** Should a missing organization_id when constructing a blank note record from server/realtime data (a) throw/log loudly (treating it as a data-integrity violation, consistent with this repo's 'loud recovery' principle), or (b) keep silently defaulting to "" as a deliberately permissive fallback for some caller that's known to omit it? I did not change this without knowing which upstream caller(s), if any, currently rely on the permissive default — changing it risks breaking a legitimate caller if one exists that the codebase relies on.
**Status:** PENDING

## lib-redux (3)

### BRIEF 22: lib/redux/app-runner/types.ts:4 — any / Record<string, any>
**data:** BrokerValue.value: any and .metadata?: Record<string, any>; RuntimeBrokerDefinition.defaultValue: any (this one fixed to unknown since it only flows within lib/redux — see notableFixes)
**producedBy:** lib/redux/app-runner/thunks/loadApplet.ts (component instance creation), 30+ field-renderer components under features/applet/runner/fields/*.tsx that each write a different concrete value type (string, number, boolean, Date, string[], File, etc.) into BrokerValue.value
**consumedBy:** features/applet/runner/fields/*.tsx (~30 files) read BrokerValue.value expecting to bind it directly to component-specific value types (e.g. NumberInputField expects number, DateField expects string/Date, CheckboxGroupField expects string[])
**conflict:** The value genuinely varies by field/component type across 30+ consumers outside lib/redux/. Narrowing to `unknown` would require every consumer to add a type guard/cast at the point of use, which is out of this agent's scope (features/applet/**) and risks breaking the 30+ call sites without the ability to verify via tsc.
**decisionNeeded:** Should BrokerValue become a discriminated union keyed by component type (à la ControlDefinition's ControlType pattern already used elsewhere in the agent-settings slice), or should it stay a deliberately-wide `unknown` with per-consumer narrowing? This is a cross-feature (lib/redux + features/applet) type-modeling decision, not a boundary fix — recommend a follow-up task scoped to both directories together so consumer narrowing lands atomically with the type change.
**Status:** PENDING

### BRIEF 23: lib/redux/ui/uiSlice.ts:5 — any / Record<string, any>
**data:** UIState.currentSchema: any, data: any[]; setLocalData action payload Record<string, any>[]
**producedBy:** lib/redux/ui/uiThunks.ts (loadSchemaForContext, loadDataForSchema) — this file is @ts-nocheck and OWNED by a different agent in this same wave (excluded from my scope per assignment)
**consumedBy:** state.ui in the root reducer (lib/redux/rootReducer.ts:32); no other consumers found outside this slice file itself in a scoped grep
**conflict:** uiThunks.ts references a nonexistent `UISchema` type and calls getState().globalCache / getState().entities without a typed RootState generic — it reads slices that don't exist in the current store shape. The whole thunk pair appears to be dead/broken legacy code (pre-entity-split remnant) that only compiles today because of @ts-nocheck. Narrowing uiSlice.ts's types independently is unsafe because the action payload types for .addCase(loadSchemaForContext.fulfilled, ...) etc. are inferred FROM the broken thunk file, and I cannot verify a compatible replacement without running tsc.
**decisionNeeded:** Is `lib/redux/ui/uiSlice.ts` + `uiThunks.ts` still live functionality, or is it dead code left over from the pre-2026 entity-system split (candidate for full removal per the 'no legacy/deprecated code' rule)? If live, it needs the nocheck agent to fix uiThunks.ts's RootState/UISchema plumbing first, then uiSlice.ts's any-typed fields can be narrowed to match. If dead, delete both files and remove `ui: uiReducer` from rootReducer.ts's slimReducerMap.
**Status:** PENDING

### BRIEF 24: lib/redux/app-builder/thunks/appBuilderThunks.ts:48 — || "" at a write boundary (latent bug, not silenced)
**data:** updateAppThunk constructs { id, name: changes.name || "", description: changes.description || "", slug: changes.slug || "", ...changes } then calls updateCustomAppConfig(id, config: CustomAppConfig) which does a full-row .update(dbData) (not a partial patch)
**producedBy:** lib/redux/app-builder/thunks/appBuilderThunks.ts:43-66 (updateAppThunk); lib/redux/app-builder/service/customAppService.ts:302 (updateCustomAppConfig, which always writes every CustomAppConfig field via customAppConfigToDBFormat)
**consumedBy:** public.custom_app_configs table (name, description, slug columns) via supabase.from('custom_app_configs').update(dbData) in customAppService.ts:311
**conflict:** If a caller dispatches updateAppThunk({id, changes: {slug: 'new-slug'}}) intending a partial update, name/description are not in `changes`, so the `|| ""` fallbacks fire and the DB write blanks out the existing name/description to empty (customAppConfigToDBFormat converts "" -> null on write, so the net effect is silently nulling out existing name/description on any partial update that omits them). No route in the current codebase dispatches updateAppThunk (grep found zero call sites besides the slice's own extraReducers), so this is dormant, not actively firing — but it will corrode data the moment a caller adopts it.
**decisionNeeded:** Should updateAppThunk (a) merge with the current Redux `state.appBuilder.apps[id]` (or re-fetch via getCustomAppConfigById) before writing, so a partial `changes` object only patches the fields it specifies, or (b) is the current 'thunk always sends a full replacement, caller must supply the whole object' contract intentional and just needs its JSDoc updated to say so? This is a product-behavior decision on update semantics, not a type annotation fix.
**Status:** PENDING

## lib-services (2)

### BRIEF 25: lib/agent-apps/data.ts:48 — as unknown as (whole-row cast, not RPC)
**data:** app.definition table row (generated Database["app"]["Tables"]["definition"]["Row"]) vs AgentApp (= AgentAppRecord in features/agent-apps/types.ts), which narrows ~8 generated `string` columns (status, component_language, shell_kind, app_kind, etc.) to literal-union domain types
**producedBy:** lib/agent-apps/data.ts getAgentApp() — supabase.schema("app").from("definition").select("*").single()
**consumedBy:** features/agent-apps/types.ts AgentAppRecord (renderer/UI consumer of the narrowed literal fields)
**conflict:** The DB guarantees a real DB column type (string, no runtime enum constraint visible to TS), but AgentAppRecord asserts a narrower literal union (e.g. AppStatus, ComponentLanguage) with no runtime validation at this read site. A DbRpcRow-style compile-time guard only applies to RPCs, not table selects, so there is no equivalent safety net here.
**decisionNeeded:** Either (A) add a Zod/runtime validator for the ~8 narrowed fields at this read site (feature-owned, touches features/agent-apps/types.ts, outside my lib/-only scope), or (B) accept the existing informal contract (DB CHECK constraints presumably enforce the literal values) and leave the single documented cast as the intentional boundary. This is a product/architecture call for whoever owns features/agent-apps.
**Status:** PENDING

### BRIEF 26: lib/api/call-api.ts:1132 — as any (wire-contract drift)
**data:** callWarmAgent(agentId, source) builds body: { source } for POST /ai/agents/{agent_id}/warm
**producedBy:** lib/api/call-api.ts callWarmAgent()
**consumedBy:** aidream Python endpoint warm_agent_ai_agents__agent_id__warm_post, whose generated OpenAPI schema (types/python-generated/api-types.ts, aidream__api__routers__agents__WarmRequest) is `{ is_version: boolean }` — it does NOT declare a `source` field at all. `source: WarmSource` only exists on a DIFFERENT sibling schema (aidream__api__routers__agents_blocks__WarmRequest, for the separate /ai/agents-blocks/{agent_id}/warm endpoint).
**conflict:** The frontend function sends `{ source }` to an endpoint whose real request body has no `source` field — FastAPI likely silently ignores the extra key by default, but the field is never read server-side, which is why `as any` was needed (the generated request-body type genuinely rejects it). `callWarmAgent` itself has zero live callers anywhere in the app today (grepped, confirmed dead).
**decisionNeeded:** Either (A) the Python /ai/agents/{agent_id}/warm endpoint should accept `source` (matching agents_blocks' WarmRequest) if the intent is real, or (B) callWarmAgent should be deleted as dead/superseded code, or (C) it should call /ai/agents-blocks/{agent_id}/warm instead if that was always the intended target. Needs a human (and likely the Python side) to pick — I left the existing `as any` untouched rather than guess.
**Status:** PENDING

## orgs-scopes-sharing (1)

### BRIEF 27: features/organizations/components/GeneralSettings.tsx:116 — as unknown as (thunk-dispatch cast)
**data:** invalidateAndRefetchFullContext() — a hand-written Redux thunk `(dispatch: AppDispatch) => Promise<void>`, dispatched via `dispatch(invalidateAndRefetchFullContext() as unknown as Parameters<typeof dispatch>[0])`
**producedBy:** features/agent-context/redux/hierarchyThunks.ts:183 (the thunk itself) — outside my assigned scope paths.
**consumedBy:** lib/redux/hooks.ts useAppDispatch (AppDispatch = ThunkDispatch<RootState, unknown, UnknownAction> & Dispatch<UnknownAction>, defined in lib/redux/store.ts:261).
**conflict:** store.ts's own comment documents that under strictFunctionTypes, dispatching a custom thunk function directly collapses to the plain-action Dispatch overload (TS2769), which is why this exact cast pattern (`as unknown as Parameters<typeof dispatch>[0]`) is repeated at 16 call sites across the repo (features/organizations, features/projects, features/tasks, features/agent-context) — it is systemic, not local to this file.
**decisionNeeded:** This is a shared Redux/thunk-typing gap, not a features/organizations-local fix. Two real options: (A) change AppDispatch's type or add a small typed `dispatchThunk` helper in lib/redux/ so `ThunkAction`-shaped functions dispatch without a cast at any of the 16 sites: (B) leave as-is and accept the repeated cast as intentional debt until a Redux typing pass. Either decision is cross-feature (touches lib/redux/store.ts or lib/redux/hooks.ts, both out of my three scope paths) — recommend routing to whichever agent/wave owns lib/redux/ or agent-context's hierarchyThunks.
**Status:** PENDING
