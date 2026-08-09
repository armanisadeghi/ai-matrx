# Public Chat (residual)

**The `/p/chat` guest chat surface was DELETED on 2026-08-07** (it was orphaned — no inbound links anywhere — and slated for removal per the guest-access-regression plan: restore full anonymous use of `(core)` instead of a parallel guest app). Its private Redux pipeline (`agentCacheSlice` / `agentFetchThunks` / legacy `agentSelectors` / `useAgentCacheConsumer`) was deleted with it; the one sanctioned agent list lives in `features/agents/redux/agent-definition/`.

What remains here is only what OTHER live surfaces still import:

| File | Consumers |
|------|-----------|
| `types/cx-tables.ts` | `lib/chat-protocol`, execution system, canvas materialization, files adapters — the `Cx*` DB row/content-block types |
| `types/content.ts` | `features/cx-chat/types/content.ts` |
| `services/cx-chat.ts` | `app/api/cx-chat/*` and `app/api/extension/append-message` routes |
| `components/AgentSelector.tsx` | `features/cx-conversation/ConversationInput.tsx` |
| `components/GuidedVariableInputs.tsx`, `components/PublicVariableInputs.tsx` | `features/cx-conversation/ConversationInput.tsx` (dynamic imports) |
| `components/PublicMessageOptionsMenu.tsx` | `features/agent-apps` renderers |

`hooks/usePublicScraperContent.ts` was deleted 2026-08-09 — it was a second definition of the quick-scrape request and response shapes, wrapping a Next proxy route that added no anon boundary. The `features/marketing/seo` analyzers now call `useScraperApi()` directly (see `features/scraper/FEATURE.md`).

Do not add new code here. These residuals should migrate into their consumers' features (cx-chat / cx-conversation / agent-apps) over time, at which point this directory dies.
