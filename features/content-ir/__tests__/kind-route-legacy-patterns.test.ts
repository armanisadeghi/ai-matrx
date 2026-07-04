/**
 * The 8 JSON_BLOCK_PATTERNS successors: each legacy root-key-detected block
 * type now has a `__kind` self-discriminating kind that routes to the SAME
 * legacy component via `legacyBlockType` + `toLegacyServerData`. These tests
 * drive full envelopes through `applyIrKindRoute` and assert (a) the type
 * flip and (b) the exact serverData shape each component consumes.
 *
 * Plus one accumulator-level test proving a NEW-shape payload streams to a
 * routed envelope (the accumulator-shadow harness).
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { applyIrKindRoute } from "../react/kind-route";
import { normalizeJsonRegion, isCanonicalBlockIR } from "../core/normalize";
import { kindRegistry } from "../registry/kind-registry";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "../core/ir-types";
import { chunkText } from "./seeded-random";

function envelopeFor(source: string) {
  return normalizeJsonRegion(source, {
    schemas: kindRegistry.snapshotSchemas(),
  });
}

function routedBlockFor(payload: Record<string, unknown>) {
  const source = JSON.stringify(payload);
  const envelope = envelopeFor(source);
  const block = {
    type: "code",
    content: source,
    metadata: { [IR_ENVELOPE_KEY]: envelope },
  };
  return applyIrKindRoute(block);
}

type Routed = ReturnType<typeof routedBlockFor> & {
  serverData?: Record<string, unknown>;
};

describe("quiz_set → quiz (MultipleChoiceQuiz serverData)", () => {
  const QUIZ = {
    __kind: "quiz_set",
    title: "JS Basics",
    description: "Quick check",
    questions: [
      {
        __kind: "quiz_question",
        type: "multiple_choice",
        question: "What is 2 + 2?",
        options: ["3", "4", "5"],
        correct_answer: "4",
        explanation: "Basic arithmetic.",
      },
      {
        __kind: "quiz_question",
        type: "true_false",
        question: "Is JavaScript statically typed?",
        correct_answer: "False",
      },
    ],
  };

  it("routes to type quiz with the canonical camelCase payload", () => {
    const routed = routedBlockFor(QUIZ) as Routed;
    expect(routed.type).toBe("quiz");

    const sd = routed.serverData as {
      quizTitle?: string;
      description?: string;
      multipleChoice?: Array<Record<string, unknown>>;
    };
    expect(sd?.quizTitle).toBe("JS Basics");
    expect(sd?.description).toBe("Quick check"); // extras carried, zero loss
    expect(sd?.multipleChoice).toHaveLength(2);

    // correct_answer string → option index; original string rides along.
    expect(sd?.multipleChoice?.[0]).toMatchObject({
      id: 1,
      question: "What is 2 + 2?",
      options: ["3", "4", "5"],
      correctAnswer: 1,
      explanation: "Basic arithmetic.",
      correct_answer: "4",
      type: "multiple_choice",
    });

    // true_false without options → synthesized ["True","False"].
    expect(sd?.multipleChoice?.[1]).toMatchObject({
      id: 2,
      options: ["True", "False"],
      correctAnswer: 1,
    });
  });
});

describe("presentation_deck → presentation (Slideshow payload)", () => {
  const DECK = {
    __kind: "presentation_deck",
    title: "Launch Deck",
    slides: [
      {
        __kind: "presentation_slide",
        type: "title",
        title: "Hello",
        subtitle: "World",
      },
      {
        __kind: "presentation_slide",
        type: "bullets",
        title: "Points",
        bullets: ["one", "two"],
        speaker_hint: "extra kept", // schema-unknown → residue → merged back
      },
    ],
    theme: { primaryColor: "#123456", variant: "fancy" },
  };

  it("routes to type presentation with a flat slides+theme payload", () => {
    const routed = routedBlockFor(DECK) as Routed;
    expect(routed.type).toBe("presentation");

    const sd = routed.serverData as {
      slides?: Array<Record<string, unknown>>;
      theme?: Record<string, unknown>;
      title?: string;
    };
    expect(sd?.slides).toHaveLength(2);
    expect(sd?.theme).toEqual({ primaryColor: "#123456", variant: "fancy" });
    expect(sd?.title).toBe("Launch Deck");

    // __kind stripped from every slide; extras survive.
    expect(sd?.slides?.[0]).toEqual({
      type: "title",
      title: "Hello",
      subtitle: "World",
    });
    expect(sd?.slides?.[1]).toMatchObject({
      bullets: ["one", "two"],
      speaker_hint: "extra kept",
    });
  });
});

describe("decision_tree → decision_tree (parsed DecisionTreeData)", () => {
  const TREE = {
    __kind: "decision_tree",
    title: "Bug Diagnosis",
    description: "Step-by-step",
    root: {
      __kind: "decision_node",
      question: "Is it reproducible?",
      yes: { __kind: "decision_node", action: "Fix it" },
      no: { __kind: "decision_node", action: "Monitor" },
    },
  };

  it("routes with ids assigned and node types inferred (component parser parity)", () => {
    const routed = routedBlockFor(TREE) as Routed;
    expect(routed.type).toBe("decision_tree");

    const sd = routed.serverData as {
      title?: string;
      root?: Record<string, unknown>;
    };
    expect(sd?.title).toBe("Bug Diagnosis");
    expect(sd?.root).toMatchObject({
      id: "root",
      type: "question",
      question: "Is it reproducible?",
    });
    expect(sd?.root?.yes).toMatchObject({
      id: "root-yes",
      type: "action",
      action: "Fix it",
    });
    expect(sd?.root?.no).toMatchObject({ id: "root-no", action: "Monitor" });
  });
});

describe("comparison_set → comparison_table (parsed ComparisonTableData)", () => {
  const COMPARISON = {
    __kind: "comparison_set",
    title: "Cloud Providers",
    items: ["AWS", "GCP"],
    criteria: [
      {
        __kind: "comparison_criterion",
        name: "Price",
        values: ["$$", "$"],
        type: "cost",
      },
      {
        // Numeric values violate the string[]-declared schema — the node
        // demotes to raw but its VALUE survives (zero data loss), the bridge
        // reconstructs, and the legacy parser infers a rating.
        __kind: "comparison_criterion",
        name: "Performance",
        values: [4, 5],
      },
    ],
  };

  it("routes with criterion types inferred and defaults filled", () => {
    const routed = routedBlockFor(COMPARISON) as Routed;
    expect(routed.type).toBe("comparison_table");

    const sd = routed.serverData as {
      title?: string;
      items?: string[];
      criteria?: Array<Record<string, unknown>>;
    };
    expect(sd?.title).toBe("Cloud Providers");
    expect(sd?.items).toEqual(["AWS", "GCP"]);
    expect(sd?.criteria).toHaveLength(2);
    expect(sd?.criteria?.[0]).toMatchObject({
      name: "Price",
      type: "cost",
      weight: 1,
      higherIsBetter: false,
    });
    expect(sd?.criteria?.[1]).toMatchObject({
      name: "Performance",
      type: "rating",
      values: [4, 5],
      higherIsBetter: true,
    });
  });
});

describe("diagram_spec → diagram (parsed DiagramData)", () => {
  const DIAGRAM = {
    __kind: "diagram_spec",
    title: "Flow",
    type: "flowchart",
    nodes: [
      { __kind: "diagram_node", id: "a", label: "Start" },
      { __kind: "diagram_node", id: "b", label: "End" },
    ],
    edges: [{ __kind: "diagram_edge", source: "a", target: "b" }],
  };

  it("routes with positions generated and edge defaults synthesized", () => {
    const routed = routedBlockFor(DIAGRAM) as Routed;
    expect(routed.type).toBe("diagram");

    const sd = routed.serverData as {
      title?: string;
      nodes?: Array<Record<string, unknown>>;
      edges?: Array<Record<string, unknown>>;
    };
    expect(sd?.title).toBe("Flow");
    expect(sd?.nodes).toHaveLength(2);
    expect(sd?.nodes?.[0]?.position).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    });
    expect(sd?.edges?.[0]).toMatchObject({
      id: "edge_a_to_b_0",
      source: "a",
      target: "b",
      type: "default",
      strokeWidth: 2,
    });
  });
});

describe("math_problem → math_problem (wrapped payload)", () => {
  const MATH = {
    __kind: "math_problem",
    title: "Quadratic Roots",
    problem_statement: {
      text: "Solve for x",
      equation: "x^2 = 4",
      instruction: "Find all roots",
    },
    solutions: [
      {
        __kind: "math_solution",
        task: "Solve",
        steps: [
          {
            __kind: "math_solution_step",
            title: "Take the square root",
            equation: "x = ±2",
          },
        ],
        solutionAnswer: "x = ±2",
      },
    ],
  };

  it("routes with the legacy { math_problem } wrapper, __kind stripped deep", () => {
    const routed = routedBlockFor(MATH) as Routed;
    expect(routed.type).toBe("math_problem");

    const sd = routed.serverData as {
      math_problem?: {
        title?: string;
        solutions?: Array<Record<string, unknown>>;
      } & Record<string, unknown>;
    };
    expect(sd?.math_problem?.title).toBe("Quadratic Roots");
    expect(sd?.math_problem?.__kind).toBeUndefined();
    const solution = sd?.math_problem?.solutions?.[0] as Record<
      string,
      unknown
    > & { steps?: Array<Record<string, unknown>> };
    expect(solution?.__kind).toBeUndefined();
    expect(solution?.steps?.[0]).toEqual({
      title: "Take the square root",
      equation: "x = ±2",
    });
  });
});

describe("schema_proposal → schema_proposal (root-only __kind strip)", () => {
  const PROPOSAL = {
    __kind: "schema_proposal",
    name: "flashcards_output",
    strict: true,
    schema: {
      type: "object",
      // A render-block-aware output schema legitimately declares the
      // discriminator property ITSELF — a deep strip would delete it.
      properties: {
        __kind: { const: "flashcard_set" },
        title: { type: "string" },
      },
    },
  };

  it("hands the component a clean proposal, preserving nested __kind keys", () => {
    const routed = routedBlockFor(PROPOSAL) as Routed;
    expect(routed.type).toBe("schema_proposal");

    const sd = routed.serverData as {
      __kind?: unknown;
      name?: string;
      strict?: boolean;
      schema?: { properties?: Record<string, unknown> };
    };
    expect(sd?.__kind).toBeUndefined(); // injected root discriminator gone
    expect(sd?.name).toBe("flashcards_output");
    expect(sd?.strict).toBe(true);
    // Nested legitimate __kind property SURVIVES (root-only strip).
    expect(sd?.schema?.properties?.__kind).toEqual({
      const: "flashcard_set",
    });
  });
});

describe("item_presentation → item_presentation (content-tolerant, no bridge)", () => {
  const ITEM = {
    __kind: "item_presentation",
    type: "agent",
    id: "agent-123",
    name: "Research Helper",
  };

  it("flips the type only — the component's own parser reads the flat shape", () => {
    const source = JSON.stringify(ITEM);
    const routed = routedBlockFor(ITEM) as Routed;
    expect(routed.type).toBe("item_presentation");
    expect(routed.serverData).toBeUndefined();
    expect(routed.content).toBe(source); // untouched — the parser's input
  });
});

describe("accumulator: NEW-shape payload streams to a routed envelope", () => {
  it("streams a bare quiz_set and routes the final block to quiz", () => {
    const upserts: Array<{ block: RenderBlockPayload }> = [];
    const accumulator = new StreamBlockAccumulator("req-quiz-kind", (payload) => {
      upserts.push(payload as { block: RenderBlockPayload });
      return { type: "test/upsert", payload };
    });
    const dispatch = (action: unknown) => action;

    const quizJson = JSON.stringify(
      {
        __kind: "quiz_set",
        title: "Streamed Quiz",
        questions: [
          {
            __kind: "quiz_question",
            type: "multiple_choice",
            question: "Pick one",
            options: ["a", "b"],
            correct_answer: "b",
          },
        ],
      },
      null,
      2,
    );
    const stream = `Here you go:\n\n${quizJson}\n\nDone.\n`;

    for (const chunk of chunkText(stream, 7, 9)) {
      accumulator.ingest(chunk, dispatch);
    }
    accumulator.finalize(dispatch);

    // Find the final complete block carrying a resolved quiz_set envelope.
    const final = [...upserts]
      .reverse()
      .find(({ block }) => {
        const candidate = block.metadata?.[IR_ENVELOPE_KEY];
        return (
          block.status === "complete" &&
          isCanonicalBlockIR(candidate) &&
          (candidate as CanonicalBlockIR).root.kind === "quiz_set"
        );
      });
    if (!final) {
      throw new Error("no complete block carrying a quiz_set envelope");
    }

    const routed = applyIrKindRoute(
      final.block as unknown as {
        type: string;
        serverData?: Record<string, unknown>;
        metadata?: Record<string, unknown>;
      },
    );
    expect(routed.type).toBe("quiz");
    const sd = routed.serverData as {
      quizTitle?: string;
      multipleChoice?: Array<Record<string, unknown>>;
    };
    expect(sd?.quizTitle).toBe("Streamed Quiz");
    expect(sd?.multipleChoice?.[0]).toMatchObject({ correctAnswer: 1 });
  });
});
