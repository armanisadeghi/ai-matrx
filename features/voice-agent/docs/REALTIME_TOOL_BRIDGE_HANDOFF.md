# Voice-Agent Tool Bridge — Implementation Handoff

**Audience:** the agent assigned to take this over. You have access to
the **matrx-frontend** (this repo) and the **aidream Python backend**.

**Source of truth (architecture):**
[`features/voice-agent/docs/REALTIME_TOOL_BRIDGE.md`](../features/voice-agent/docs/REALTIME_TOOL_BRIDGE.md).
Read that first. This document is the **implementation guide** layered on
top: concrete code skeletons, file-by-file changes, a sequence diagram,
error handling, and a step-by-step build order so you can ship without
going back to the user for clarification.

**Branch you'll work on:** `claude/chat-voice-ui-animations-bzmXN`
(or a new branch off it). The voice-agent unification (Steps 1-4) is
already shipped on this branch and is *not* the work below — that's
already done. You're picking up at the function-call loop, which is
explicitly the gap the REALTIME_TOOL_BRIDGE spec flagged as "v1.1".

---

## 0. Why this matters (the goal in one paragraph)

Voice agents must be a **drop-in replacement** for turn-based agents.
Today the voice agent only speaks; it cannot read the user's notes,
search the web (via custom registry tools), patch a working document,
hit an MCP server, or run any of the dozens of registry/skill/MCP tools
that the turn-based path already exposes. That gap is the single biggest
thing keeping voice from being a real agent. Closing it makes
`/chat/voice` and the Scribe Live tab fully tool-capable — every tool a
written agent has, the voice agent has too.

**The real catalyst:** the **Transcription Scribe Live tab** at
`features/transcript-studio/components/scribe/ScribeLiveScreen.tsx`.
Today it injects the working document into the system prompt as plain
text and refreshes on every keystroke via `updateConfig`. That works for
*reading* the doc but the agent can't *write* to it. Tool-call support
unlocks: "Scribe, add a heading called 'Next steps'", "underline the
budget line", "add a checkbox under tasks." Those become real tool
calls handled client-side via the existing studio document mutator
hooks.

---

## 1. The end-to-end architecture in 60 seconds

```
┌─────────────────── browser ───────────────────┐         ┌── Python (aidream) ──┐
│                                                │         │                       │
│  Voice page mounts                             │         │                       │
│   │                                            │         │                       │
│   ├─ useRealtimeAgentConfig(agentId)           │  HTTP   │                       │
│   │     POST /ai/agents/:id/realtime-tools ────┼────────►│  resolve_for_request  │
│   │  ◄── tools[] with execution: server/client/builtin   │                       │
│   │                                            │         │                       │
│   ├─ buildSessionUpdate(tools[]) ─────────WS──►│         │                       │
│   │                                            │         │                       │
│   │  …conversation flows…                      │         │                       │
│   │                                            │         │                       │
│   ├─ response.function_call_arguments.done ◄WS─┤         │                       │
│   │   buffer until response.done OR a single   │         │                       │
│   │   call_id_done marker arrives              │         │                       │
│   │                                            │         │                       │
│   ├─ classify(tool.name → execution)           │         │                       │
│   │     ├─ "builtin"  → impossible here        │         │                       │
│   │     ├─ "client"   → run locally            │         │                       │
│   │     └─ "server"   → POST /ai/tools/execute │  HTTP   │                       │
│   │                                            ├────────►│  tool_execute         │
│   │     ◄── { ok, output }                     │         │  (registry/MCP/skill) │
│   │                                            │         │                       │
│   ├─ conversation.item.create per call_id ─WS─►│         │                       │
│   ├─ response.create (once) ──────────────WS──►│         │                       │
│   └─ assistant continues speaking              │         │                       │
└────────────────────────────────────────────────┘         └───────────────────────┘
```

Two endpoints. Five frontend wiring tasks. No new tool runtime.

---

## 2. Sequence (one tool call, from xAI to the user's ear)

1. `response.function_call_arguments.done` arrives on the xAI WebSocket
   with `{ name: "search_notes", arguments: '{"query":"budget"}', call_id: "call_42" }`.
