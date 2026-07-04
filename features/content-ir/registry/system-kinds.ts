/**
 * Eager (compiled-in) system kinds. These are available before any network
 * fetch — the parser can speculate and validate against them from the first
 * streamed byte. They are the pre-warm BOOTSTRAP FALLBACK only: once
 * `ensureWarm()` delivers the flexible_data Block Schemas rows, the DB
 * schemas override these (facets survive — see kind-registry.ts).
 *
 * Shapes mirror the flexible_data "Block Schemas" rows (category
 * `block-schemas`). Families:
 * - flashcards: flashcard_set / flashcard / enhanced_flashcard /
 *   tiered_flashcard / basic_card. `set_title` stays declared (optional) on
 *   flashcard_set as a transition alias for `title` — the OLD agent payload
 *   key — until every producer emits `title`.
 * - the 8 JSON_BLOCK_PATTERNS successors (each bridges to the SAME legacy
 *   component via `legacyBlockType` + `toLegacyServerData`): quiz_set /
 *   quiz_question, presentation_deck / presentation_slide, decision_tree /
 *   decision_node, comparison_set / comparison_criterion, diagram_spec /
 *   diagram_node / diagram_edge, math_problem / math_solution /
 *   math_solution_step, item_presentation, schema_proposal.
 */

import type { KindDefinition } from "./kind-registry.types";
import { flashcardsServerDataFromEnvelope } from "../kinds/flashcard-set";
import { quizServerDataFromEnvelope } from "../kinds/quiz-set";
import { presentationServerDataFromEnvelope } from "../kinds/presentation-deck";
import { decisionTreeServerDataFromEnvelope } from "../kinds/decision-tree";
import { comparisonServerDataFromEnvelope } from "../kinds/comparison-set";
import { diagramServerDataFromEnvelope } from "../kinds/diagram-spec";
import { mathProblemServerDataFromEnvelope } from "../kinds/math-problem";
import { schemaProposalServerDataFromEnvelope } from "../kinds/schema-proposal";

