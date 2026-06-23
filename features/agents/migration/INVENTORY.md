# Inventory — Legacy Prompt Surface ↔ Agent Surface

**Living document.** If you touch any file below or discover a prompt-adjacent surface not listed, update this file in the same commit.

---

## 1. Legacy prompt routes (to remove in Phase 16)

### Authenticated
- `app/(authenticated)/ai/prompts/` — list, new, edit/[id], view/[id], run/[id], templates, templates/[id], compare, edit-redux/[id]
- `app/(authenticated)/ai/prompts/experimental/*` — action-test, broker-test, builder, card-demo, chatbot-customizer (+ instant-custom-chatbot, modular), execution-demo, prompt-overlay-test, result-components, test-controls
- `app/(authenticated)/prompt-apps/` — list, new, [id], templates, templates/[mode]
- `app/(authenticated)/org/[slug]/prompts` + `/org/[slug]/prompt-apps` — placeholder "Coming Soon"
- `app/(authenticated)/layout-tests/prompt-input/`

### Admin (admin-auth)
- `app/(authenticated)/(admin-auth)/administration/prompt-builtins/` — page, builtins, shortcuts, edit/[id]
- `app/(authenticated)/(admin-auth)/administration/shortcut-categories/`
- `app/(authenticated)/(admin-auth)/administration/prompt-apps/`

### SSR mirror
- `app/(dev)/demos/prompts/` — list, new, edit/[id], run/[id], templates/[id]

### Public execution
- `app/(public)/p/[slug]/`
- `app/(public)/p/fast/[slug]/`
- `app/(public)/p/demo/[slug]/`
- `app/(public)/p/fast-test/[slug]/`

## 2. Legacy prompt APIs (to remove in Phase 17)

- `api/prompts/[id]` + `duplicate`, `convert-to-system-prompt`, `convert-to-template`
- `api/prompts/test` (streaming execute)
- `api/prompts/templates/[id]/use`
- `api/system-prompts` + `[id]` + `[id]/link-prompt` + `[id]/compatible-prompts`
- `api/prompt-apps/[id]` + `duplicate` + `generate-favicon`
- `api/public/apps/[slug]/execute` + `api/public/apps/response/[taskId]`
- `api/admin/prompt-builtins` + `[id]` + `create-from-ai` + `user-prompts` + `convert-from-prompt`
- `api/admin/prompt-shortcuts` + `[id]`
- `api/admin/shortcut-categories` + `[id]`
- `api/recipes/[id]/convert-to-prompt` — **dead code, remove**

## 3. Legacy prompt features (to remove in Phase 18)

### `features/prompts/` (~220 files)
- 16 component subdirs: `builder/`, `builder-new/`, `tabbed-builder/`, `universal-editor/`, `smart/`, `results-display/`, `configuration/`, `actions/`, `layouts/`, `variable-inputs/`, `resource-display/`, `dynamic/`, `runner-tester/`, `common/`, plus top-level components
- 17 hooks (incl. `usePromptExecution`, `usePromptRunner`, `usePromptModal`, `useAvailableModels`, `useDynamicContexts`)
- 2 services (`promptBuilderService.ts`, `prompt-import-service.ts`)
- 6 type files, 16 utils

### `features/prompt-builtins/`
- 9 admin components, 14 form/modal components
- 2 hooks (`useContextMenuShortcuts`, `useUnifiedContextMenu`)
- Services: `admin-service.ts`
- Utils: `execution.ts` (`mapScopeToVariables` — **port to `features/agent-shortcuts/utils/`**), `menuHierarchy.ts`, `validation.ts`, `error-handler.ts`
- SQL: `shortcuts_by_placement_view_v2.sql`, `_v3.sql` — **design replacement in Phase 1**

### `features/prompt-apps/`
- 21 components (renderers, editors, forms, error boundaries)
- 4 layout components, 1 hook (`useAutoCreateApp`), 1 service (`slug-service.ts`), 2 utils (`allowed-imports.ts`, `favicon-metadata.ts`)
- 6 sample templates under `sample-code/`

