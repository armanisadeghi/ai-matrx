// features/voice-agent/hooks/useRealtimeAgentConfig.test.ts
//
// Tests the resolver core of useRealtimeAgentConfig (the hook delegates its
// network + normalisation to `resolveRealtimeTools`, which is testable without
// a React renderer — the repo ships no @testing-library/react).

import {
  resolveRealtimeTools,
  type RealtimeToolsRequest,
  type RealtimeToolsResponse,
} from "./useRealtimeAgentConfig";
import type { ResolvedRealtimeTool } from "../types";

const BODY: RealtimeToolsRequest = {
  surface: "matrx-user/chat-voice",
  added_tool_ids: [],
  is_version: false,
};

describe("resolveRealtimeTools", () => {
  it("happy path: returns the resolved tool set and hits the right path/body", async () => {
    const tools: ResolvedRealtimeTool[] = [
      { name: "web_search", description: "Search", parameters: {}, execution: "builtin" },
      {
        name: "search_notes",
        description: "Search notes",
        parameters: { type: "object", properties: { q: { type: "string" } } },
        execution: "server",
      },
    ];
    const seen: { path: string; body: unknown }[] = [];
    const fakePost = async <T, B>(
      path: string,
      body: B,
    ): Promise<{ data: T }> => {
      seen.push({ path, body });
      const resp: RealtimeToolsResponse = {
        agent_id: "agent-7",
        model_supports_tools: true,
        tools,
      };
      return { data: resp as unknown as T };
    };

    const result = await resolveRealtimeTools("agent-7", BODY, fakePost);

    expect(result).toEqual({ ok: true, tools, error: null });
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe("/ai/agents/agent-7/realtime-tools");
    expect(seen[0].body).toEqual(BODY);
  });

  it("normalises a missing `tools` field to an empty set", async () => {
    const fakePost = async <T>(): Promise<{ data: T }> => ({
      data: {
        agent_id: "a",
        model_supports_tools: false,
      } as unknown as T,
    });
    const result = await resolveRealtimeTools("a", BODY, fakePost);
    expect(result).toEqual({ ok: true, tools: [], error: null });
  });

  it("error path: a thrown post becomes { ok: false, error } (never throws)", async () => {
    const fakePost = async (): Promise<{ data: never }> => {
      throw new Error("HTTP 503");
    };
    const result = await resolveRealtimeTools("a", BODY, fakePost);
    expect(result).toEqual({ ok: false, tools: [], error: "HTTP 503" });
  });

  it("error path: a non-Error rejection yields a generic message", async () => {
    const fakePost = async (): Promise<{ data: never }> => {
      throw "boom";
    };
    const result = await resolveRealtimeTools("a", BODY, fakePost);
    expect(result).toEqual({
      ok: false,
      tools: [],
      error: "tool resolution failed",
    });
  });

  it("url-encodes the agent id in the path", async () => {
    let capturedPath = "";
    const fakePost = async <T>(path: string): Promise<{ data: T }> => {
      capturedPath = path;
      return {
        data: {
          agent_id: "x",
          model_supports_tools: true,
          tools: [],
        } as unknown as T,
      };
    };
    await resolveRealtimeTools("a b/c", BODY, fakePost);
    expect(capturedPath).toBe("/ai/agents/a%20b%2Fc/realtime-tools");
  });
});