2. The frontend pushes onto `pendingCalls[]`. It does NOT execute
   immediately — `response.done` (or an explicit response.completed) is
   the flush signal so parallel calls land in one batch.
3. On flush, classify each call against the `tools[]` we received from
   `/realtime-tools`:
   - `execution === "client"` → run via `clientToolRegistry.execute(name, args)`.
   - `execution === "server"` → `POST /ai/tools/execute` with the
     conversation envelope.
   - `execution === "builtin"` → log a warning (xAI handles builtins server-side; the call shouldn't reach the client).
4. `Promise.all(...)` — every result becomes a string `output`.
5. For each `(call_id, output)`, send `buildConversationItemCreate({ type: "function_call_output", call_id, output })`.
6. Send **one** `buildResponseCreate()` after every output is acked.
7. xAI generates the next assistant turn using the tool outputs as
   grounding. Speak.

**Critical invariant:** one `response.create` per batch. Sending more
than one breaks xAI's response flow.

---

## 3. The two Python endpoints (the aidream side)

Both are documented in `REALTIME_TOOL_BRIDGE.md` §2. Below are the
additions / clarifications you need to implement them.

### 3a. `POST /ai/agents/:agentId/realtime-tools`

**Resolve uses the same code path the turn-based agent path uses.** Do
not fork. The function the turn-based agent runner calls to build its
`tools` array is `tool_resolve_for_request` (or similar — find it by
greping for where `client_tools` / `addedToolIds` are turned into
runtime specs). Wrap that function. The only difference vs. the
turn-based caller is the output shape — instead of returning Python
ToolSpec objects, return the JSON-Schema-shaped objects xAI expects:

```py
{
  "name": str,                       # tool function name
  "description": str,                # one-line agent-facing
  "parameters": dict,                # JSON Schema {type: "object", properties: {...}, required: [...]}
  "execution": "server" | "client" | "builtin",
}
```

**Decision rule for `execution`:**
- The tool is implemented inside a frontend `delegate: true` adapter
  (sandbox-fs, file picker, working-document mutator, etc.) → `client`.
  Keep an explicit allowlist of delegate tool names; if a tool is not
  on the allowlist but is delegated, fail loudly — silent
  misclassification will produce silent broken turns.
- The tool is one of xAI's first-party (`web_search`, `x_search`,
  `file_search`, `mcp`) → `builtin`. xAI runs it; we never see the call.
- Everything else → `server`.

**Auth:** Bearer-supabase-JWT, same as `/ai/agents/:agentId/...` today.
No anon access. The JWT identifies the user; permissions on the tools
resolve against that identity via the existing tool-resolution path.

**Surface defaults:** the `surface` body field lets the resolver pull
in the surface-default tool set (the same way text chat surfaces apply
defaults). If the call comes from `matrx-user/chat-voice`, look up its
defaults. If `matrx-user/transcript-scribe-live`, look up that one.

**Response cache:** safe to cache by `(agentId, addedToolIds, surface,
user_id)` for ~5 minutes since registry tool specs don't churn. Stale
specs only show up on next session start; a 5-min TTL is fine.

### 3b. `POST /ai/tools/execute`

This is the new tool runner. Reuse the turn-based agent's tool
execution harness — **find the function the runner calls when it sees
a tool_call event and wrap it.** Do not write a parallel runner. If
the turn-based path has retry / timeout / error reporting, inherit it;
the voice path needs the same robustness.

**Auth:** same Bearer-JWT pattern. Reject if user can't access the
tool, the agent, or the context.

**Timeout:** 30 s server-side. Anything slower needs an interim
"working..." pattern, deferred to v1.1.

**Error → still 200:** an exception-raising tool returns
`{ ok: false, output: "<reason>" }` (HTTP 200) so the LLM can recover
and tell the user gracefully. A real 500 should only happen for
infrastructure failures (auth broken, registry unreachable). The
frontend distinguishes via the `ok` flag, not HTTP status.

**Output is a string.** Always. If a tool returns structured data,
`json.dumps` it server-side. xAI's
`function_call_output.output` is contractually a string.

**Conversation persistence:** if `conversation_id` is non-null, the
server may persist the tool call to `cx_tool_call` (or wherever the
turn-based path persists tool calls). Use the same write path — voice
tool calls should appear in conversation history the same way text
ones do.

