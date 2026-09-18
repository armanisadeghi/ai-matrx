/**
 * A Matrx-authored turn on a bound conversation must be named as ours and
 * marked as ours. Every case here fails if that attribution is dropped: the
 * labels are asserted as strings, and `fromMatrx` is the flag the transcript
 * renders its visible mark from.
 */

import type { ProviderConversationMessage } from "./providerConversationMessage";
import { transcriptAuthorship } from "./providerTranscriptAuthorship";

function turn(
  overrides: Partial<ProviderConversationMessage>,
): ProviderConversationMessage {
  return {
    id: "m1",
    conversation_id: "c1",
    role: "assistant",
    position: 1,
    status: "completed",
    created_at: "2026-09-14T00:00:00.000Z",
    display: { text: "body", activityCount: 0 },
    contentValid: true,
    origin: "provider_mirror",
    agentId: null,
    agentName: null,
    carriedFrom: null,
    ...overrides,
  };
}

describe("transcriptAuthorship", () => {
  it("leaves a mirrored provider turn exactly as it was", () => {
    expect(transcriptAuthorship(turn({}), "Claude Code")).toEqual({
      label: "Claude Code",
      note: null,
      fromMatrx: false,
    });
    expect(
      transcriptAuthorship(turn({ role: "user" }), "Claude Code"),
    ).toEqual({ label: "You", note: null, fromMatrx: false });
  });

  it("names an agent run triggered from the coding host, and where it was run from", () => {
    expect(
      transcriptAuthorship(
        turn({
          origin: "matrx_agent_run",
          agentId: "a1",
          agentName: "Repo Auditor",
        }),
        "Claude Code",
      ),
    ).toEqual({
      label: "AI Matrx · Repo Auditor",
      note: "run from Claude Code",
      fromMatrx: true,
    });
  });

  it("names the AI Matrx answer and the person's own reply", () => {
    expect(
      transcriptAuthorship(
        turn({ origin: "ai_matrx_reply", agentName: "Session Explainer" }),
        "Codex",
      ),
    ).toEqual({
      label: "AI Matrx · Session Explainer",
      note: null,
      fromMatrx: true,
    });
    expect(
      transcriptAuthorship(
        turn({ origin: "ai_matrx_reply", role: "user" }),
        "Codex",
      ),
    ).toEqual({ label: "You (in AI Matrx)", note: null, fromMatrx: true });
  });

  it("says AI Matrx and nothing invented when no agent name was reported", () => {
    const authorship = transcriptAuthorship(
      turn({ origin: "matrx_agent_run", agentId: "a1", agentName: null }),
      "Claude Code",
    );
    expect(authorship.label).toBe("AI Matrx");
    expect(authorship.label).not.toContain("a1");
    expect(authorship.fromMatrx).toBe(true);
  });
});

/**
 * XT-05b sibling — A CARRIED TURN IS NOT THIS CONVERSATION'S TOOL'S WORK.
 *
 * The break, seen live on 2026-09-18: a handoff rebind moved a Claude Code
 * session's binding onto a Codex conversation and its 2 turns travelled with
 * it, and the transcript bylined both of them "Codex" — the conversation's
 * provider — so the screen credited work to a tool that never did it. The row
 * carries `carried_from.provider`; the byline must come from there, and the
 * note must say the turn was carried in so it cannot be read as native.
 */
describe("transcriptAuthorship on a turn carried in by a handoff", () => {
  const carriedFrom = {
    provider: "claude_code",
    providerSessionId: "xt05b-claude-1789697063",
    conversationId: "bba61bf6-eb71-5296-ba64-c66f1854493f",
  };

  it("bylines the tool that PRODUCED it, not the conversation's provider", () => {
    expect(transcriptAuthorship(turn({ carriedFrom }), "Codex")).toEqual({
      label: "Claude Code",
      note: "carried in by a handoff",
      fromMatrx: false,
    });
  });

  it("says which tool the person was typing in on a carried user turn", () => {
    expect(
      transcriptAuthorship(turn({ role: "user", carriedFrom }), "Codex"),
    ).toEqual({
      label: "You",
      note: "in Claude Code, carried in by a handoff",
      fromMatrx: false,
    });
  });

  it("credits an agent run to the session that triggered it", () => {
    expect(
      transcriptAuthorship(
        turn({ origin: "matrx_agent_run", agentName: "Repo Auditor", carriedFrom }),
        "Codex",
      ),
    ).toEqual({
      label: "AI Matrx · Repo Auditor",
      note: "run from Claude Code, carried in by a handoff",
      fromMatrx: true,
    });
  });

  it("keeps an AI Matrx reply ours, and still says it was carried", () => {
    expect(
      transcriptAuthorship(
        turn({ origin: "ai_matrx_reply", agentName: "Session Explainer", carriedFrom }),
        "Codex",
      ),
    ).toEqual({
      label: "AI Matrx · Session Explainer",
      note: "carried in by a handoff",
      fromMatrx: true,
    });
  });

  it("falls back to the raw token for a provider the label table does not know", () => {
    expect(
      transcriptAuthorship(
        turn({ carriedFrom: { ...carriedFrom, provider: "some_new_tool" } }),
        "Codex",
      ).label,
    ).toBe("Some New Tool");
  });

  it("leaves a NATIVE turn on the same conversation alone", () => {
    // The other expected value: same function, no carry, unchanged byline.
    expect(transcriptAuthorship(turn({}), "Codex")).toEqual({
      label: "Codex",
      note: null,
      fromMatrx: false,
    });
  });
});