### `features/prompt-actions/`
- Thin: 1 hook, 1 service, types

### `features/context-menu/`
- `UnifiedContextMenu.tsx` (1765 LOC). **Replaced in Phase 3.**

## 4. Legacy Redux (to remove in Phase 18)

### `lib/redux/prompt-execution/`
- `slice.ts` — `instances`, `currentInputs`, `resources`, `uiState`, `dynamicContexts`, `runsByPromptId`, `scopedVariables`
- `selectors.ts` (18.5KB)
- `actionCacheSlice.ts`, `builtins.ts`
- 23 thunks incl. `executeMessageThunk`, `executeMessageFastAPIThunk` (15KB), `startInstanceThunk`, `executeBuiltinWithCodeExtractionThunk`, `executeBuiltinWithJsonExtractionThunk`, `resourceThunks`, `updateDynamicContextThunk`
- `hooks/usePromptInstance.ts`
- `utils/`: `context-formatter`, `message-builder`, `api-payload-builder`, `resourceUtils`

### `lib/redux/slices/`
- `promptEditorSlice`, `promptRunnerSlice`, `promptConsumersSlice`, `promptCacheSlice`

### `lib/redux/selectors/`
- `promptSelectors.ts`

### `lib/redux/thunks/`
- `promptCrudThunks.ts`, `promptSystemThunks.ts`, `openPromptThunk.ts`, `openPromptExecutionThunk.ts`

### `lib/redux/socket-io/`
- `submitTaskThunk`, `submitChatFastAPI`, `submitAppletAgentThunk` — audit and remove the prompt-specific paths in Phase 18.

## 5. Legacy DB tables (to drop in Phase 19)

- `prompts`, `prompt_versions`, `prompt_templates`
- `prompt_apps`, `prompt_app_executions`, `prompt_app_errors`, `prompt_app_rate_limits`, `prompt_app_versions`, `prompt_app_categories`
- `prompt_builtins`, `prompt_builtin_versions`, `prompt_shortcuts`
- `system_prompts`, `system_prompt_executions`
- `prompt_actions`
- `context_menu_unified_view` (view), `shortcuts_by_placement_view` (view)

## 6. Integration surfaces (every one must be rewired — see phase for each)

| Surface | File(s) | How it couples | Phase |
|---|---|---|---|
| UnifiedContextMenu (right-click, 1765 LOC) | `features/context-menu/UnifiedContextMenu.tsx` | `useUnifiedContextMenu` + `usePromptRunner` + `useQuickActions` | 3 |
| Notes editor | `features/notes/components/NoteEditor.tsx` | wraps menu (4 editor-mode branches: plain, wysiwyg, markdown, preview). `NoteEditorCore.tsx` does **not** host the menu — parents wrap. | 5 |
| Code editor menu | `features/code-editor/components/CodeEditorContextMenu.tsx` | wraps menu | 5 |
| Agent builder — user/assistant messages | `features/agents/components/builder/message-builders/MessageItem.tsx` | wraps menu | 5 |
| Agent builder — system message | `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx` | wraps menu | 5 |
| SSR notes parallel menu | `app/(dev)/demos/notes/_components/NoteContextMenuContent.tsx` + `useNoteContextMenuGroups.ts` | **Does not use `UnifiedContextMenu`.** Hand-rolled parity menu that still imports `features/prompt-builtins/utils/execution.ts`, `features/prompt-builtins/types/menu`, and `usePromptRunner`. Port to agent hooks is a later SSR-specific phase. | 7 (chat/SSR) or 18 |
| File-manager context menu (NOT the text/shortcut menu) | `components/file-system/context-menu.tsx` | Distinct component that happens to be named `UnifiedContextMenu`. Pure file/folder/bucket operations — nothing prompt- or agent-related. Leave as is. | — |
| Prompt editor menu | `features/prompts/components/PromptEditorContextMenu.tsx` (+ lazy) | prompt-only, remove | 18 |
| AI Code Editor | `features/code-editor/components/AICodeEditorModalV2.tsx` (+ `AICodeEditor.tsx`, `ContextAwareCodeEditor*`) | `usePromptRunner` | 6 (quick) → 15 (rebuild) |
| Quick Actions | `features/quick-actions/hooks/useQuickActions.ts` + `QuickActionsMenu.tsx` + `QuickChatSheet.tsx` | hardcoded actions | 4 |
| Prompt Apps public renderer | `features/prompt-apps/components/PromptAppPublicRendererFastAPI.tsx` (+ Direct) | Babel sandbox + rate limits | 8 |
| Chat (authenticated paths using prompts) | `features/chat/`, `features/cx-chat/`, `features/public-chat/`, `features/conversation/` | some use `usePromptRunner` | 7 |
| Scope → variables mapping | `features/prompt-builtins/utils/execution.ts` (`mapScopeToVariables`) | bridge between UI context and prompt vars | 1 (port) |
| Applets (parent-child apps with shared context) | `features/applet/` + `app/(authenticated)/apps/custom/[slug]/[appletSlug]/` | older vision of the app pattern we want | 10 |

