// features/voice-agent/runtime/realtime-tool-loop.test.ts
//
// Unit tests for the realtime tool loop (contract §5.6). The loop is pure
// modulo the injected `service` / `runClient` / send callbacks, so it tests
// without Redux or the network.

import {
  buildResolvedToolMap,
  flushToolCalls,
  type PendingCall,
  type ToolLoopContext,
} from "./realtime-tool-loop";
import type { RealtimeToolSet, ResolvedRealtimeTool } from "../types";
import type { RealtimeToolService } from "../services/realtimeToolService";

function tool(
  name: string,
  execution: ResolvedRealtimeTool["execution"],
): ResolvedRealtimeTool {
  return { name, description: name, parameters: {}, execution };
}

interface Harness {
  ctx: ToolLoopContext;
  outputs: Array<{ callId: string; output: string }>;
  responseCreateCount: () => number;
  serviceCalls: Array<{ tool_name: string; arguments: Record<string, unknown> }>;
  clientCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

function makeHarness(opts: {
  tools: RealtimeToolSet;
  service?: Partial<RealtimeToolService>;
  runClient?: ToolLoopContext["runClient"];
}): Harness {
  const outputs: Harness["outputs"] = [];
  let responseCreates = 0;
  const serviceCalls: Harness["serviceCalls"] = [];
  const clientCalls: Harness["clientCalls"] = [];

  const service: RealtimeToolService = {
    execute: async (req) => {
      serviceCalls.push({ tool_name: req.tool_name, arguments: req.arguments });
      return { ok: true, output: `server:${req.tool_name}` };
    },
    ...opts.service,
  };

  const runClient: ToolLoopContext["runClient"] =
    opts.runClient ??
    (async (name, args) => {
      clientCalls.push({ name, args });
      return `client:${name}`;
    });

  const ctx: ToolLoopContext = {
    agentId: "agent-1",
    conversationId: "conv-1",
    surface: "matrx-user/chat-voice",
    addedToolIds: [],
    isVersion: false,
    resolvedTools: buildResolvedToolMap(opts.tools),
    contextEnvelope: null,
    service,
    runClient,
    sendFunctionCallOutput: (callId, output) => outputs.push({ callId, output }),
    sendResponseCreate: () => {
      responseCreates += 1;
    },
    clientToolContext: {
      instanceId: "inst-1",
      conversationId: "conv-1",
      userId: "user-1",
      sessionId: null,
      // dispatch / getState are unused by the injected runClient.
      dispatch: (() => undefined) as never,
      getState: (() => ({})) as never,
    },
  };

  return {
    ctx,
    outputs,
    responseCreateCount: () => responseCreates,
    serviceCalls,
    clientCalls,
  };
}

describe("flushToolCalls", () => {
  it("runs one client + one server tool in parallel and emits EXACTLY ONE response.create", async () => {
    const h = makeHarness({
      tools: [tool("doc_edit", "client"), tool("search_notes", "server")],
    });
    const pending: PendingCall[] = [
      { call_id: "c1", name: "doc_edit", arguments: '{"a":1}' },
      { call_id: "c2", name: "search_notes", arguments: '{"q":"x"}' },
    ];

    await flushToolCalls(pending, h.ctx);

    // One function_call_output per call_id...
    expect(h.outputs).toHaveLength(2);
    const byId = Object.fromEntries(h.outputs.map((o) => [o.callId, o.output]));
    expect(byId.c1).toBe("client:doc_edit");
    expect(byId.c2).toBe("server:search_notes");
    // ...and exactly ONE response.create regardless of batch size.
    expect(h.responseCreateCount()).toBe(1);

    expect(h.clientCalls).toEqual([{ name: "doc_edit", args: { a: 1 } }]);
    expect(h.serviceCalls).toEqual([
      { tool_name: "search_notes", arguments: { q: "x" } },
    ]);
  });

  it("forwards a server ok:false failure string as the output (model recovers)", async () => {
    const h = makeHarness({
      tools: [tool("search_notes", "server")],
      service: {
        execute: async () => ({ ok: false, output: "notes service is down" }),
      },
    });

    await flushToolCalls(
      [{ call_id: "c1", name: "search_notes", arguments: "{}" }],
      h.ctx,
    );

    expect(h.outputs).toEqual([{ callId: "c1", output: "notes service is down" }]);
    expect(h.responseCreateCount()).toBe(1);
  });

  it("answers an UNKNOWN tool with an explanatory string and never crashes", async () => {
    const h = makeHarness({ tools: [tool("search_notes", "server")] });

    await flushToolCalls(
      [{ call_id: "c9", name: "not_a_tool", arguments: "{}" }],
      h.ctx,
    );

    expect(h.outputs).toHaveLength(1);
    expect(h.outputs[0].callId).toBe("c9");
    expect(h.outputs[0].output).toMatch(/Unknown tool: not_a_tool/);
    expect(h.responseCreateCount()).toBe(1);
    // The unknown tool must NOT reach the server.
    expect(h.serviceCalls).toHaveLength(0);
  });

  it("answers a thrown client runner with an explanatory string", async () => {
    const h = makeHarness({
      tools: [tool("doc_edit", "client")],
      runClient: async () => {
        throw new Error("boom");
      },
    });

    await flushToolCalls(
      [{ call_id: "c1", name: "doc_edit", arguments: "{}" }],
      h.ctx,
    );

    expect(h.outputs[0].output).toMatch(/Tool error: boom/);
    expect(h.responseCreateCount()).toBe(1);
  });

  it("answers malformed args with a recoverable string (no JSON.parse crash)", async () => {
    const h = makeHarness({ tools: [tool("search_notes", "server")] });

    await flushToolCalls(
      [{ call_id: "c1", name: "search_notes", arguments: "{not json" }],
      h.ctx,
    );

    expect(h.outputs[0].output).toMatch(/malformed arguments/);
    expect(h.responseCreateCount()).toBe(1);
    expect(h.serviceCalls).toHaveLength(0);
  });

  it("warns + answers when a BUILTIN reaches the client (classification bug)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = makeHarness({ tools: [tool("web_search", "builtin")] });

    await flushToolCalls(
      [{ call_id: "c1", name: "web_search", arguments: "{}" }],
      h.ctx,
    );

    expect(warn).toHaveBeenCalled();
    expect(h.outputs[0].output).toMatch(/runs automatically/);
    expect(h.responseCreateCount()).toBe(1);
    warn.mockRestore();
  });

  it("is a no-op on an empty batch (no response.create)", async () => {
    const h = makeHarness({ tools: [] });
    const sent = await flushToolCalls([], h.ctx);
    expect(sent).toBe(false);
    expect(h.outputs).toHaveLength(0);
    expect(h.responseCreateCount()).toBe(0);
  });

  it("forwards added_tool_ids + is_version to the server execute (C1: resolve/execute parity)", async () => {
    const captured: Array<{ added_tool_ids: string[]; is_version: boolean }> =
      [];
    const h = makeHarness({
      tools: [tool("search_notes", "server")],
      service: {
        execute: async (req) => {
          captured.push({
            added_tool_ids: req.added_tool_ids,
            is_version: req.is_version,
          });
          return { ok: true, output: "ok" };
        },
      },
    });
    h.ctx.addedToolIds = ["tool-uuid-1", "tool-uuid-2"];
    h.ctx.isVersion = true;

    await flushToolCalls(
      [{ call_id: "c1", name: "search_notes", arguments: "{}" }],
      h.ctx,
    );

    expect(captured).toEqual([
      { added_tool_ids: ["tool-uuid-1", "tool-uuid-2"], is_version: true },
    ]);
  });

  it("L4: answers a server tool with an explanatory string when agentId is empty (no round-trip)", async () => {
    const h = makeHarness({ tools: [tool("search_notes", "server")] });
    h.ctx.agentId = "";

    await flushToolCalls(
      [{ call_id: "c1", name: "search_notes", arguments: "{}" }],
      h.ctx,
    );

    expect(h.serviceCalls).toHaveLength(0);
    expect(h.outputs[0].output).toMatch(/no agent bound/);
    expect(h.responseCreateCount()).toBe(1);
  });

  it("H1/M5: an already-aborted flush sends nothing (no output, no response.create)", async () => {
    const h = makeHarness({ tools: [tool("search_notes", "server")] });
    const ac = new AbortController();
    ac.abort();

    const sent = await flushToolCalls(
      [{ call_id: "c1", name: "search_notes", arguments: "{}" }],
      h.ctx,
      { signal: ac.signal },
    );

    expect(sent).toBe(false);
    expect(h.outputs).toHaveLength(0);
    expect(h.responseCreateCount()).toBe(0);
    // The tool must not have run either.
    expect(h.serviceCalls).toHaveLength(0);
  });

  it("H2/M5: a flush aborted DURING tool execution emits no response.create", async () => {
    const ac = new AbortController();
    const h = makeHarness({
      tools: [tool("search_notes", "server")],
      service: {
        execute: async () => {
          // Abort lands while the tool is in flight (barge-in / stop).
          ac.abort();
          return { ok: true, output: "late" };
        },
      },
    });

    const sent = await flushToolCalls(
      [{ call_id: "c1", name: "search_notes", arguments: "{}" }],
      h.ctx,
      { signal: ac.signal },
    );

    expect(sent).toBe(false);
    expect(h.outputs).toHaveLength(0);
    expect(h.responseCreateCount()).toBe(0);
  });

  it("M5: a closed socket (canSend=false) blocks both the output and response.create", async () => {
    const h = makeHarness({ tools: [tool("search_notes", "server")] });

    const sent = await flushToolCalls(
      [{ call_id: "c1", name: "search_notes", arguments: "{}" }],
      h.ctx,
      { canSend: () => false },
    );

    expect(sent).toBe(false);
    expect(h.outputs).toHaveLength(0);
    expect(h.responseCreateCount()).toBe(0);
  });

  it("returns true and sends exactly one response.create on a normal flush", async () => {
    const h = makeHarness({ tools: [tool("search_notes", "server")] });
    const sent = await flushToolCalls(
      [{ call_id: "c1", name: "search_notes", arguments: "{}" }],
      h.ctx,
      { canSend: () => true },
    );
    expect(sent).toBe(true);
    expect(h.responseCreateCount()).toBe(1);
  });
});
