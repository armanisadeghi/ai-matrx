import {
  DEFAULT_DESTINATION_ID,
  IMPORTANT_CONTEXT_DESCRIPTION,
  IMPORTANT_CONTEXT_INLINE_CHARS,
  IMPORTANT_CONTEXT_KEY,
  buildDestinationOptions,
  buildLaunchPlan,
} from "../send-to-agent-plan";

describe("buildDestinationOptions", () => {
  it("offers Important context first (the default), then Your message, then the agent's own inputs and slots", () => {
    const options = buildDestinationOptions(
      [{ name: "topic", defaultValue: "", helpText: "What to write about" }],
      [{ key: "brief", type: "text", label: "Client brief", description: "The brief" }],
    );
    expect(options.map((o) => o.id)).toEqual([
      DEFAULT_DESTINATION_ID,
      "user-text",
      "variable:topic",
      "context:brief",
    ]);
    expect(options[2]).toMatchObject({ label: "Topic", description: "What to write about", group: "variables" });
    expect(options[3]).toMatchObject({ label: "Client brief", description: "The brief", group: "context" });
  });

  it("never offers a model control or a run-time-bound variable as a place for text", () => {
    const options = buildDestinationOptions(
      [
        { name: "temperature", defaultValue: 0.7, control: {} as never },
        { name: "client", defaultValue: "", binding: {} as never },
        { name: "topic", defaultValue: "" },
      ],
      [],
    );
    expect(options.filter((o) => o.group === "variables").map((o) => o.id)).toEqual(["variable:topic"]);
  });

  it("an agent that refuses ad-hoc context is not offered Important context (the server would drop it)", () => {
    const options = buildDestinationOptions([], [{ key: "brief", type: "text" }], { autoContextDisabled: true });
    expect(options.map((o) => o.id)).toEqual(["user-text", "context:brief"]);
  });

  it("an agent with no inputs or slots still offers the two general destinations", () => {
    expect(buildDestinationOptions(null, undefined).map((o) => o.id)).toEqual([
      DEFAULT_DESTINATION_ID,
      "user-text",
    ]);
  });
});

describe("buildLaunchPlan", () => {
  const content = "The answer to forward.";

  it("Important context rides as a described context entry that inlines up to 10,000 chars — never as user input", () => {
    const plan = buildLaunchPlan({ kind: "important-context" }, content);
    expect(plan.runtime.userInput).toBeUndefined();
    expect(plan.runtime.context).toEqual({
      [IMPORTANT_CONTEXT_KEY]: expect.objectContaining({
        content,
        description: IMPORTANT_CONTEXT_DESCRIPTION,
        max_inline_chars: IMPORTANT_CONTEXT_INLINE_CHARS,
      }),
    });
    expect(IMPORTANT_CONTEXT_INLINE_CHARS).toBe(10_000);
  });

  it("never adopts the launching page's ambient context — only what the person chose travels", () => {
    for (const d of [
      { kind: "important-context" as const },
      { kind: "user-text" as const },
      { kind: "variable" as const, name: "x" },
      { kind: "context-slot" as const, key: "y" },
    ]) {
      expect(buildLaunchPlan(d, content).runtime.surfaceName).toBeNull();
    }
  });

  it("Your message fills the composer only", () => {
    expect(buildLaunchPlan({ kind: "user-text" }, content).runtime).toEqual({ userInput: content, surfaceName: null });
  });

  it("a variable destination fills that variable and shows the variable panel", () => {
    const plan = buildLaunchPlan({ kind: "variable", name: "topic" }, content);
    expect(plan.runtime).toEqual({ variables: { topic: content }, surfaceName: null });
    expect(plan.showVariablePanel).toBe(true);
  });

  it("a context-slot destination fills that slot by key, keeping the slot's own label and type", () => {
    expect(
      buildLaunchPlan({ kind: "context-slot", key: "brief", label: "Client brief" }, content).runtime,
    ).toEqual({
      context: { brief: { content, label: "Client brief" } },
      surfaceName: null,
    });
  });
});