## 7. Agent-side surface (what already exists — do not rebuild)

### Routes
- `app/(a)/agents/` — list, `[id]`, `[id]/build`, `[id]/run`, `[id]/latest`, `[id]/widgets`, `[id]/v/[version]`, `new` (+ manual/generate/builder/import, + builder variants instant/customizer/tabs), `compare`, `templates`, `templates/[id]`
- `app/(public)/demos/api-tests/agent/`, `p/research/topics/[topicId]/agents/`
- `app/(dev)/demos/chat/a/[agentId]/`, `ssr/demos/agent-selector-demo/`

### API
- `api/agents/[id]/convert-to-template`
- `api/agents/templates/[id]/use`
- `api/agent/feedback`

### `features/agents/`
- 23 component subdirs — see `features/agents/docs/AGENTS_OVERVIEW.MD` for tour
- `agent-creators/` — all builder variants
- `redux/execution-system/` (67 files) — conversations, messages, instance-*, active-requests, conversation-focus, message-crud, message-actions, thunks, sagas, utils, selectors
- `redux/` slices: `agent-definition`, `conversation-list`, `agent-apps`, `agent-shortcuts`, `agent-consumers`, `tools`, `mcp`
- `services/`: `mcp.service.ts` + `mcp-client/` + `mcp-oauth/`
- `hooks/`: `useAgentLauncher`, `useAgentConsumer`, `useMcpTools`, `useAgentUndoRedo`, `useModelControls`, `useWidgetHandle`, `useSmartVersionFetch`, `useAgentAutoSave`, `useDiffEnrichment`, message-crud hooks
- Package: `packages/matrx-agents/`

### DB (agent)
- `agx_agent`, `agx_agent_templates`, `agx_version`, `agx_shortcut` (multi-scope via `user_id`, `organization_id`, `project_id`, `task_id`)
- `shortcut_categories` — **not multi-scope yet, fix in Phase 1**
- `agent_conversations`, `agent_requests`, `cx_conversation`, `cx_message`, `cx_user_request`, `cx_request`, `cx_tool_call`, `cx_agent_memory`
- **Phase 8 tables (live, named with `aga_` prefix):** `aga_apps`, `aga_executions`, `aga_errors`, `aga_rate_limits`, `aga_versions`, `aga_categories`. RPC `get_aga_public_data(p_slug, p_app_id)` returns the public-safe subset of an agent-app row. (The original migration files were drafted against the names `agent_apps` / `get_agent_app_public_data` etc.; the deployed schema renamed them but a partial rename in runtime code was finished on 2026-04-25 — see Change log.)

