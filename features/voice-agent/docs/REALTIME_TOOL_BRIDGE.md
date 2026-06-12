# Realtime Tool Bridge — design spec

Status: **proposed** (not implemented). Audience: the Python-backend (aidream) agent
implementing the execution endpoint **and** the frontend agent wiring the client loop.

## Goal

Let a **live voice session** (xAI Grok Realtime, `features/voice-agent/`) call **the exact
same tools** an agent has in the turn-based path — registry tools, MCP tools, skill tools —
without re-implementing any tool. The voice session is browser ↔ xAI directly (no Python in
the audio loop), so when Grok asks to call a server-executed tool, the **browser** calls a
Python endpoint, gets the result, and forwards it back to Grok over the WebSocket.

Design principle: **reuse the existing Python agent tool harness.** This bridge is a thin
HTTP front door to execution that already exists; it is not a new tool runtime.

## Background: the xAI realtime function-call loop

xAI Realtime is OpenAI-Realtime-compatible. Custom function tools are fully supported:

1. **Declare** tools in `session.update`:
   `tools: [{ type: "function", name, description, parameters: <JSON Schema> }, ...]`
   (Built-in tools stay as `{ type: "web_search" }` / `{ type: "x_search" }`.)
2. Model emits **`response.function_call_arguments.done`** → `{ name, arguments, call_id }`
   (`arguments` is a JSON string). Multiple calls may arrive before `response.done`.
3. We **execute** each call.
4. We send **`conversation.item.create`** with `{ type: "function_call_output", call_id, output }`
   for every `call_id`.
5. We send **one** `response.create` after all outputs are submitted.

Builders already exist: `buildFunctionCallOutput`, `buildResponseCreate`,
`buildSessionUpdate` in `features/voice-agent/transport/clientEvents.ts`. The
`response.function_call_arguments.done` handler in
`features/voice-agent/hooks/useXaiVoiceSession.ts` is currently a no-op stub.

## Two responsibilities, two endpoints

### 1. Resolve tool specs (declaration)

Before a session starts we must declare tools in xAI's function format. Registry/MCP/skill
tool schemas live server-side, so the client cannot build them alone.

```
POST {PYTHON_BACKEND}/ai/agents/{agentId}/realtime-tools
Authorization: Bearer <supabase jwt>
Content-Type: application/json

Request body (optional overrides):
{
  "added_tool_ids": ["<uuid>", ...],   // per-conversation additions, mirrors addedTools
  "surface": "matrx-user/chat-voice"   // for surface-default tool resolution
}

Response 200:
{
  "tools": [
    {
      "name": "search_notes",
      "description": "Search the user's notes by query.",
      "parameters": { "type": "object", "properties": { ... }, "required": [...] },
      "execution": "server"            // "server" | "client" | "builtin"
    },
    { "name": "web_search", "execution": "builtin" },
    ...
  ]
}
```

- `execution: "builtin"` → declare to xAI as `{ type: "web_search" | "x_search" }`, never routed to us.
- `execution: "server"` → declare as `{ type: "function", name, description, parameters }`; on call, route to the execute endpoint.
- `execution: "client"` → declare as function; on call, the browser runs it locally (delegate tools — see classification below).

The server resolves the same set the turn-based path would inject (saved agent tools +
`added_tool_ids` + surface defaults), reusing `tool_resolve_for_request`.

### 2. Execute a tool

```
POST {PYTHON_BACKEND}/ai/tools/execute
Authorization: Bearer <supabase jwt>
Content-Type: application/json

Request body:
{
  "agent_id": "<uuid>",
  "conversation_id": "<uuid|null>",     // voiceAgentSlice conversationId if persisting
  "tool_name": "search_notes",
  "arguments": { ... },                 // parsed from the xAI arguments JSON string
  "context": {                          // same envelope the agent path resolves
    "organization_id": "<uuid|null>",
    "project_id": "<uuid|null>",
    "task_id": "<uuid|null>",
    "scope_ids": ["<uuid>", ...]
  }
}

Response 200:
{
  "ok": true,
  "output": "<string>"                  // forwarded verbatim as function_call_output.output
}

Response 200 (tool error — still 200 so the model can recover):
{
  "ok": false,
  "output": "Tool failed: <human-readable reason>"
}
```

- `output` is always a **string** (xAI `function_call_output.output` is a string). Structured
  results should be JSON-stringified by the server.
- **Permissions:** enforce the same authorization as the normal agent path. Do NOT expose an
  unguarded "run any tool as any user" RPC. The JWT identifies the user; `context` scopes the
  resources. Reject tools the user/agent isn't entitled to.
- **MCP/skills:** route through the existing harness so MCP servers and skill tools work
  unchanged.

## Client-side classification (which path a call takes)

The frontend already distinguishes client- vs server-executed tools via `ToolSpec.delegate`
in `features/agents/redux/execution-system/utils/build-tool-injection.ts`
(`delegate: true` = browser-executed; `delegate: false` = server registry tools). The
realtime loop mirrors that using the `execution` field from the resolve endpoint:

- `builtin` → xAI runs it; we never see the call.
- `client` → execute in the browser (existing client-tool registry / widget handle), then
  `function_call_output`.
- `server` → `POST /ai/tools/execute`, then `function_call_output`.

## Parallel calls

Grok may emit several `function_call_arguments.done` events before `response.done`. Buffer
them, resolve all (`Promise.all`) — client ones locally, server ones via the endpoint — send
a `function_call_output` per `call_id`, then send **exactly one** `response.create`.

## Frontend wiring tasks (matrx-frontend)

1. Widen `ToolName` / session tool typing in `features/voice-agent/types.ts` to carry custom
   function tools (name + schema), not just the two built-ins.
2. `buildSessionUpdate` (`transport/clientEvents.ts`): emit `{ type: "function", name,
   description, parameters }` for resolved server/client tools alongside built-ins.
3. New hook/util `useRealtimeAgentConfig(agentId)`:
   - fetch resolved tool specs (resolve endpoint),
   - resolve + interpolate variables into the system prompt (client-side; see variables note),
   - resolve scope context via `resolve_full_context` RPC and inject (instructions appendix
     for v1),
   - hand `{ instructions, voiceId, tools }` to `voiceAgentSlice` via `applyAgentConfig`.
4. Implement the function-call loop in `useXaiVoiceSession.ts` (replace the stub at the
   `response.function_call_arguments.done` case): buffer → classify → execute → outputs →
   single `response.create`.
5. Add a thin `realtimeToolService` (frontend) that calls `/ai/tools/execute` with the
   context envelope, using `useBackendApi` for auth headers.
6. Finish `features/agents/runtime/realtime/launchRealtimeSession.thunk.ts` to actually start
   the voice session with the resolved config.

## Out of scope for v1

- `ctx_get` deferred retrieval / `max_inline_chars` / summary agents (server-only; large
  context is injected inline into instructions for v1).
- `ctx_patch` mutable-slot writeback.
- Skills / RAG / observational memory.
- Non-xAI realtime providers (model is locked to `grok-voice-latest`).
- Streaming partial tool output (single result string per call for v1).

## Notes / caveats

- Each server tool round-trip adds audible latency to the voice turn. Acceptable for v1;
  consider a "working…" earcon or filler later.
- Realtime models can be less reliable at heavy multi-tool orchestration than turn-based
  models — keep the declared tool set scoped to what the voice agent actually needs.
