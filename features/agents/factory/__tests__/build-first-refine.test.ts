/**
 * R58 (owner, 2026-10-09): when the Agent Factory keeps a person's new agent, they land in
 * the builder with the Side Chat helper open, and the helper sees the test run.
 *
 * 1. The forward link speaks the Side Chat's OWN link contract (parsed by the package's
 *    reader, so a renamed parameter goes red here instead of silently opening nothing).
 * 2. The builder's surface scope carries the latest test run — variables, typed input,
 *    answer, transcript — read from the store the test panel renders from.
 */

import { readSideChatLink } from "@ai-matrx/chat/canvas/workspace/side-chat-address";
import { refineAgentHref } from "../refine-link";
import { agentBuilderTestRun } from "../../hooks/agentBuilderTestRun";

const AGENT = "516871c0-0c68-4eb4-989d-4df0dbacb9b9";
const CONV = "9b1f2c34-5d6e-4f70-8a9b-0c1d2e3f4a5b";

describe("refineAgentHref", () => {
  it("opens the new agent's builder with a NEW Side Chat in chat mode", () => {
    const href = refineAgentHref(AGENT);
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe(`/agents/${AGENT}/build`);
    const warnings: string[] = [];
    const link = readSideChatLink(url.search, (m) => warnings.push(m));
    expect(warnings).toEqual([]);
    expect(link).toEqual({ open: true, conversation: { kind: "new" }, mode: "chat" });
  });
});

function message(id: string, role: string, text: string, position: number) {
  return {
    id,
    conversationId: CONV,
    agentId: AGENT,
    role,
    content: [{ type: "text", text }],
    contentHistory: null,
    userContent: null,
    position,
    source: "test",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: "2026-10-09T06:00:00Z",
    deletedAt: null,
  };
}

function stateWith(focus: { input?: string; display?: string } | null) {
  return {
    conversationFocus: { bySurface: focus ? { [`agent-builder:${AGENT}`]: focus } : {} },
    messages: {
      byConversationId: {
        [CONV]: {
          orderedIds: ["m1", "m2"],
          byId: {
            m1: message("m1", "user", "Summarize this listing.", 0),
            m2: message("m2", "assistant", "**Studio, Reno, $1,100/mo**", 1),
          },
        },
      },
    },
    instanceVariableValues: {
      byConversationId: {
        [CONV]: {
          definitions: [{ name: "listing_text" }],
          userValues: { listing_text: "Studio in Reno, $1,100, no pets" },
          scopeValues: {},
        },
      },
    },
  } as never;
}

describe("agentBuilderTestRun", () => {
  it("is absent before the person runs the agent", () => {
    expect(agentBuilderTestRun(stateWith(null), AGENT)).toBeNull();
  });

  it("carries the run the panel shows: variables, input, answer and transcript", () => {
    const run = agentBuilderTestRun(stateWith({ input: "fresh-empty", display: CONV }), AGENT);
    expect(run).toEqual({
      test_run_conversation_id: CONV,
      test_run_variables: { listing_text: "Studio in Reno, $1,100, no pets" },
      test_run_user_input: "Summarize this listing.",
      test_run_response: "**Studio, Reno, $1,100/mo**",
      test_run_transcript: [
        { role: "user", text: "Summarize this listing." },
        { role: "assistant", text: "**Studio, Reno, $1,100/mo**" },
      ],
    });
  });

  it("reports the values the run was SENT with, not the field as edited afterwards", () => {
    const state = stateWith({ display: CONV }) as unknown as {
      instanceVariableValues: { byConversationId: Record<string, Record<string, unknown>> };
    };
    const entry = state.instanceVariableValues.byConversationId[CONV];
    entry.submittedFirstTurnValues = { listing_text: "Studio in Reno, $1,100, no pets" };
    entry.userValues = { listing_text: "an edit made after the run" };
    const run = agentBuilderTestRun(state as never, AGENT);
    expect(run?.test_run_variables).toEqual({ listing_text: "Studio in Reno, $1,100, no pets" });
  });
});
