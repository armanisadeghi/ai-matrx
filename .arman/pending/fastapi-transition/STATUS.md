Here's the full picture.

---

## What was done this round

**Bridge thunks updated** — Both `submitChatFastAPI` and `executeMessageFastAPI` now:
- Use `getState()` properly (fixed bug: was using `useSelector` which is a React hook and can't be called in thunks)
- Transform legacy field names: `model_id` -> `ai_model_id`, `max_tokens` -> `max_output_tokens`, `output_format` -> `response_format`
- Hit the **final** endpoint `POST /api/ai/chat/unified` directly
- Log bold orange `console.warn` deprecation messages for every call, identifying the caller and which old field names still need updating at the source

**Scraper hook updated** — `useScraperApi` now calls the FastAPI backend directly at `/api/scraper/quick-scrape` (no more Next.js proxy hop). Also logs deprecation warning about hardcoded scraper options.

**Two additional migrations** — `useExistingChat.ts` and `ActionConversationModal.tsx` were discovered and migrated (import swap to `submitChatFastAPI`).

---

## FULL LIST: Files NOT yet on final API shapes

### Category 1: Going through `submitChatFastAPI` bridge (working, but callers pass OLD field names)

These files call `submitChatFastAPI` which transforms and forwards correctly, but the **source code** still builds `chatConfig` with old field names (`model_id`, `max_tokens`, `output_format`). Each call logs a deprecation warning. They need to be updated to pass the new field names directly.

| File | Old Fields Used | Task |
|---|---|---|
| `features/prompts/components/builder/PromptBuilder.tsx` | `model_id` | Update chatConfig construction to use `ai_model_id` |
| `features/prompts/components/builder-new/PromptTestPanel.tsx` | `model_id` | Update chatConfig construction |
| `features/prompts/components/actions/prompt-generator/PromptGenerator.tsx` | `model_id` | Update chatConfig construction |
| `features/prompts/components/actions/prompt-optimizers/FullPromptOptimizer.tsx` | `model_id` | Update chatConfig construction |
| `features/prompts/components/actions/prompt-optimizers/SystemPromptOptimizer.tsx` | `model_id` | Update chatConfig construction |
| `features/prompts/hooks/usePromptExecution.ts` | `model_id` | Update chatConfig construction |
| `features/prompt-builtins/admin/GeneratePromptForBuiltinModal.tsx` | `model_id` | Update chatConfig construction |
| `components/admin/GeneratePromptForSystemModal.tsx` | `model_id` | Update chatConfig construction |
| `lib/redux/thunks/promptSystemThunks.ts` | `model_id`, likely `max_tokens` via settings spread | Update chatConfig construction |
| `lib/redux/prompt-execution/thunks/executeMessageThunk.ts` | `model_id` (via `promptSettings.modelId`), `max_tokens` and `output_format` (via `...promptSettings.config` spread) | Update to build final-shape body directly |
| `features/DEPRECATED-matrx-directives/components/ActionConversationModal.tsx` | `model_id` | DEPRECATED — low priority |
| `features/chat/hooks/useExistingChat.ts` | Uses `ai_chat` task (different payload shape entirely: `{ conversation_id, message_object }`) | Needs separate migration to a proper FastAPI chat endpoint |

### Category 2: Deeper issues — callers still wrap in `chat_config` object

All 12 files above still wrap their data in `{ chat_config: { ... } }`. The bridge thunk unwraps this, but they should eventually pass a flat body to the unified API directly, without the `chat_config` wrapper. This is cosmetic in the bridge but matters when components are eventually updated to call the API directly without the thunk.

### Category 3: Settings source of truth still uses old field names

These define the **schema** and **defaults** that flow into chatConfig. Updating them is the root fix.

| File | What needs changing |
|---|---|
| `features/prompts/services/promptBuilderService.ts` | `DEFAULT_SETTINGS.model_id` -> `ai_model_id`, `max_tokens` -> `max_output_tokens` |
| `features/prompts/docs/prompt-settings-schema.ts` | `model_id`, `max_tokens`, `output_format` throughout |
| `features/prompts/docs/PROMPT_SETTINGS_REFERENCE.md` | Documentation references to old field names |
| `features/prompts/components/PromptSettingsModal.tsx` | Saves `max_tokens` and `output_format` to settings object |
| `lib/redux/prompt-execution/selectors.ts` | `selectPromptSettings` returns `modelId` / `config` — config includes old names |

### Category 4: Still on raw socket.io (NOT going through any bridge)

| File | Socket Usage | Notes |
|---|---|---|
| `features/prompt-apps/components/PromptAppPublicRenderer.tsx` | Direct `socket.io-client` import, `socket.emit('chat_service')` | Legacy renderer — no longer imported by any route page, but file still exists |
| `lib/redux/socket-io/hooks/useScraperSocket.ts` | `createTask`, `submitTask`, `createAndSubmitTask` for `scraper_service_v2.quick_scrape` | Legacy hook — scraper pages now use `useScraperApi`, but `useScraperContent.ts` still imports this |
| `features/scraper/hooks/useScraperContent.ts` | Uses `useScraperSocket` | Legacy hook — pages migrated to `useScraperApi` |
| `features/applet/hooks/useAppletRecipe.ts` | `createTask` + `submitTask` for `ai_chat_service.run_recipe_to_chat` | Deferred (applets) |
| `features/chat/hooks/useNewChat.ts` | `createTask` for `chat_service.ai_chat` | Deferred (chat) |
| `components/socket-io/form-builder/ActionButtons.tsx` | `submitTask` (generic form builder) | Socket-specific UI component |
| `lib/redux/socket-io/thunks/createTaskFromPreset.ts` | Socket thunk | Internal socket infrastructure |
| `components/playground/hooks/useAiCockpit.ts` | `useCockpitSocket` | Deferred (cockpit) |
| `features/scraper/ScraperResultsComponent.tsx` | Reads from socket response selectors | Display component for `/scraper/[id]` (socket task results) |
| `features/scraper/parts/recipes/FactChecker.tsx` | Reads from socket response selectors | Scraper recipe component |
| `features/scraper/parts/recipes/useRenQuickRecipe.ts` | Reads from socket response selectors | Scraper recipe hook |

### Category 5: New `service.taskName` discovered during sweep

| `service` | `taskName` | Used By | Status |
|---|---|---|---|
| `chat_service` | `ai_chat` | `useExistingChat.ts`, `useNewChat.ts` | Now goes through `submitChatFastAPI` bridge but payload shape (`conversation_id`, `message_object`) is NOT a `chat_config` — Python team may need a compat endpoint |
| `ai_chat_service` | `run_recipe_to_chat` | `useAppletRecipe.ts` | Still on raw socket.io, deferred |

### Summary

- **13 files** go through the bridge thunk and hit the correct final endpoint, but pass old field names (the bridge transforms them and logs warnings)
- **11 files** are still on raw socket.io (all in deferred features or legacy components)
- **5 files** define the settings schema/defaults with old field names (root cause for Category 1)
- **1 new task** discovered: `chat_service.ai_chat` — different payload shape, needs Python team attention