export const SYSTEM_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "flashcard_set",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "flashcards",
    toLegacyServerData: flashcardsServerDataFromEnvelope,
    artifact: { canvasType: "flashcards" },
    persistence: { persistStructured: true },
    schema: {
      kind: "flashcard_set",
      fields: {
        title: { type: "string", required: true },
        // Transition alias — the OLD agent payload key; optional so both
        // shapes validate until every producer emits `title`.
        set_title: { type: "string" },
        cards: {
          type: "array",
          itemKinds: ["flashcard", "enhanced_flashcard", "tiered_flashcard"],
          required: true,
        },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "flashcard",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "flashcard",
      fields: {
        front: { type: "string", required: true },
        back: { type: "string", required: true, nullable: true },
        card_kind: { type: "string" },
        difficulty: { type: "string" },
        topic: { type: "string" },
        tags: { type: "string[]" },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "enhanced_flashcard",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "enhanced_flashcard",
      fields: {
        front: { type: "string", required: true },
        back: { type: "string", required: true },
        card_kind: { type: "string" },
        difficulty: { type: "string" },
        topic: { type: "string" },
        tags: { type: "string[]" },
        audio_explanation: { type: "string" },
        detailed_explanation: { type: "string" },
      },
    },
  },
  {
    kind: "tiered_flashcard",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "tiered_flashcard",
      fields: {
        front: { type: "string", required: true },
        back: { type: "string", required: true },
        card_kind: { type: "string" },
        difficulty: { type: "string" },
        topic: { type: "string" },
        tags: { type: "string[]" },
        subcards: { type: "array", itemKinds: ["basic_card"], required: true },
      },
    },
  },
  {
    kind: "basic_card",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "basic_card",
      fields: {
        front: { type: "string", required: true },
        back: { type: "string", required: true },
        topic: { type: "string" },
        difficulty: { type: "string" },
      },
    },
  },

  // ── quiz (legacy root key `quiz_title`) ─────────────────────────────────
  // quiz_set / quiz_question are USER-AUTHORED flexible_data rows (reused as
  // the successor kinds, not re-created). Shapes mirror those rows;
  // `additionalDetails` follows the flashcard_set compiled-def precedent.
  {
    kind: "quiz_set",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "quiz",
    toLegacyServerData: quizServerDataFromEnvelope,
    artifact: { canvasType: "quiz" },
    persistence: { persistStructured: true },
    schema: {
      kind: "quiz_set",
      fields: {
        title: { type: "string", required: true },
        description: { type: "string" },
        questions: {
          type: "array",
          itemKinds: ["quiz_question"],
          required: true,
        },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "quiz_question",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "quiz_question",
      fields: {
        type: { type: "string", required: true },
        question: { type: "string", required: true },
        options: { type: "string[]" },
        correct_answer: { type: "string", required: true },
        explanation: { type: "string" },
      },
    },
  },

  // ── presentation (legacy root key `presentation`) ───────────────────────
  {
    kind: "presentation_deck",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "presentation",
    toLegacyServerData: presentationServerDataFromEnvelope,
    artifact: { canvasType: "presentation" },
    persistence: { persistStructured: true },
    schema: {
      kind: "presentation_deck",
      fields: {
        title: { type: "string" },
        slides: {
          type: "array",
          itemKinds: ["presentation_slide"],
          required: true,
        },
        theme: {
          type: "inline_object",
          fields: {
            primaryColor: { type: "string" },
            secondaryColor: { type: "string" },
            accentColor: { type: "string" },
            backgroundColor: { type: "string" },
            textColor: { type: "string" },
            variant: { type: "string" },
            font: { type: "string" },
          },
        },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "presentation_slide",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "presentation_slide",
      fields: {
        type: { type: "string" },
        layout: { type: "string" },
        title: { type: "string" },
        subtitle: { type: "string" },
        description: { type: "string" },
        bullets: { type: "string[]" },
        quote: { type: "string" },
        author: { type: "string" },
        image_url: { type: "string" },
        notes: { type: "string" },
      },
    },
  },

  // ── decision tree (legacy root key `decision_tree`) ─────────────────────
  {
    kind: "decision_tree",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "decision_tree",
    toLegacyServerData: decisionTreeServerDataFromEnvelope,
    artifact: { canvasType: "decision-tree" },
    persistence: { persistStructured: true },
    schema: {
      kind: "decision_tree",
      fields: {
        title: { type: "string", required: true },
        description: { type: "string" },
        root: { type: "object", kind: "decision_node", required: true },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "decision_node",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "decision_node",
      fields: {
        // A node carries `question` (branching) OR `action` (leaf).
        question: { type: "string" },
        action: { type: "string" },
        description: { type: "string" },
        priority: { type: "string" },
        category: { type: "string" },
        estimatedTime: { type: "string" },
        yes: { type: "object", kind: "decision_node" },
        no: { type: "object", kind: "decision_node" },
      },
    },
  },

  // ── comparison table (legacy root key `comparison`) ─────────────────────
  {
    kind: "comparison_set",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "comparison_table",
    toLegacyServerData: comparisonServerDataFromEnvelope,
    artifact: { canvasType: "comparison" },
    persistence: { persistStructured: true },
    schema: {
      kind: "comparison_set",
      fields: {
        title: { type: "string", required: true },
        description: { type: "string" },
        items: { type: "string[]", required: true },
        criteria: {
          type: "array",
          itemKinds: ["comparison_criterion"],
          required: true,
        },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "comparison_criterion",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "comparison_criterion",
      fields: {
        name: { type: "string", required: true },
        // One value per compared item. Authored as strings ("9", "true",
        // "$$") — the schema grammar has no mixed scalar array. Numeric /
        // boolean emissions demote the node to raw but SURVIVE via residue;
        // the bridge reconstructs and the legacy parser normalizes them.
        values: { type: "string[]", required: true },
        type: { type: "string" },
        weight: { type: "number" },
        higherIsBetter: { type: "boolean" },
      },
    },
  },

  // ── diagram (legacy root key `diagram`) ─────────────────────────────────
  {
    kind: "diagram_spec",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "diagram",
    toLegacyServerData: diagramServerDataFromEnvelope,
    artifact: { canvasType: "diagram" },
    persistence: { persistStructured: true },
    schema: {
      kind: "diagram_spec",
      fields: {
        title: { type: "string", required: true },
        description: { type: "string" },
        type: { type: "string" },
        nodes: { type: "array", itemKinds: ["diagram_node"], required: true },
        edges: { type: "array", itemKinds: ["diagram_edge"] },
        layout: {
          type: "inline_object",
          fields: {
            direction: { type: "string" },
            spacing: { type: "number" },
            algorithm: { type: "string" },
          },
        },
        renderHints: {
          type: "inline_object",
          fields: {
            showLegend: { type: "boolean" },
            showEdgeLabels: { type: "boolean" },
            compactNodes: { type: "boolean" },
            hideArrows: { type: "boolean" },
          },
        },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "diagram_node",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "diagram_node",
      fields: {
        id: { type: "string", required: true },
        label: { type: "string", required: true },
        type: { type: "string" },
        description: { type: "string" },
        details: { type: "string" },
        position: {
          type: "inline_object",
          fields: {
            x: { type: "number", required: true },
            y: { type: "number", required: true },
          },
        },
        // Pedigree fields
        gender: { type: "string" },
        affected: { type: "boolean" },
        deceased: { type: "boolean" },
        proband: { type: "boolean" },
        birthYear: { type: "string" },
        deathYear: { type: "string" },
        generation: { type: "number" },
        // Visual overrides
        color: { type: "string" },
        icon: { type: "string" },
      },
    },
  },
  {
    kind: "diagram_edge",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "diagram_edge",
      fields: {
        id: { type: "string" },
        source: { type: "string", required: true },
        target: { type: "string", required: true },
        label: { type: "string" },
        type: { type: "string" },
        color: { type: "string" },
        dashed: { type: "boolean" },
        strokeWidth: { type: "number" },
        relationship: { type: "string" },
        arrow: { type: "boolean" },
        animated: { type: "boolean" },
      },
    },
  },

  // ── math problem (legacy root key `math_problem`) ───────────────────────
  {
    kind: "math_problem",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "math_problem",
    toLegacyServerData: mathProblemServerDataFromEnvelope,
    artifact: { canvasType: "math_problem" },
    persistence: { persistStructured: true },
    schema: {
      kind: "math_problem",
      fields: {
        title: { type: "string", required: true },
        course_name: { type: "string" },
        topic_name: { type: "string" },
        module_name: { type: "string" },
        description: { type: "string", nullable: true },
        intro_text: { type: "string", nullable: true },
        final_statement: { type: "string", nullable: true },
        problem_statement: {
          type: "inline_object",
          required: true,
          fields: {
            text: { type: "string", required: true },
            equation: { type: "string", required: true },
            instruction: { type: "string", required: true },
          },
        },
        solutions: {
          type: "array",
          itemKinds: ["math_solution"],
          required: true,
        },
        hint: { type: "string", nullable: true },
        resources: { type: "string[]", nullable: true },
        difficulty_level: { type: "string", nullable: true },
        related_content: { type: "string[]", nullable: true },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "math_solution",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "math_solution",
      fields: {
        task: { type: "string", required: true },
        steps: {
          type: "array",
          itemKinds: ["math_solution_step"],
          required: true,
        },
        solutionAnswer: { type: "string", required: true },
        transitionText: { type: "string", nullable: true },
      },
    },
  },
  {
    kind: "math_solution_step",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "math_solution_step",
      fields: {
        title: { type: "string", required: true },
        equation: { type: "string", required: true },
        explanation: { type: "string" },
        simplified: { type: "string" },
      },
    },
  },

  // ── item presentation (legacy root key `item_presentation`) ─────────────
  // No serverData bridge: ItemPresentationBlock parses `content` itself and
  // its parser natively tolerates the FLAT kind shape (`parsed.
  // item_presentation ?? parsed`), streaming included — the type flip alone
  // routes it.
  {
    kind: "item_presentation",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "item_presentation",
    schema: {
      kind: "item_presentation",
      fields: {
        type: { type: "string", required: true },
        id: { type: "string" },
        name: { type: "string" },
        about: { type: "string" },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },

  // ── schema proposal (legacy root key `name` + object `schema`) ──────────
  {
    kind: "schema_proposal",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "schema_proposal",
    toLegacyServerData: schemaProposalServerDataFromEnvelope,
    schema: {
      kind: "schema_proposal",
      fields: {
        name: { type: "string", required: true },
        // Arbitrary JSON Schema — contents ride residue (zero loss).
        schema: { type: "inline_object", fields: {}, required: true },
        strict: { type: "boolean" },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
];
