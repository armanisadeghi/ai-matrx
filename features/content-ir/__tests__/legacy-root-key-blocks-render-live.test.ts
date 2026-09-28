/**
 * OLD-FORMAT BLOCKS RENDER THE SAME LIVE AS SAVED (Arman, 2026-09-28).
 *
 * A reply that wrote `{"quiz_title": ...}` / `{"comparison": {...}}` /
 * `{"decision_tree": {...}}` / `{"diagram": {...}}` / `{"presentation": {...}}`
 * rendered correctly only AFTER the stream finished — the server adapts these
 * shapes on save, but the browser parses them itself while streaming and in
 * /markdown-studio, and there the quiz showed a "missing required field
 * title" error card. These payloads are verbatim from the failing reply;
 * each one must route to its real component with renderable serverData.
 */

import { applyIrKindRoute } from "../react/kind-route";
import { normalizeJsonRegion, IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import { kindRegistry } from "../registry/kind-registry";

type Routed = { type: string; serverData?: Record<string, unknown> };

function route(payload: Record<string, unknown>): Routed {
  const source = JSON.stringify(payload);
  const envelope = normalizeJsonRegion(source, {
    schemas: kindRegistry.snapshotSchemas(),
  });
  return applyIrKindRoute({
    type: "code",
    content: source,
    metadata: { [IR_ENVELOPE_KEY]: envelope },
  }) as unknown as Routed;
}

describe("legacy root-key blocks route to their component", () => {
  it("quiz_title quiz → MultipleChoiceQuiz data, no error card", () => {
    const routed = route({
      quiz_title: "Periodic Table Power-Up",
      category: "Chemistry",
      multiple_choice: [
        {
          id: 1,
          question: "What is the chemical symbol for gold?",
          options: ["Go", "Gd", "Au", "Ag"],
          correctAnswer: 2,
          explanation: "Au comes from the Latin 'aurum'.",
        },
      ],
    });
    expect(routed.type).toBe("quiz");
    expect(routed.serverData?.quizTitle).toBe("Periodic Table Power-Up");
    const questions = routed.serverData?.multipleChoice as Array<
      Record<string, unknown>
    >;
    expect(questions).toHaveLength(1);
    expect(questions[0].correctAnswer).toBe(2);
  });

  it("wrapped comparison renders its items", () => {
    const routed = route({
      comparison: {
        title: "Famous Elements Head-to-Head",
        items: ["Carbon", "Gold", "Uranium"],
        criteria: [
          { name: "Radioactive", values: [false, false, true], type: "boolean" },
        ],
      },
    });
    expect(routed.serverData).toBeDefined();
    expect(JSON.stringify(routed.serverData)).toContain("Uranium");
  });

  it("wrapped decision_tree renders its root question", () => {
    const routed = route({
      decision_tree: {
        title: "Classify a Mystery Element",
        root: {
          question: "Is it shiny?",
          yes: { action: "Metal" },
          no: { action: "Nonmetal" },
        },
      },
    });
    expect(routed.serverData).toBeDefined();
    expect(JSON.stringify(routed.serverData)).toContain("Is it shiny?");
  });

  it("wrapped diagram renders its nodes", () => {
    const routed = route({
      diagram: {
        type: "mindmap",
        title: "Families",
        nodes: [
          { id: "root", label: "Periodic Table", type: "start" },
          { id: "metals", label: "Metals", type: "process" },
        ],
        edges: [{ from: "root", to: "metals" }],
      },
    });
    expect(routed.serverData).toBeDefined();
    expect(JSON.stringify(routed.serverData)).toContain("Periodic Table");
  });

  it("wrapped presentation renders its slides", () => {
    const routed = route({
      presentation: {
        title: "Nature's Cheat Sheet",
        slides: [{ layout: "title", title: "The Periodic Table" }],
      },
    });
    expect(routed.serverData).toBeDefined();
    expect(JSON.stringify(routed.serverData)).toContain("The Periodic Table");
  });
});
