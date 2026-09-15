/**
 * The attribution guard for a coding-session transcript.
 *
 * Three authorships now share one conversation, and the ONLY thing that tells
 * them apart is what this normalizer reads off the row. Every test here fails
 * if the behaviour is removed: the column test fails if `agent_id`/`metadata`
 * leave the projection (they cannot be read if they are not selected), the
 * origin tests fail if the metadata read is dropped, and the unreadable-row
 * test fails with a thrown error if the try/catch honesty is deleted.
 */

import {
  normalizeProviderMessage,
  PROVIDER_MESSAGE_COLUMNS,
  readProviderMessageAttribution,
  type ProviderConversationMessageRow,
} from "./providerConversationMessage";

type Json = ProviderConversationMessageRow["metadata"];

function row(
  overrides: Partial<ProviderConversationMessageRow> = {},
): ProviderConversationMessageRow {
  return {
    id: "msg-1",
    conversation_id: "conv-1",
    role: "assistant",
    content: [{ type: "text", text: "hello" }] as unknown as Json,
    position: 4,
    status: "completed",
    created_at: "2026-09-14T00:00:00.000Z",
    agent_id: null,
    metadata: { coding_session_bridge: { provider: "claude-code" } } as Json,
    ...overrides,
  };
}

describe("PROVIDER_MESSAGE_COLUMNS", () => {
  it("selects the two columns attribution is read from", () => {
    // Without these in the projection the rows arrive with `agent_id` and
    // `metadata` undefined and EVERY turn reads as a provider mirror — our own
    // words attributed to Claude Code.
    const columns = PROVIDER_MESSAGE_COLUMNS.split(",").map((part) =>
      part.trim(),
    );
    expect(columns).toContain("agent_id");
    expect(columns).toContain("metadata");
  });
});

describe("normalizeProviderMessage attribution", () => {
  it("treats a row with no metadata.origin as a provider mirror with no attribution", () => {
    const message = normalizeProviderMessage(row());
    expect(message.origin).toBe("provider_mirror");
    expect(message.agentId).toBeNull();
    expect(message.agentName).toBeNull();
  });

  it("reads a person's AI Matrx reply as ai_matrx_reply", () => {
    const message = normalizeProviderMessage(
      row({
        role: "user",
        metadata: {
          coding_session_bridge: { provider: "claude-code" },
          origin: "ai_matrx_reply",
        } as Json,
      }),
    );
    expect(message.origin).toBe("ai_matrx_reply");
    expect(message.role).toBe("user");
    expect(message.agentName).toBeNull();
  });

  it("reads the AI Matrx answer's agent id from the column and its name from metadata", () => {
    const message = normalizeProviderMessage(
      row({
        agent_id: "agent-77",
        metadata: {
          origin: "ai_matrx_reply",
          ai_matrx_reply: {
            agent_id: "agent-77",
            agent_name: "Session Explainer",
          },
        } as Json,
      }),
    );
    expect(message.origin).toBe("ai_matrx_reply");
    expect(message.agentId).toBe("agent-77");
    expect(message.agentName).toBe("Session Explainer");
  });

  it("reads an agent run triggered from the coding host as matrx_agent_run", () => {
    const message = normalizeProviderMessage(
      row({
        agent_id: "agent-12",
        metadata: {
          coding_session_bridge: { provider: "claude-code" },
          origin: "matrx_agent_run",
          agent_run: {
            agent_id: "agent-12",
            agent_name: "Repo Auditor",
            dispatch_key: "dk-9",
            host: "claude-code",
          },
        } as Json,
      }),
    );
    expect(message.origin).toBe("matrx_agent_run");
    expect(message.agentId).toBe("agent-12");
    expect(message.agentName).toBe("Repo Auditor");
  });

  it("never invents a name when the server reported none", () => {
    const message = normalizeProviderMessage(
      row({
        agent_id: "agent-12",
        metadata: {
          origin: "matrx_agent_run",
          agent_run: { agent_id: "agent-12", dispatch_key: "dk-9" },
        } as Json,
      }),
    );
    expect(message.origin).toBe("matrx_agent_run");
    expect(message.agentId).toBe("agent-12");
    expect(message.agentName).toBeNull();
  });

  it("reports an unreadable metadata row and shows it as a mirror with no attribution", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const hostile = {};
    Object.defineProperty(hostile, "origin", {
      enumerable: true,
      get() {
        throw new Error("metadata is not readable");
      },
    });

    const message = normalizeProviderMessage(
      row({ metadata: hostile as Json }),
    );

    expect(message.origin).toBe("provider_mirror");
    expect(message.agentName).toBeNull();
    expect(spy).toHaveBeenCalledWith(
      "[normalizeProviderMessage] unreadable persisted message metadata",
      expect.objectContaining({ messageId: "msg-1" }),
    );
    spy.mockRestore();
  });

  it("does not claim an origin it does not know", () => {
    expect(
      readProviderMessageAttribution({ origin: "something_new" }),
    ).toEqual({ origin: "provider_mirror", agentName: null });
    expect(readProviderMessageAttribution(null)).toEqual({
      origin: "provider_mirror",
      agentName: null,
    });
    expect(
      readProviderMessageAttribution({
        origin: "ai_matrx_reply",
        ai_matrx_reply: "not-an-object",
      }),
    ).toEqual({ origin: "ai_matrx_reply", agentName: null });
  });
});