### 3c. Tests on the Python side

Mirror what the turn-based agent's tool-execution tests do. The
smallest valid set:

1. `POST /ai/agents/:id/realtime-tools` returns `tools[]` with at least
   one of each `execution` flavor when an agent is configured to use
   both client- and server-tools.
2. `POST /ai/tools/execute` against a registry tool returns a string
   `output`.
3. `POST /ai/tools/execute` against a tool that throws returns
   `{ ok: false, output: <message> }`.
4. `POST /ai/tools/execute` against a tool the user can't access returns
   `403`.

---

## 4. Frontend wiring tasks (this repo)

There are six tasks, listed in REALTIME_TOOL_BRIDGE.md §"Frontend
wiring tasks". Implementation guide below — file paths, line numbers,
and code skeletons.

### 4a. Widen tool typing — `features/voice-agent/types.ts`

Replace the closed `ToolName` union with a structured type. Keep a
narrowed alias for the two xAI built-ins.

```ts
// Before:
// export type ToolName = "web_search" | "x_search";

// After:
export type BuiltinToolName = "web_search" | "x_search" | "file_search";

export interface ResolvedRealtimeTool {
  name: string;
  description: string;
  /** JSON Schema. */
  parameters: Record<string, unknown>;
  execution: "server" | "client" | "builtin";
}

/** Replaces `ToolName[]` everywhere it was used. */
export type RealtimeToolSet = ResolvedRealtimeTool[];
```

The Scribe Live tab and the `VoiceAgentInstance` slice store
`tools: ToolName[]` today. Migrate those callsites to
`RealtimeToolSet`. The slice's `applyAgentConfig` action signature
needs updating to match. Check every reader of `inst.tools` — the only
real consumer is `useXaiVoiceSession.ts` → `buildSessionUpdate`.

### 4b. Emit function tools — `features/voice-agent/transport/clientEvents.ts`

Today `buildSessionUpdate(opts)` takes `tools: ToolName[]` and emits
`tools: [{ type: "web_search" }, { type: "x_search" }, ...]`. Widen to:

```ts
export function buildSessionUpdate({
  voiceId, instructions, tools,
}: { voiceId: VoiceId; instructions: string; tools: RealtimeToolSet; }): SessionUpdateEvent {
  const xaiTools = tools.map((t) => {
    if (t.execution === "builtin") return { type: t.name };
    return {
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    };
  });
  return {
    type: "session.update",
    session: { voice: voiceId, instructions, tools: xaiTools },
  };
}
```

### 4c. Resolve tools — `features/voice-agent/hooks/useRealtimeAgentConfig.ts` (new)

Mounted alongside `useVoiceAgentInstance`. Fires one HTTP request to
the Python backend immediately after the agent record loads. Returns
`{ tools, ready }`. On success, dispatches `applyAgentConfig` with the
resolved tool set so `useXaiVoiceSession` can pick it up via the
slice.

```ts
export function useRealtimeAgentConfig(opts: {
  instanceId: string;
  agentId: string | undefined;
  /** Per-conversation tool overrides; mirrors addedToolIds for text. */
  addedToolIds?: string[];
  /** Surface name for default-tool resolution. */
  surfaceName?: string;
}): { ready: boolean; error: string | null } {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<{ ready: boolean; error: string | null }>(
    { ready: false, error: null },
  );
  const backendApi = useBackendApi(); // existing helper for auth-bearing fetch

  useEffect(() => {
    if (!opts.agentId) {
      setState({ ready: true, error: null }); // nothing to resolve
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await backendApi.post(
          `/ai/agents/${opts.agentId}/realtime-tools`,
          {
            added_tool_ids: opts.addedToolIds ?? [],
            surface: opts.surfaceName,
          },
        );
        if (cancelled) return;
        dispatch(
          applyAgentConfig({
            instanceId: opts.instanceId,
            tools: res.tools as RealtimeToolSet,
          }),
        );
        setState({ ready: true, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          ready: true, // start with whatever fallback tools the slice already holds
          error: err instanceof Error ? err.message : "tool resolution failed",
        });
      }
    })();
    return () => { cancelled = true; };
  }, [dispatch, backendApi, opts.agentId, opts.instanceId, opts.surfaceName, JSON.stringify(opts.addedToolIds ?? [])]);

  return state;
}
```

