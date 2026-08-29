import {
  buildRecentInteractionSamples,
  type PersistedInteractionRow,
} from "../recent-interaction-samples";

function row(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
): PersistedInteractionRow {
  return {
    id,
    call_id: id,
    tool_name: toolName,
    arguments: args,
    created_at: `2026-08-2${id}T12:00:00.000Z`,
    status: "completed",
    is_error: false,
  };
}

describe("buildRecentInteractionSamples", () => {
  it("rebuilds real user and surface-write calls as inert pending cards", () => {
    const samples = buildRecentInteractionSamples([
      row("8", "apply_surface_write", {
        target: "agent_description",
        value: "A complete real description",
      }),
      row("7", "user", {
        type: "choice",
        question: "Which route?",
        options: ["One", { label: "Two", description: "Safer" }],
      }),
    ]);

    expect(samples).toHaveLength(2);
    expect(samples[0]).toMatchObject({
      kind: "approval",
      conversationId: "demo-agent-cards-recent",
      approval: {
        title: "Agent description",
        fields: [{ after: "A complete real description" }],
      },
    });
    expect(samples[1]).toMatchObject({
      kind: "choice",
      question: "Which route?",
      options: [{ label: "One" }, { label: "Two", description: "Safer" }],
      allowOther: true,
    });
    expect(samples.every((sample) => sample.callId.startsWith("recent:"))).toBe(
      true,
    );
  });

  it("omits secret prompts and email calls", () => {
    const samples = buildRecentInteractionSamples([
      row("8", "user", { type: "secret", question: "Paste token" }),
      row("7", "google_email_send", {
        to: "private@example.com",
        subject: "Private",
        body: "Private body",
      }),
    ]);

    expect(samples).toEqual([]);
  });

  it("keeps the safe portion of a batch and renumbers the wizard", () => {
    const samples = buildRecentInteractionSamples([
      row("8", "user", {
        questions: [
          { type: "confirm", question: "Continue?" },
          { type: "secret", question: "Paste token" },
          { type: "text", question: "Any notes?" },
        ],
      }),
    ]);

    expect(samples).toHaveLength(2);
    expect(samples.map((sample) => sample.batchIndex)).toEqual([0, 1]);
    expect(samples.map((sample) => sample.batchTotal)).toEqual([2, 2]);
    expect(new Set(samples.map((sample) => sample.batchId)).size).toBe(1);
  });

  it("drops failed and malformed persisted rows", () => {
    const failed = row("8", "user", {
      type: "confirm",
      question: "Continue?",
    });
    failed.is_error = true;

    expect(
      buildRecentInteractionSamples([
        failed,
        row("7", "user", { type: "choice", options: ["Only one"] }),
      ]),
    ).toEqual([]);
  });
});
