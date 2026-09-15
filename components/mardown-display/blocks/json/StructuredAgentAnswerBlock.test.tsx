import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isRenderableStructuredAgentAnswer,
  parseStructuredAgentAnswer,
  StructuredAgentAnswerBlock,
} from "./StructuredAgentAnswerBlock";

const sandboxSpecialistSchema = {
  name: "sandbox_specialist_answer",
  schema: {
    type: "object",
    properties: {
      answer: { type: "string" },
      state: { enum: ["done", "blocked", "needs_user"] },
      commands_run: { type: "array", items: { type: "string" } },
      efficiency: { type: "string" },
      tools_worked: { type: "array", items: { type: "string" } },
      tools_failed: {
        type: "array",
        items: {
          type: "object",
          properties: { tool: { type: "string" }, error: { type: "string" } },
        },
      },
      next_step: { type: "string" },
    },
  },
};

// Captured v11 production shape from Sandbox Specialist 43ba7bad-d234-4cef-821f-c7e5722b3160.
const capturedSandboxAnswers = [
  {
    answer:
      "The sandbox is ready. I inspected the repository and found the requested configuration.",
    state: "done",
    commands_run: ["pwd", "rg --files"],
    efficiency: "Two shell commands completed without retries.",
    tools_worked: ["shell"],
    tools_failed: [],
    next_step: "Review the configuration and run the focused test.",
  },
  {
    answer:
      "The browser verification needs a decision because the sandbox has no authenticated browser session.",
    state: "needs_user",
    commands_run: ["pnpm install", "pnpm test"],
    efficiency: "Install and focused verification completed in 18 seconds.",
    tools_worked: ["shell", "filesystem"],
    tools_failed: [
      { tool: "browser", error: "No authenticated session is available." },
    ],
    next_step: "Open the changed file and confirm the rendered result.",
  },
];

describe("schema-bound assistant JSON answer", () => {
  it.each(capturedSandboxAnswers)(
    "renders captured Sandbox Specialist answer prose instead of raw JSON",
    (captured) => {
      const rawContent = JSON.stringify(captured);
      const parsed = parseStructuredAgentAnswer(
        rawContent,
        sandboxSpecialistSchema,
      );

      expect(parsed).toEqual(captured);
      expect(parsed && isRenderableStructuredAgentAnswer(parsed)).toBe(true);
      if (!parsed)
        throw new Error("captured schema-bound answer did not parse");
      const html = renderToStaticMarkup(
        <StructuredAgentAnswerBlock
          value={parsed}
          renderMarkdown={(content) => <p data-markdown="true">{content}</p>}
        />,
      );
      expect(html).toContain(captured.answer);
      expect(html).toContain(captured.state);
      expect(html).toContain("Next step");
      expect(html).toContain("Commands Run");
      expect(html).toContain("Details");
    },
  );

  it.each([
    ["no contract", null, JSON.stringify(capturedSandboxAnswers[0])],
    [
      "extra key",
      sandboxSpecialistSchema,
      JSON.stringify({
        ...capturedSandboxAnswers[0],
        private_trace: "do not claim",
      }),
    ],
    ["incomplete JSON", sandboxSpecialistSchema, '{"answer":"still streaming"'],
    [
      "registered kind",
      sandboxSpecialistSchema,
      JSON.stringify({ ...capturedSandboxAnswers[0], __kind: "agent_result" }),
    ],
  ])(
    "refuses %s and leaves the JSON floor unchanged",
    (_caseName, schema, content) => {
      expect(parseStructuredAgentAnswer(content, schema)).toBeNull();
    },
  );

  it("claims the long-string prose fallback before building Details", () => {
    const fallbackAnswer =
      "This sufficiently long schema field is the reader-facing explanation when answer is absent.";
    const value = {
      state: "done",
      explanation: fallbackAnswer,
      efficiency: "Completed in one pass.",
    };
    const parsed = parseStructuredAgentAnswer(JSON.stringify(value), {
      schema: { properties: { state: {}, explanation: {}, efficiency: {} } },
    });
    if (!parsed) throw new Error("fallback fixture did not parse");

    const html = renderToStaticMarkup(
      <StructuredAgentAnswerBlock
        value={parsed}
        renderMarkdown={(content) => <p>{content}</p>}
      />,
    );
    expect(html.match(new RegExp(fallbackAnswer, "g"))?.length).toBe(1);
    expect(html).toContain("Completed in one pass.");
  });
});
