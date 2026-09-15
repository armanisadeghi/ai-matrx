import React, { act } from "react";
import { createRoot } from "react-dom/client";
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

// Live persisted v11 capture: conversation 8be010c4-28ed-4ae1-898c-15f1fbbbbb37,
// assistant message 437ab575-8467-461e-b220-15a49d255693; followed by conversation
// ac9e6c80-ae00-424e-9358-0efce76424a3, assistant message 90799e53-248b-492b-a03b-fc66f5790085.
const capturedSandboxAnswers = [
  {
    answer:
      "indrev1 already existed; I reused it and ran the tests successfully. Real output: 1 passed in 0.00s.",
    state: "done",
    commands_run: [
      "mtx toolchain ensure && mtx new python indrev1 && cd ~/projects/indrev1 && uv run pytest -q",
      "cd ~/projects/indrev1 && uv run pytest -q",
    ],
    efficiency:
      "Efficient execution: reused existing project directory and verified tests immediately.",
    tools_worked: ["shell_execute"],
    tools_failed: [
      {
        tool: "shell_execute",
        error:
          "Command exited with code 1.\nstderr:\n[mtx new] /home/agent/projects/indrev1 already exists and is not empty. Pick another name, or work in it directly: cd /home/agent/projects/indrev1",
      },
    ],
    next_step: "none",
  },
  {
    answer:
      "The git clone failed with 403 Write access to repository not granted because the AI Matrx Admin GitHub App is not installed with contents: write permissions on the owning account AI-Matrix-Engine.",
    state: "needs_user",
    commands_run: [],
    efficiency:
      "Efficiently identified the exact cause and required resolution from the error pattern without redundant tool calls.",
    tools_worked: [],
    tools_failed: [],
    next_step:
      "Install the AI Matrx Admin GitHub App on AI-Matrix-Engine at https://github.com/apps/ai-matrx-admin/installations/new with contents: write, then refresh the inventory.",
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
          rawContent={rawContent}
          renderMarkdown={(content) => <p data-markdown="true">{content}</p>}
        />,
      );
      expect(html).toContain(captured.answer);
      expect(html).toContain(captured.state);
      expect(html).toContain(
        captured.state === "needs_user" ? "Needs User" : "Done",
      );
      expect(html).toContain("Next step");
      if (captured.commands_run.length) expect(html).toContain("Commands Run");
      expect(html).toContain("Details");
      expect(html).toContain(
        rawContent.replace(/&/g, "&amp;").replace(/"/g, "&quot;"),
      );
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

  it("keeps the long-string prose fallback and complete raw JSON in Details", () => {
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
        rawContent={JSON.stringify(value)}
        renderMarkdown={(content) => <p>{content}</p>}
      />,
    );
    expect(html.match(new RegExp(fallbackAnswer, "g"))?.length).toBe(2);
    expect(html).toContain("Completed in one pass.");
  });

  it("keeps the complete DONE projection outside a closed complete-raw Details control", async () => {
    const captured = capturedSandboxAnswers[0];
    const rawContent = JSON.stringify(captured);
    const parsed = parseStructuredAgentAnswer(
      rawContent,
      sandboxSpecialistSchema,
    );
    if (!parsed) throw new Error("captured payload did not parse");
    const host = document.createElement("div");
    const root = createRoot(host);
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => {
      root.render(
        <StructuredAgentAnswerBlock
          value={parsed}
          rawContent={rawContent}
          renderMarkdown={(text) => <p>{text}</p>}
        />,
      );
    });
    const details = host.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.querySelector("summary")?.classList.contains("min-h-11")).toBe(true);
    const visible = host.cloneNode(true) as HTMLElement;
    visible.querySelector("details")?.remove();
    expect(visible.textContent).toContain(captured.answer);
    expect(visible.textContent).toContain("Done");
    expect(visible.textContent).toContain("Next step");
    expect(visible.textContent).toContain("Commands Run");
    expect(visible.textContent).toContain("Tools Failed");
    expect(visible.textContent).toContain(captured.commands_run[0]);
    expect(visible.textContent).toContain("shell_execute");
    expect(visible.textContent).toContain("Command exited with code 1.");
    expect(visible.textContent).not.toContain('"tools_failed"');
    expect(details?.textContent).toContain(rawContent);
    await act(async () => {
      root.unmount();
    });
  });

  it("keeps the NEEDS_USER answer, state, and next step outside Details", async () => {
    const captured = capturedSandboxAnswers[1];
    const rawContent = JSON.stringify(captured);
    const parsed = parseStructuredAgentAnswer(rawContent, sandboxSpecialistSchema);
    if (!parsed) throw new Error("captured needs-user payload did not parse");
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <StructuredAgentAnswerBlock
          value={parsed}
          rawContent={rawContent}
          renderMarkdown={(text) => <p>{text}</p>}
        />,
      );
    });
    const details = host.querySelector("details");
    const visible = host.cloneNode(true) as HTMLElement;
    visible.querySelector("details")?.remove();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(visible.textContent).toContain(captured.answer);
    expect(visible.textContent).toContain("Needs User");
    expect(visible.textContent).toContain(captured.next_step);
    expect(visible.textContent).not.toContain('"next_step"');
    expect(details?.textContent).toContain(rawContent);
    await act(async () => {
      root.unmount();
    });
  });
});
