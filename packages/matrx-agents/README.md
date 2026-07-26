# @matrx/agents

Unified Redux state + thunks + selectors for the AI Matrx agent system.
Framework-agnostic — consumers plug in their own Supabase client, `fetch`
implementation, and callback manager via `configure()`.

## What's in the box

| Layer | Contents |
|---|---|
| **State** | `conversations`, `messages` (DB-faithful), `conversationList`, `variables`, `modelConfig`, `resources`, `context`, `clientTools`, `input`, `display`, `activeRequests`, `observability`, `cacheBypass`, `messageActions`, `conversationFocus`, `agentDefinition`, `agentShortcut`, `agentApp`, `agentConsumers`, `tools`, `mcp` |
| **Thunks** | `launchConversation`, `loadConversation`, `executeInstance`, `executeChatInstance`, `createManualInstance`, `editMessage`, `forkConversation`, `softDeleteConversation`, `invalidateConversationCache` |
| **Types** | `ConversationInvocation`, `ConversationRecord`, `MessageRecord`, `CxUserRequestRecord`, `CxRequestRecord`, `CxToolCallRecord`, `ApiEndpointMode`, full stream-event discriminators |
| **Selectors** | DB-faithful readers + narrow field selectors (see `RE-RENDER-CONTRACT.md`) |

## Who consumes this

- **matrx-admin** (Next.js) — the original home; bootstraps the package via the Redux root reducer.
- **Future React Native app** — same Redux state shape; RN-specific Supabase client + `fetch` passed via `configure()`.
- **Future Vite web app** — same.
- **Lightweight HTML/JS clients** — import selectors + the launch thunk, drive state without React.

## Usage

```ts
// Once, at app boot — BEFORE the store is constructed.
import { configure } from "@matrx/agents/config";
import { supabase } from "./my-supabase-client";

configure({
  supabase,                 // SupabaseLike — see @matrx/agents/adapters/supabase
  fetch: globalThis.fetch,  // FetchLike — see @matrx/agents/adapters/fetch
  apiBaseUrl: "https://api.matrx.example",
  callbackManager: myCallbackManager, // CallbackManagerLike
  logger: console,          // LoggerLike (optional)
});

// Then consume slices, thunks, selectors from their direct subpaths.
import { launchConversation } from "@matrx/agents/redux/thunks";
import type { ConversationInvocation } from "@/features/agents/types/conversation-invocation.types";

store.dispatch(launchConversation(invocation));
```

## Architecture — why an adapter layer?

The package must never import directly from:
- `@/utils/supabase/client` — Next.js-specific; RN needs its own client.
- `@/lib/api/endpoints` — the consumer owns endpoint mapping.
- `@/lib/redux/store` — types-only; the consumer owns the store.
- `globalThis.fetch` — at runtime yes, but we accept a typed `FetchLike` so tests and non-browser clients can stub it.
- `@/utils/callbackManager` — the callback manager can be a simple `Map` on an HTML/JS client; the package only needs an id-based trigger API.

`configure()` registers adapter implementations into a module-level registry
that the package reads at dispatch time. This keeps the state model identical
across surfaces while letting each consumer wire its own environment.

## Migration status (in-repo)

This package is in the **scaffold** phase. The app still imports from
`@/features/agents/redux/...`; the package re-exports those paths from
direct modules under `src/redux/*` and `src/config/registry.ts`. Physical
file extraction happens in subsequent waves documented in `MIGRATION.md`.

## Key docs

- `src/adapters/README.md` — adapter interfaces + consumer requirements
- `src/config/README.md` — `configure()` contract + runtime registry
- `../../features/agents/redux/execution-system/messages/RE-RENDER-CONTRACT.md`
  — critical read before touching message selectors
- `../../features/agents/conversation-invocation-reference.md`
  — locked `ConversationInvocation` contract
