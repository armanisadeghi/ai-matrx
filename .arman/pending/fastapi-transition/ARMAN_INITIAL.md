# Socket.io → FastAPI Migration: Entry Point

> **This is the single starting point.** Read `00-MIGRATION-OVERVIEW.md` first, then the other docs in order.

---

## Document Map

| # | Document | What's In It | Read When |
|---|---|---|---|
| 0 | [00-MIGRATION-OVERVIEW.md](./00-MIGRATION-OVERVIEW.md) | Master plan: what exists, what's being replaced, status at a glance | **First — always** |
| 1 | [01-ROUTE-INVENTORY.md](./01-ROUTE-INVENTORY.md) | Per-route verified audit: transport, Redux deps, migration strategy, key files | Before touching any route |
| 2 | [02-UNIFIED-LAYER-SPEC.md](./02-UNIFIED-LAYER-SPEC.md) | What to build (and what NOT to — most infra already exists), endpoint contracts, canonical streaming pattern | Before writing any code |
| 3 | [03-MIGRATION-PLAYBOOK.md](./03-MIGRATION-PLAYBOOK.md) | Phase-by-phase execution, parallel work tracks, checklists, rollback plan | When executing migration |

---

## Migration Status (Updated Feb 19, 2026)

### COMPLETED

| Route / Component | What Changed | File(s) Modified |
|---|---|---|
| `/p/[slug]` | Swapped `PromptAppPublicRenderer` → `PromptAppPublicRendererFastAPI` | `app/(public)/p/[slug]/page.tsx` |
| `executeMessage` thunk | Built `executeMessageFastAPI` bridge thunk; wired into `executeMessageThunk.ts` with `USE_FASTAPI=true` flag | `lib/redux/prompt-execution/thunks/executeMessageFastAPIThunk.ts` (new), `executeMessageThunk.ts` |
| `PromptAppRenderer` (authenticated) | Replaced socket.io with direct FastAPI agent calls | `features/prompt-apps/components/PromptAppRenderer.tsx` |
| Scraper pages | Replaced `useScraperSocket` with `useScraperApi` hook (calls `/api/scraper/content`) | `features/scraper/hooks/useScraperApi.ts` (new), `app/(authenticated)/scraper/page.tsx`, `scraper/quick/page.tsx` |
| `submitChatFastAPI` | Drop-in replacement for `createAndSubmitTask` — same return shape, dispatches to same Redux slices | `lib/redux/socket-io/thunks/submitChatFastAPI.ts` (new) |
| PromptBuilder | Import swap to `submitChatFastAPI` | `features/prompts/components/builder/PromptBuilder.tsx` |
| PromptTestPanel | Import swap to `submitChatFastAPI` | `features/prompts/components/builder-new/PromptTestPanel.tsx` |
| PromptGenerator | Import swap to `submitChatFastAPI` | `features/prompts/components/actions/prompt-generator/PromptGenerator.tsx` |
| FullPromptOptimizer | Import swap to `submitChatFastAPI` | `features/prompts/components/actions/prompt-optimizers/FullPromptOptimizer.tsx` |
| SystemPromptOptimizer | Import swap to `submitChatFastAPI` | `features/prompts/components/actions/prompt-optimizers/SystemPromptOptimizer.tsx` |
| usePromptExecution hook | Import swap to `submitChatFastAPI` | `features/prompts/hooks/usePromptExecution.ts` |
| GeneratePromptForBuiltinModal | Import swap to `submitChatFastAPI` | `features/prompt-builtins/admin/GeneratePromptForBuiltinModal.tsx` |
| GeneratePromptForSystemModal | Import swap to `submitChatFastAPI` | `components/admin/GeneratePromptForSystemModal.tsx` |
| promptSystemThunks | Import swap to `submitChatFastAPI` | `lib/redux/thunks/promptSystemThunks.ts` |

### ALREADY CLEAN (No Migration Needed)

- `/p/chat` — uses `useAgentChat` (FastAPI native)
- `/p/fast/[slug]` — uses `PromptAppPublicRendererFastAPI`
- `/p/fast-test/[slug]` — uses `SampleAppTestWrapper` (FastAPI native)
- `/p/research` — no socket.io deps
- `/p/demo/[slug]` — uses `PromptAppPublicRendererDirect` (FastAPI native)
- `/notes` — no socket.io deps
- `/canvas` — no socket.io deps
- `/ai/runs` — no socket.io deps

### REMAINING (Low Priority / Deferred)

| File | Reason |
|---|---|
| `features/DEPRECATED-matrx-directives/ActionConversationModal.tsx` | DEPRECATED feature |
| `features/applet/hooks/useAppletRecipe.ts` | In deferred list (`/applets`) |
| `components/socket-io/form-builder/ActionButtons.tsx` | Generic socket form builder |
| `features/chat/hooks/useExistingChat.ts` | In deferred list (`/chat`) |
| `features/scraper/hooks/useScraperContent.ts` | Still uses socket.io internally; pages now use `useScraperApi` instead |

## Core Architecture

```
Prompt/Builtin → POST /api/ai/agent/execute   (Agent path)
Raw Messages   → POST /api/ai/chat/unified    (Chat path)
Both return    → NDJSON stream (StreamEvent per line)
Parse with     → parseNdjsonStream() from lib/api/stream-parser.ts
Auth with      → useApiAuth() → getHeaders()
```

## Key New Files

| File | Purpose |
|---|---|
| `lib/redux/prompt-execution/thunks/executeMessageFastAPIThunk.ts` | Bridge thunk: replaces `createAndSubmitTask` in the prompt execution slice, dispatches to same Redux actions |
| `lib/redux/socket-io/thunks/submitChatFastAPI.ts` | Drop-in replacement for `createAndSubmitTask` — same signature, same return shape `{ taskId, submitResult }`. Components swap ONE import. |
| `features/scraper/hooks/useScraperApi.ts` | Simple hook calling `/api/scraper/content` — returns structured data without socket.io |

## Rollback

Every migration has a flag or is a single import change:
- `executeMessageThunk.ts`: Set `USE_FASTAPI = false` to revert to socket.io
- All `submitChatFastAPI` imports: Change back to `import { createAndSubmitTask } from '@/lib/redux/socket-io/thunks/submitTaskThunk'`
- `/p/[slug]`: Change import back to `PromptAppPublicRenderer`
- `PromptAppRenderer.tsx`: Revert via git (full component rewrite)
- Scraper pages: Change import back to `useScraperSocket`