`useVoiceAgentInstance` already has the agent ID and dispatches
`applyAgentConfig` once the agent loads. Update that hook to take
`tools` from the agent record only as a fallback — the *resolved* tool
set comes from this new hook. Order: agent loads → applyAgentConfig
with stub tools → `useRealtimeAgentConfig` fires → applyAgentConfig
again with resolved tools. The session-update WebSocket message is
sent on user-click, by which time both have settled.

### 4d. The tool-call loop — `features/voice-agent/hooks/useXaiVoiceSession.ts`

The stub case in the event handler today:

```ts
case "response.function_call.created":
case "response.function_call_arguments.done":
case "response.function_call.done": {
  // no-op; v1.1
  break;
}
```

Replace with the buffering loop. Sketch:

```ts
// Module-scoped state inside the orchestrator hook (use a ref).
const pendingCallsRef = useRef<Array<{
  call_id: string;
  name: string;
  arguments: string;
}>>([]);

case "response.function_call_arguments.done": {
  pendingCallsRef.current.push({
    call_id: event.call_id,
    name: event.name,
    arguments: event.arguments,
  });
  break;
}

case "response.done": {
  // …existing completion handling…

  // Flush any pending tool calls — must run BEFORE we dispatch
  // completeAssistantTurn, otherwise the turn is "done" before
  // tools execute, which breaks the next response.create.
  const pending = pendingCallsRef.current;
  pendingCallsRef.current = [];
  if (pending.length > 0) {
    await flushToolCalls(pending);
    // After flushing, xAI will emit a NEW response.created for the
    // tool-result turn. The existing handlers pick it up.
  }
  break;
}
```

`flushToolCalls` lives in a new file
`features/voice-agent/runtime/realtime-tool-loop.ts`:

```ts
export async function flushToolCalls(
  pending: PendingCall[],
  ctx: ToolLoopContext,
): Promise<void> {
  const results = await Promise.all(
    pending.map(async (call) => {
      const spec = ctx.resolvedTools.get(call.name);
      if (!spec) {
        return { call_id: call.call_id, output: `Unknown tool: ${call.name}` };
      }
      try {
        const args = JSON.parse(call.arguments);
        if (spec.execution === "client") {
          const out = await ctx.clientRegistry.execute(call.name, args);
          return { call_id: call.call_id, output: stringifyOutput(out) };
        }
        if (spec.execution === "server") {
          const res = await ctx.realtimeToolService.execute({
            agent_id: ctx.agentId,
            conversation_id: ctx.conversationId ?? null,
            tool_name: call.name,
            arguments: args,
            context: ctx.contextEnvelope,
          });
          // Server returns { ok, output }; output is already a string
          // and is forwarded verbatim — including the failure message
          // when ok=false. The model recovers from the failure string.
          return { call_id: call.call_id, output: res.output };
        }
        return { call_id: call.call_id, output: `Builtin tool reached client: ${call.name}` };
      } catch (err) {
        const message = err instanceof Error ? err.message : "tool execution failed";
        return { call_id: call.call_id, output: `Tool error: ${message}` };
      }
    }),
  );

  for (const r of results) {
    ctx.client.send(buildConversationItemCreate({
      type: "function_call_output",
      call_id: r.call_id,
      output: r.output,
    }));
  }
  ctx.client.send(buildResponseCreate());
}

function stringifyOutput(out: unknown): string {
  if (typeof out === "string") return out;
  try { return JSON.stringify(out); } catch { return String(out); }
}
```

### 4e. Server execute helper — `features/voice-agent/services/realtimeToolService.ts` (new)

```ts
export function createRealtimeToolService(backendApi: BackendApi) {
  return {
    async execute(req: {
      agent_id: string;
      conversation_id: string | null;
      tool_name: string;
      arguments: Record<string, unknown>;
      context: ContextEnvelope;
    }): Promise<{ ok: boolean; output: string }> {
      // backendApi handles auth headers + base URL via apiConfigSlice.
      return backendApi.post("/ai/tools/execute", req);
    },
  };
}
```

