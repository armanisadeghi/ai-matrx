/**
 * exportArtifactMarkdown — the forward artifact → markdown leg.
 *
 * PURE module (no IO): rows are built literally and the markdown asserted
 * structurally per kind family. The two laws under test everywhere:
 * human-readable output (headings / lists / bold — no JSON dump unless the
 * kind is inherently code or unregistered) and zero silent loss (unknown
 * keys surface under "Additional details" / inline extras).
 */

import { KIND_KEY } from "@/features/content-ir/core/kind-schema.types";
import type { CanvasArtifactRow } from "@/features/canvas/services/canvasArtifactService";
import {
  artifactContentToMarkdown,
  exportArtifactMarkdown,
} from "../exportArtifactMarkdown";

function row(
  type: string,
  data: unknown,
  overrides: Partial<CanvasArtifactRow> = {},
): CanvasArtifactRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000002",
    type,
    title: "Test artifact",
    content: { data, type, metadata: { title: "Test artifact" } },
    conversation_id: null,
    source_message_id: null,
    artifact_index: 1,
    version: 1,
    parent_canvas_id: null,
    source_type: "model_direct",
    external_system: null,
    external_id: null,
    created_at: "2026-07-04T00:00:00Z",
    updated_at: "2026-07-04T00:00:00Z",
    ...overrides,
  };
}

describe("exportArtifactMarkdown — flashcards", () => {
  const set = {
    [KIND_KEY]: "flashcard_set",
    title: "Cell Biology",
    cards: [
      {
        [KIND_KEY]: "flashcard",
        front: "What is a mitochondrion?",
        back: "The powerhouse of the cell.",
        topic: "Organelles",
        difficulty: "easy",
        tags: ["bio", "energy"],
        mnemonic: "Mighty mito", // unknown key — must not vanish
      },
      {
        [KIND_KEY]: "tiered_flashcard",
        front: "Name the cell cycle phases",
        back: "G1, S, G2, M",
        subcards: [
          { [KIND_KEY]: "basic_card", front: "S phase?", back: "DNA synthesis" },
        ],
      },
    ],
    additionalDetails: { source: "Chapter 3" },
    review_after: "2026-08-01", // unknown set-level key
  };

  it("renders readable Q&A markdown, not a JSON dump", () => {
    const { markdown, title } = exportArtifactMarkdown(row("flashcards", set));

    expect(title).toBe("Test artifact");
    expect(markdown).toContain("# Cell Biology");
    expect(markdown).toContain("## Card 1");
    expect(markdown).toContain("**Front:** What is a mitochondrion?");
    expect(markdown).toContain("**Back:** The powerhouse of the cell.");
    expect(markdown).toContain("- **Topic:** Organelles");
    expect(markdown).toContain("- **Tags:** bio, energy");
    // Subcards nest under their card.
    expect(markdown).toContain("**Subcards:**");
    expect(markdown).toContain("- **Front:** S phase? — **Back:** DNA synthesis");
    // Not a dump; no discriminators leak.
    expect(markdown).not.toContain("```json");
    expect(markdown).not.toContain(KIND_KEY);
  });

  it("surfaces unknown keys instead of silently dropping them", () => {
    const { markdown } = exportArtifactMarkdown(row("flashcards", set));

    // Card-level unknown key rides the card's inline list.
    expect(markdown).toContain("- **mnemonic:** Mighty mito");
    // Set-level unknowns + the declared additionalDetails bag land under
    // the Additional details section.
    expect(markdown).toContain("## Additional details");
    expect(markdown).toContain("- **source:** Chapter 3");
    expect(markdown).toContain("- **review_after:** 2026-08-01");
  });
});

describe("exportArtifactMarkdown — quiz", () => {
  it("renders numbered options with the answer spelled out", () => {
    const quiz = {
      [KIND_KEY]: "quiz_set",
      title: "Capitals",
      description: "A quick geography check.",
      questions: [
        {
          [KIND_KEY]: "quiz_question",
          type: "multiple_choice",
          question: "Capital of France?",
          options: ["London", "Paris"],
          correct_answer: "Paris",
          explanation: "Paris has been the capital since 987.",
          points: 5, // unknown key
        },
      ],
    };
    const { markdown } = exportArtifactMarkdown(row("quiz", quiz));

    expect(markdown).toContain("# Capitals");
    expect(markdown).toContain("A quick geography check.");
    expect(markdown).toContain("## Question 1");
    expect(markdown).toContain("1. London\n2. Paris");
    expect(markdown).toContain("**Answer:** Paris");
    expect(markdown).toContain("**Explanation:** Paris has been the capital");
    expect(markdown).toContain("- **points:** 5");
    expect(markdown).not.toContain(KIND_KEY);
  });
});

