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