### `features/agent-apps/` (Phase 8)
- Public renderer (`AgentAppPublicRenderer`), editor, preview, header, forms/modals, layouts (grid/card/list-item), searchable agent select, error boundary.
- `utils/allowed-imports.ts` (verbatim port from prompt-apps — security-critical, do not widen).
- `utils/favicon-metadata.ts`, `services/slug-service.ts`.
- `sample-code/templates/` — 5 display-mode templates (form / form-to-chat / chat / centered-input / chat-with-history).

### API (agent apps, Phase 8)
- `api/public/agent-apps/[slug]/execute` (POST/PATCH/GET) — guest-limited, fingerprinted, streaming proxy to `/ai/agents/{agentId}`.
- `api/public/agent-apps/response/[taskId]` (GET) — polls `ai_tasks`.
- `api/agent-apps/[id]` (GET/PATCH/DELETE), `/duplicate`, `/generate-favicon`.

---

## 8. Surfaces to sweep later

Prompt-adjacent surfaces discovered during later phases that are **out of the current phase scope** but need a dedicated sweep before the Phase 18 deletion campaign.

| Surface | Couples via | Discovered | Target phase |
|---|---|---|---|
| `features/cx-chat/` | Imports `features/prompts/types/core` + `features/prompts/types/resources` (types) and four components: `ResourceChips`, `ResourcesContainer`, `ModelSettingsDialog`, `VariableInputComponent`. **No `usePromptRunner`.** See `features/cx-chat/MIGRATION-TRACKER.md` for the full remap table. | Phase 7 | Pre-18 sweep |
| `features/public-chat/` | Imports `features/prompts/**` types across ~11 files (`AgentPickerSheet`, `ChatContainer`, `GuidedVariableInputs`, `MessageDisplay`, `PromptPickerMenu`, `PublicVariableInputs`, `resource-picker`, `SidebarAgents`, `DEPRECATED-ChatContext`, `types/content`, `utils/agent-resolver`). **No `usePromptRunner`.** | Phase 7 | Pre-18 sweep |
| SSR notes parallel menu | `app/(dev)/demos/notes/_components/NoteContextMenuContent.tsx` + `useNoteContextMenuGroups.ts` — still imports `usePromptRunner` + `features/prompt-builtins/**`. (Also listed in §6 row; cross-referenced here for sweep planning.) | Phase 5 | Pre-18 sweep |
| `features/agents/` self-imports | `AgentsGrid.tsx` → `DesktopFilterPanel` (prompts layout); `SystemMessage.tsx` → `SystemPromptOptimizer` (prompt-actions); `SmartAgentResourcePickerButton.tsx` → `Resource` type | 2026-05-04 audit | Pre-18 sweep |
| `features/code-editor/` extras | `ContextAwareCodeEditorModal.tsx` (2 imports) + `ContextAwareCodeEditorCompact.tsx` (2 imports) + `AICodeEditor.tsx` (1 import) all pull from `features/prompts/components/`. Not in Phase 6 plan. | 2026-05-04 audit | Phase 6 (extend) |
| `features/cx-conversation/` | 4 files / 9 imports from `features/public-chat/` (`ConversationInput`, `useConversationSession`, `UnifiedChatWrapper`, `UserMessage`). Chat-on-chat coupling. | 2026-05-04 audit | Pre-18 sweep |
| `features/conversation/` (the Tier-1 doc'd feature) | 3 files import `Resource` type from `features/prompts/types/resources`: `useAuthenticatedChatProps`, `usePublicChatProps`, `resource-parsing`. | 2026-05-04 audit | Pre-18 sweep (relocate `Resource` type) |
| `features/ai-models/` | `DeprecatedModelsAudit.tsx`, `ModelUsageAudit.tsx`, `services/service.ts` import prompt types. | 2026-05-04 audit | Pre-18 sweep (type relocation) |
| `features/ai-runs/` | `utils/name-generator.ts` imports prompt types. | 2026-05-04 audit | Pre-18 sweep (type relocation) |
| `features/content-templates/` | `ContentTemplateManager.tsx` + `SaveTemplateModal.tsx` import from prompts. Owner unclear. | 2026-05-04 audit | Pre-18 sweep |
| `lib/redux/socket-io/` (entire directory) | **NOT legacy-only.** `submitChatFastAPI`, `submitTaskThunk`, socket slices/selectors are shared infrastructure used by `features/chat/useExistingChat`, admin prompt generators, applet feature, scraper, AI cockpit. Phase 18 must NOT delete the directory — only the prompt-specific paths inside it. | 2026-05-04 audit | Reclassify (keep) |
| `promptConsumersSlice` | Reused by `features/cx-chat/hooks/useAgentConsumer.ts` for filter/sort state. Genuinely agnostic — keep, rename, or fold into an agent slice; do not delete blindly. | 2026-05-04 audit | Reclassify (keep) |
| `/p/chat` (and `/p/chat/a/[id]`, `/p/chat/c/[id]`) | Backed by `features/public-chat/`. **No agent-equivalent route exists** — `/p/[slug]` is single-app-only. Multi-agent public chat picker is missing from the migration plan. | 2026-05-04 audit | New design or sunset before Phase 16 |

**Change log** (append entries as this file changes)

| Date | Who | Change |
|---|---|---|
| 2026-04-20 | initial audit | Created inventory from Explore-agent sweep |
| 2026-04-20 | main agent | Phase 1 code-complete. Discovered `content_blocks` table already exists (not `prompt_content_blocks`) — decision to extend rather than fork logged in DECISIONS.md. Added `agent_context_menu_view`, scope-aware RLS on `agx_shortcut`, three RTK slices under `features/agents/redux/` (`agent-shortcuts` extended, `agent-shortcut-categories`, `agent-content-blocks`), seven REST routes under `/api/agent-*`, and shared CRUD components at `features/agent-shortcuts/`. |
| 2026-04-21 | claude (phase-3) | Phase 3 code-complete. Added `features/context-menu-v2/` (new directory; legacy `features/context-menu/` untouched) with `UnifiedAgentContextMenu`, `useUnifiedAgentContextMenu`, `MenuBody`, `FloatingSelectionIcon`, and `selection-tracking` util. Added `migrations/get_ssr_agent_shell_data_rpc.sql` as an additive SSR RPC (legacy `get_ssr_shell_data` unchanged). Added `app/(a)/demos/context-menu-v2/page.tsx` smoke-test route. Discovered: (a) `/api/agent-context-menu` ignores scope query-string params — relies on RLS, fine for now. (b) `contextMenuCacheSlice` (legacy SSR cache at `lib/redux/slices/contextMenuCacheSlice.ts`) is still the only wired-up SSR hydration slot; a separate `agentContextMenuCache` slice would be needed only if we decide to pre-hydrate the agent slices at SSR time — deferred to Phase 5. |
| 2026-04-21 | claude (phase-6) | Phase 6 **blocked** (code shipped, agent-id missing). Swapped `usePromptRunner` → `useAgentLauncher` in `features/code-editor/components/AICodeEditorModalV2.tsx` (only file in `features/code-editor/` that actually imported `usePromptRunner`; grep confirmed). Added Phase 6 marker comments to the other three phase-scoped files. Discoveries: (1) the live prompt-app editor path (`features/prompt-apps/components/PromptAppEditor.tsx` → `AICodeEditorModal` → `AICodeEditor` → `useAICodeEditor`) never touched `usePromptRunner` — it talks directly to the prompt-execution slice, so the swap is zero-break for the live feature. (2) `AICodeEditorModalV2` is consumed only by `MultiFileCodeEditor.tsx` (V2 branch) and demo routes under `app/(authenticated)/demo/component-demo/ai-prog/…`. (3) **Blocker:** the prompt-builtin UUIDs used for code editing (`prompt-app-ui-editor` `c1c1f092…`, `generic-code-editor` `87efa869…`, `code-editor-dynamic-context` `970856c5…`) have no `agx_agent` equivalent; the wrapper passes the prompt-builtin UUID as a placeholder `agentId` into `launchAgent`, which will error at the agent-definition loader until a human decides which agents should back these surfaces. |
| 2026-04-21 | claude (phase-7) | Phase 7 code-complete (partial — community picker stubbed, shortcuts hardcoded). Added §8 "Surfaces to sweep later" for `features/cx-chat/` and `features/public-chat/` — both import `features/prompts/**` for types/components but **do not** use `usePromptRunner`, so they're blockers for Phase 18 deletion but not for shipping the new `/chat` route. |
| 2026-04-21 | claude (phase-5) | Phase 5 complete. Rewired every non-prompt consumer of `UnifiedContextMenu` to `UnifiedAgentContextMenu`: `features/notes/components/NoteEditor.tsx` (dynamic import + 4 JSX branches), `features/code-editor/components/CodeEditorContextMenu.tsx` (also swapped `PLACEMENT_TYPES` import from `prompt-builtins` to `agent-shortcuts`), `features/agents/components/builder/message-builders/MessageItem.tsx`, `features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx`. SSR RPC decision: **parallel call** — `DeferredShellData` now fetches `get_ssr_shell_data` and `get_ssr_agent_shell_data` in `Promise.all`; new `agentContextMenuCacheSlice` stores the agent rows; v2 hook prefers it and falls back to the legacy cache as a warm signal during migration. Discoveries: (1) `components/file-system/context-menu.tsx` is a **separate** `UnifiedContextMenu` class (file-manager operations, zero prompt/agent coupling) — intentionally left as-is. (2) `features/notes/components/NoteEditorCore.tsx` mentioned in the phase plan does **not** wrap the menu itself — the real consumer is the parent `NoteEditor.tsx`. (3) SSR notes route (`app/(dev)/demos/notes/_components/NoteContextMenuContent.tsx`) is a hand-rolled parity implementation that still couples to `features/prompt-builtins/**` and `usePromptRunner` — **not a `UnifiedContextMenu` consumer**, so out of Phase 5 scope; tracked above as a later phase. Remaining `UnifiedContextMenu` imports are entirely inside `features/context-menu/`, `features/prompts/`, `features/prompt-builtins/`, and `app/(authenticated)/ai/prompts/experimental/` (all scheduled for Phase 16/18 removal). |
| 2026-04-25 | claude (data-migration) | Migrated 54 of 61 `prompt_apps` rows into `aga_apps` via `migrations/migrate_prompt_apps_to_aga_apps.sql`. Pre-flight verified `prompt_id ↔ agx_agent.id` is 100% (IDs preserved during the prior prompts→agents migration). All 61 `prompt_version_id`s were orphaned in `agx_version` → migration sets `use_latest=true, agent_version_id=NULL` on every row. `status='published'` rows flipped to `is_public=true` so the dual-path resolver in `/p/[slug]` can serve them. 7 apps with variable-name mismatches between their `variable_schema` and the agent's `variable_definitions` (`metro_name`/`metro_area_name` → `region_name`, `state` → `state_name`, orphan `presentation_style`) were skipped — they remain on the legacy prompt-app path until a follow-up patches their input field names. `success_rate` was normalized from mixed 0..100 / 0..1 to 0..1 fraction. Aggregate counters (`total_executions`, `total_tokens_used`, `total_cost`, etc.) carried over so dashboards don't reset. Raw `prompt_app_executions` and `prompt_app_errors` rows NOT migrated — they stay in legacy tables until Phase 19. Rollback (scoped): `DELETE FROM aga_apps WHERE metadata ? 'migrated_from_prompt_app'`. Also fixed pre-existing partial-rename bug: 18 `.from("agent_apps")` runtime calls renamed to `.from("aga_apps")` across `app/(public)/p/[slug]/page.tsx`, `app/api/agent-apps/**`, `app/api/public/agent-apps/[slug]/execute/route.ts`, `lib/services/agent-apps-admin-service.ts`. The mismatch had gone unnoticed only because no rows had ever flowed through these code paths until this migration. |
| 2026-04-28 | claude (phase-21) | Phase 21 created (resource pills + error inspection + unified context menu in the new `(a)/code` workspace). Phase 0 docs pass complete: cross-referenced [`features/code-editor/FEATURE.md`](../code-editor/FEATURE.md) ↔ new [`features/code/FEATURE.md`](../code/FEATURE.md) (chat-binding split: legacy uses `cx-conversation`, new uses `AgentRunnerPage`), created phase doc at [`phases/phase-21-code-workspace-resource-pills.md`](./phases/phase-21-code-workspace-resource-pills.md). Implementation 21.1–21.7 pending. Phase 21 is **enhancement** of the new workspace, **not** migration of the legacy embedded editor — does not gate or get gated by 14–20. |
| 2026-05-02 | claude (tool-injection) | Unified tool-injection contract migration shipped. Replaced legacy `client_tools` / `custom_tools` / `ide_state` / `sandbox` request fields with the new `tools` (ToolSpec[]) / `tools_replace` / `client` (ClientContext envelope) shape on every agent endpoint. Killed `executeChatInstance` and `assembleChatRequest` outright (`features/agents/redux/execution-system/thunks/execute-chat-instance.thunk.ts` deleted) plus the demo route `app/(public)/demos/api-tests/matrx-ai/chat-demo/`. All consumers (`AgentRunner`, `AssistantCardStack`, `CompactAssistantInput`, `create-instance.thunk`, `launch-agent-execution.thunk`, `smart-execute.thunk`, `packages/matrx-agents/src/redux/thunks.ts`) now route through `executeInstance`. Added `features/agents/types/tool-injection.types.ts`, `features/agents/redux/execution-system/utils/build-tool-injection.ts`, `features/agents/redux/execution-system/client-capabilities/{registry,sandbox-fs,editor-state,register-all}.ts`, `features/code-editor/redux/editor-state.slice.ts`, and `features/agents/redux/execution-system/active-tools/active-tools.slice.ts`. Wired the editor-state capability — `useIdeContextSync` now dispatches both legacy `setContextEntries` (for ctx_get) and new `setEditorState` (for the envelope). RESOURCE_CHANGED with kind `active_tools` now dispatches `invalidateActiveTools` so toolbar UIs can refetch. 422s starting with "client capability" or containing "tool"+"merge"/"capability" surface as a sonner toast. Phase 7 (DB `agx_agent.tool_config` JSONB switchover) follows separately. **Out of this PR but flagged for the prompts kill:** `ENDPOINTS.ai.chat` alias still has 7 callers in legacy prompts/test paths (`features/prompt-apps/components/PromptAppPublicRendererDirectImpl.tsx`, demo/test routes, `lib/redux/prompt-execution/thunks/executeMessageFastAPIThunk.ts`, `lib/redux/socket-io/thunks/submitChatFastAPI.ts`); `features/public-chat/hooks/DEPRECATED-useAgentChat.ts` (still wired into `/p/chat`); `features/tool-call-visualization/admin/hooks/useToolComponentAgent.ts` (admin debug, two consumers). Stripped the empty legacy `client_tools: []` / `custom_tools: []` from the deprecated chat hook; everything else stays intact since it doesn't ship the four legacy tool-injection fields. |
| 2026-05-04 | claude (audit-legacy-systems) | Follow-up pass on the "must-haves": (a) **prompt_apps migration is COMPLETE** — DB query confirms all 61 rows are in `aga_apps` with `metadata.migrated_from_prompt_app` markers, and a separate query for `aga_apps.variable_schema` names that don't exist in the linked agent's `variable_definitions` returned **zero rows**. The previously-reported "7 unmigrated" issue is resolved; either the migration script handled the renames or someone patched the outliers manually. Update Phase 19 prerequisites accordingly. (b) **Code-editor agents verified** — `agx_agent` rows for `c1c1f092…` (Prompt App Code Editor), `87efa869…` (Code Editor), and `970856c5…` (Code Editor (Dynamic Context)) all exist at the same UUIDs as the prompt-builtins. Phase 6 unblocked — the migration is real code work, not a DB blocker. (c) **Quick Actions parity fix shipped** — added `quickChatWindow` window registry entry to mirror `quickDataWindow`, restoring sheet/window symmetry between Quick Chat and Quick Data. (d) Three new migration playbooks created: [`MIGRATE-applets-to-agents.md`](./MIGRATE-applets-to-agents.md), [`MIGRATE-p-chat-to-agent-chat.md`](./MIGRATE-p-chat-to-agent-chat.md), [`MIGRATE-code-editors-to-agents.md`](./MIGRATE-code-editors-to-agents.md). Each has DB confirmation, file-by-file recipes, gotchas, and ordered checklists. (e) Confirmed admin prompt-builtins UI is fully replaced by `system-agents/*` admin routes — no gaps. |
| 2026-05-04 | claude (audit-legacy-systems) | Final pre-deletion audit shipped at [`FINAL-AUDIT-2026-05-04.md`](./FINAL-AUDIT-2026-05-04.md). Added 11 new rows to §8 covering: (a) `features/agents/`, `features/code-editor/`, `features/cx-conversation/`, `features/conversation/`, `features/ai-models/`, `features/ai-runs/`, `features/content-templates/` all pull from legacy dirs in undocumented places; (b) `lib/redux/socket-io/` is **shared infrastructure**, not legacy-only — `submitChatFastAPI`, `submitTaskThunk`, and the socket slices/selectors are used by `features/chat/useExistingChat`, admin prompt generators, applet, scraper, AI cockpit, so the directory survives Phase 18 even though its prompt-specific paths don't; (c) `promptConsumersSlice` is genuinely agnostic and reused by `cx-chat` for filter/sort state — reclassify as keep/rename, don't delete; (d) **`/p/chat` has no agent-equivalent route** — `/p/[slug]` is single-app-only, the multi-agent public chat picker is missing from the migration plan and needs either a new design or a sunset decision before Phase 16. The audit also lists the 7 unmigrated `prompt_apps` rows (variable-name mismatches) as a Phase-19 blocker, and consolidates the open Phase 4/6/10 design questions into a "10 ordered prerequisites for Phases 16-19." |
| 2026-04-21 | claude (phase-08) | Phase 8 code-complete (pending DB). Added: 7 migrations for `agent_apps`, `agent_app_executions`, `agent_app_errors`, `agent_app_rate_limits`, `agent_app_versions`, `agent_app_categories`, and `get_agent_app_public_data` RPC. New feature directory `features/agent-apps/` (20 files — public renderer, editor, forms, modals, layouts, allowed-imports verbatim port, 5 sample templates, slug-service). New public API routes `/api/public/agent-apps/[slug]/execute` (POST/PATCH/GET) and `/api/public/agent-apps/response/[taskId]` (GET). New authenticated CRUD `/api/agent-apps/[id]` + `/duplicate` + `/generate-favicon`. `/p/[slug]` now resolves agent apps first (new `get_agent_app_public_data` RPC) and falls through to the prompt-app resolver on miss; dev-only console trace indicates which path was taken. Rate-limit enforcement lives in the `enforce_agent_app_rate_limit()` BEFORE-INSERT trigger on `agent_app_executions` — raises `check_violation` which the Next.js route maps to HTTP 429. `allowed-imports.ts` ported byte-identical (only doc comment + log-tag renamed). New §6 row for the public prompt-apps runner is effectively superseded by the Phase 8 agent-apps runner during dual-run. |