describe("exportArtifactMarkdown — comparison", () => {
  it("renders a real markdown table with criteria as rows", () => {
    const comparison = {
      [KIND_KEY]: "comparison_set",
      title: "Framework face-off",
      items: ["React", "Vue"],
      criteria: [
        {
          [KIND_KEY]: "comparison_criterion",
          name: "Ecosystem",
          values: ["9", "7"],
          weight: 0.4,
        },
        {
          [KIND_KEY]: "comparison_criterion",
          name: "Pipes | escaped",
          values: ["a|b", "c"],
        },
      ],
    };
    const { markdown } = exportArtifactMarkdown(row("comparison", comparison));

    expect(markdown).toContain("# Framework face-off");
    expect(markdown).toContain("| Criteria | React | Vue |");
    expect(markdown).toContain("| Ecosystem | 9 | 7 |");
    // Pipes inside cells cannot break the table.
    expect(markdown).toContain("| Pipes \\| escaped | a\\|b | c |");
    // Weight survives as a criteria note.
    expect(markdown).toContain("**Criteria notes:**");
    expect(markdown).toContain("- **Ecosystem:** weight: 0.4");
  });
});

describe("exportArtifactMarkdown — presentation", () => {
  it("renders one section per slide with bullets and quotes", () => {
    const deck = {
      [KIND_KEY]: "presentation_deck",
      title: "Q3 Review",
      slides: [
        {
          [KIND_KEY]: "presentation_slide",
          title: "Highlights",
          subtitle: "What went well",
          bullets: ["Revenue up 12%", "Churn down"],
          notes: "Pause here.",
        },
        {
          [KIND_KEY]: "presentation_slide",
          quote: "Simplicity scales.",
          author: "Anon",
        },
      ],
      theme: { primaryColor: "#112233" },
    };
    const { markdown } = exportArtifactMarkdown(row("presentation", deck));

    expect(markdown).toContain("# Q3 Review");
    expect(markdown).toContain("## Slide 1: Highlights");
    expect(markdown).toContain("*What went well*");
    expect(markdown).toContain("- Revenue up 12%");
    expect(markdown).toContain("**Notes:** Pause here.");
    expect(markdown).toContain("## Slide 2");
    expect(markdown).toContain("> Simplicity scales.");
    expect(markdown).toContain("> — Anon");
    // Theme is metadata — preserved under Additional details.
    expect(markdown).toContain("## Additional details");
    expect(markdown).toContain("- **theme:**");
  });
});

describe("exportArtifactMarkdown — decision tree", () => {
  it("renders a nested Yes/No outline down to leaf actions", () => {
    const tree = {
      [KIND_KEY]: "decision_tree",
      title: "Deploy?",
      root: {
        [KIND_KEY]: "decision_node",
        question: "Are tests green?",
        yes: {
          [KIND_KEY]: "decision_node",
          action: "Ship it",
          priority: "high",
        },
        no: {
          [KIND_KEY]: "decision_node",
          action: "Fix tests first",
        },
      },
    };
    const { markdown } = exportArtifactMarkdown(row("decision-tree", tree));

    expect(markdown).toContain("# Deploy?");
    expect(markdown).toContain("- **Question:** Are tests green?");
    expect(markdown).toContain("  - **Yes:**");
    expect(markdown).toContain("    - **Action:** Ship it (priority: high)");
    expect(markdown).toContain("  - **No:**");
    expect(markdown).toContain("    - **Action:** Fix tests first");
  });
});

describe("exportArtifactMarkdown — math problem", () => {
  it("renders the problem statement and worked solution steps", () => {
    const problem = {
      [KIND_KEY]: "math_problem",
      title: "Solve for x",
      problem_statement: {
        text: "A linear equation.",
        equation: "2x + 4 = 10",
        instruction: "Find x.",
      },
      solutions: [
        {
          [KIND_KEY]: "math_solution",
          task: "Isolate x",
          steps: [
            {
              [KIND_KEY]: "math_solution_step",
              title: "Subtract 4",
              equation: "2x = 6",
              explanation: "Remove the constant term.",
            },
          ],
          solutionAnswer: "x = 3",
        },
      ],
      hint: "Undo operations in reverse order.",
    };
    const { markdown } = exportArtifactMarkdown(row("math_problem", problem));

    expect(markdown).toContain("# Solve for x");
    expect(markdown).toContain("## Problem");
    expect(markdown).toContain("`2x + 4 = 10`");
    expect(markdown).toContain("**Hint:** Undo operations in reverse order.");
    expect(markdown).toContain("## Solution 1: Isolate x");
    expect(markdown).toContain("### Step 1: Subtract 4");
    expect(markdown).toContain("`2x = 6`");
    expect(markdown).toContain("**Answer:** x = 3");
  });
});

