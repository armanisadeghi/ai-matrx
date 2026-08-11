# @matrx/agents

The portability boundary for the AI Matrx client execution system.

Today the stream wire kernel is genuinely framework-independent; the Redux
surface is still a façade over matrx-frontend and is not yet consumable by a
different repository. See [`FEATURE.md`](FEATURE.md) for the exact maturity
line and versioned convergence plan.

## What's in the box

| Layer            | Contents                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Portable now** | NDJSON framing, UTF-8/read-ahead, cancellation, full + compact event normalization (`@matrx/agents/stream/ndjson`)                                                                                     |
| **Façade only**  | Redux state, thunks, selectors, hooks, reducer map, adapters                                                                                                                                           |
| **Thunks**       | `launchConversation`, `loadConversation`, `executeInstance`, `executeChatInstance`, `createManualInstance`, `editMessage`, `forkConversation`, `softDeleteConversation`, `invalidateConversationCache` |
| **Types**        | `ConversationInvocation`, `ConversationRecord`, `MessageRecord`, `CxUserRequestRecord`, `CxRequestRecord`, `CxToolCallRecord`, `ApiEndpointMode`, full stream-event discriminators                     |
| **Selectors**    | DB-faithful readers + narrow field selectors (see `RE-RENDER-CONTRACT.md`)                                                                                                                             |

## Who consumes this

- **matrx-frontend** — canonical authoring point and first consumer.
- **Workflow Studio + administrative Dashboard** — consume the verbatim
  wire-kernel twin.
- **Future clients** — consume the same twin as v2+ land.

## Usage

```ts
import { readMatrxNdjsonStream } from "@matrx/agents/stream/ndjson";

for await (const event of readMatrxNdjsonStream(response.body!)) {
  // event is normalized regardless of full or compact server syntax.
}
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

## Migration status

Wire parity is v1 and live. Redux extraction is staged in `FEATURE.md`; do not
present the Redux barrels as portable until the host aliases are gone and a
standalone typecheck proves it.

## Key docs

- `src/adapters/README.md` — adapter interfaces + consumer requirements
- `src/config/README.md` — `configure()` contract + runtime registry
- `../../features/agents/redux/execution-system/messages/RE-RENDER-CONTRACT.md`
  — critical read before touching message selectors
- `../../features/agents/conversation-invocation-reference.md`
  — locked `ConversationInvocation` contract