### 4f. Wire the loop into `useXaiVoiceSession`

The orchestrator hook needs access to the client registry (already
mounted), the realtime-tool service (new), the conversation ID (from
slice or fallback), and the resolved tools map (from slice). Build a
`ToolLoopContext` lazily on first tool call so we don't pay the cost
when there are no tools.

### 4g. Plug `launchRealtimeSession.thunk.ts`

REALTIME_TOOL_BRIDGE.md task 6: "Finish
`features/agents/runtime/realtime/launchRealtimeSession.thunk.ts` to
actually start the voice session." Today this thunk is a thin landing
pad that sets a metadata marker. The actual session start is
user-gesture-gated (mic button click warms the AudioContext). Leave it
as-is — the thunk's job is to validate, dispatch metadata, and let the
surface's mounted hook start the session. The function-call loop lives
inside `useXaiVoiceSession`, not the thunk.

### 4h. Tests on the frontend

The voice transport pieces aren't easily unit-testable (WebSocket +
AudioWorklet), but the tool loop is. Add tests for:

1. `flushToolCalls` with one client tool, one server tool, in parallel —
   asserts one `response.create` is emitted regardless.
2. `flushToolCalls` with a server tool that returns `ok:false` — asserts
   the failure string is forwarded as `output`.
3. `flushToolCalls` with an unknown tool name — asserts the call_id is
   answered with an explanatory string (no UI crash).
4. `useRealtimeAgentConfig` happy-path + error-path — assert the slice
   gets dispatched with the resolved tools / falls back to existing
   tools on error.

---

## 5. Build order (don't skip)

1. **Python** — `tool_execute` endpoint (4 hours). Wrap the existing
   turn-based path; surface JSON. Test with `curl` against a registry
   tool.
2. **Python** — `realtime-tools` resolver endpoint (3 hours). Reuse
   `tool_resolve_for_request`. Test the classification rule against
   real agent configs.
3. **Frontend** — `RealtimeToolSet` types (1 hour). One file change.
4. **Frontend** — `buildSessionUpdate` widening (1 hour). Existing
   builtin path keeps working.
5. **Frontend** — `useRealtimeAgentConfig` hook (3 hours). Mount it in
   `useVoiceAgentInstance`. Verify the slice gets the new tools.
6. **Frontend** — `flushToolCalls` + `realtimeToolService` (4 hours).
   Manual smoke test with a single registry tool against `/chat/voice`.
7. **Frontend** — wire to Scribe Live (2 hours). Surface a couple of
   document-mutator client tools (write to scratch, append heading)
   through the same loop.

Total: ~18 hours of focused work for v1.

---

## 6. Open questions to escalate, not assume

Send these to the user before shipping if they come up:

- **Streaming partial tool output.** The spec says v1 is one string per
  call. If a tool takes 25 s, the user hears silence. Do we want an
  earcon? A canned filler from the agent? Decide before shipping.
- **Persistence shape for tool calls.** Today the `cx_tool_call` table
  stores tool invocations for text agents. Voice tool calls should
  appear there too (one row per call_id). Confirm with the user that's
  the right table; the spec doesn't say.
- **Hot-reload of resolved tools mid-session.** If the user enables a
  new tool in the playground mid-session, do we re-resolve and send a
  fresh `session.update`? v1 says no — session-start only. v1.1 worth
  revisiting.
- **MCP servers with auth.** Some MCP tools need a per-user OAuth
  bounce. The turn-based path already handles this; verify it survives
  the realtime route (the JWT flow should still work, but smoke-test
  one OAuth-gated MCP tool before declaring done).

---

## 7. What "done" looks like

A user sits down at `/chat/voice` with an agent that has the
`search_notes` registry tool enabled. They say "find my notes about
the marketing plan from last week." The voice agent:

1. Pauses briefly (the round-trip to Python's `tool_execute`).
2. Speaks the result: "I found three notes. The first is from
   Tuesday, titled..."

Same flow works for the Scribe Live tab against a custom client tool
that mutates the working document. The agent can say "I'll add that
heading for you" and the document updates in real time on screen.

When that demo lands, the voice agent is a drop-in replacement for the
turn-based agent and we can talk about retiring `/chat`'s text-first
defaults.