describe("exportArtifactMarkdown — item presentation", () => {
  it("leads with name/about and lists every remaining field", () => {
    const item = {
      [KIND_KEY]: "item_presentation",
      type: "product_card",
      name: "Matrx Pro",
      about: "The enterprise tier.",
      price: "$99/mo",
      seats: 25,
    };
    const { markdown } = exportArtifactMarkdown(
      row("item_presentation", item),
    );

    expect(markdown).toContain("# Matrx Pro");
    expect(markdown).toContain("*Product card*");
    expect(markdown).toContain("The enterprise tier.");
    expect(markdown).toContain("- **price:** $99/mo");
    expect(markdown).toContain("- **seats:** 25");
    expect(markdown).not.toContain(KIND_KEY);
  });
});

describe("exportArtifactMarkdown — diagram", () => {
  it("renders nodes and edges with ids resolved to labels", () => {
    const diagram = {
      [KIND_KEY]: "diagram_spec",
      title: "Auth flow",
      type: "flowchart",
      nodes: [
        { [KIND_KEY]: "diagram_node", id: "a", label: "Login form" },
        { [KIND_KEY]: "diagram_node", id: "b", label: "API", type: "service" },
      ],
      edges: [
        {
          [KIND_KEY]: "diagram_edge",
          source: "a",
          target: "b",
          label: "POST /login",
        },
      ],
    };
    const { markdown } = exportArtifactMarkdown(row("diagram", diagram));

    expect(markdown).toContain("# Auth flow");
    expect(markdown).toContain("*flowchart diagram*");
    expect(markdown).toContain("## Nodes");
    expect(markdown).toContain("- **Login form**");
    expect(markdown).toContain("- **API** (service)");
    expect(markdown).toContain("## Edges");
    expect(markdown).toContain("- Login form → API: POST /login");
  });
});

describe("exportArtifactMarkdown — schema proposal", () => {
  it("emits the JSON Schema verbatim as a fenced json body (by design)", () => {
    const proposal = {
      [KIND_KEY]: "schema_proposal",
      name: "render_output",
      strict: true,
      schema: {
        type: "object",
        properties: { [KIND_KEY]: { type: "string" } }, // legit user data
      },
    };
    const { markdown } = exportArtifactMarkdown(
      row("schema_proposal", proposal),
    );

    expect(markdown).toContain("# render_output");
    expect(markdown).toContain("**Strict:** yes");
    expect(markdown).toContain("## Schema");
    expect(markdown).toContain("```json");
    // The schema body is verbatim — its own __kind property survives.
    expect(markdown).toContain(`"${KIND_KEY}"`);
  });
});

describe("exportArtifactMarkdown — string + fallback paths", () => {
  it("passes string content through untouched (it IS markdown/wire text)", () => {
    const text = "## My notes\n\nJust markdown, **bold** and all.";
    const { markdown } = exportArtifactMarkdown(row("html", text));
    expect(markdown).toBe(text);
  });

  it("routes a stringified kind payload through the kind facet", () => {
    // ArtifactRefBlock hands ArtifactBlock JSON.stringify(content.data) —
    // the string entry point must behave exactly like the object one.
    const set = {
      [KIND_KEY]: "flashcard_set",
      title: "Stringified",
      cards: [{ [KIND_KEY]: "flashcard", front: "Q", back: "A" }],
    };
    const markdown = artifactContentToMarkdown(JSON.stringify(set));
    expect(markdown).toContain("# Stringified");
    expect(markdown).toContain("**Front:** Q");
  });

  it("falls back to a generic heading + fenced json for unregistered kinds", () => {
    const value = { [KIND_KEY]: "totally_unknown_kind", payload: [1, 2, 3] };
    const { markdown } = exportArtifactMarkdown(row("mystery", value));

    expect(markdown).toContain("# Totally unknown kind");
    expect(markdown).toContain("```json");
    // Zero loss: the dump keeps everything, discriminator included.
    expect(markdown).toContain('"payload"');
    expect(markdown).toContain('"totally_unknown_kind"');
  });

  it("never dead-ends on off-contract rows", () => {
    const nullRow = row("html", null, { content: null, title: null });
    const out = exportArtifactMarkdown(nullRow);
    expect(out.title).toBe("Artifact");
    expect(out.markdown).toContain("```json");

    const bareString = row("code", "", {
      content: "const x = 1;",
      title: null,
    });
    expect(exportArtifactMarkdown(bareString).markdown).toBe("const x = 1;");
  });

  it("prefers row.title, then content.metadata.title, then 'Artifact'", () => {
    const data = "text";
    expect(
      exportArtifactMarkdown(row("html", data, { title: "Row title" })).title,
    ).toBe("Row title");
    expect(
      exportArtifactMarkdown(row("html", data, { title: null })).title,
    ).toBe("Test artifact"); // from content.metadata.title
  });
});
