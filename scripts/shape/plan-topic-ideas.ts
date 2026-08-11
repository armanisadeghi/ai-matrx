/**
 * One-shot planner for the `topic_ideas` field declaration.
 *
 * `topic_ideas` was registered python-side with a complete
 * `emitted_json_schema` but a NULL `data[]` — so the frontend registry (which
 * reads ONLY `data` + `kind_edge`) sees a fieldless kind: it cannot render a
 * per-field form and `isKindBindable` refuses to bind it to an agent's
 * `output_schema`. This script declares the three real fields
 * (concept_summary, search_insights, ideas -> topic_idea[]) and regenerates
 * `emitted_block_schema` / `emitted_json_schema` / `emitted_fingerprint`
 * through the ONE sanctioned TS emitter (`planKindMigration`) — nothing is
 * hand-written.
 *
 * Prints the exact payload; it does not write. Run with `pnpm tsx`.
 */

import { readFileSync } from "node:fs";

import { planKindMigration } from "../../features/content-ir/registry/kind-migration-plan";
import { validateStructuralLeg } from "../../features/content-ir/registry/kind-dual-gate";
import { storageToKindSchema } from "../../features/content-ir/registry/kind-storage-transform";
import type { KindSchema } from "../../features/content-ir/core/kind-schema.types";

/** `topic_idea.data` as stored live (verified 2026-08-11). */
const TOPIC_IDEA_STORED = [
  {
    name: "title",
    type: "string",
    required: true,
    description:
      "A compelling, specific topic title written as if it were the episode or article headline",
  },
  {
    name: "hook",
    type: "string",
    required: true,
    description:
      "1-2 sentences explaining the core angle and why it's interesting or timely",
  },
  {
    name: "why_now",
    type: "string",
    required: true,
    description:
      "What recent event, trend, or data point makes this especially relevant right now",
  },
  {
    name: "key_points",
    type: "string[]",
    required: true,
    description: "Key points or talking points",
  },
  {
    name: "format_notes",
    type: "string",
    required: true,
    description:
      "A brief note on why this idea works well for the selected format and any structural suggestions",
  },
  {
    name: "tags",
    type: "string[]",
    required: true,
    description: "Topical tags",
  },
] as const;

const topicIdea: KindSchema = storageToKindSchema("topic_idea", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- literal mirror of the live row
  data: TOPIC_IDEA_STORED as any,
  edges: [],
});

/**
 * Field descriptions are copied verbatim from the live `emitted_json_schema`
 * so the regenerated schema keeps the same guidance the prompt already teaches.
 */
const topicIdeas: KindSchema = {
  kind: "topic_ideas",
  fields: {
    concept_summary: {
      type: "string",
      required: true,
      description:
        "A one-sentence summary of the user's core concept and the angle explored",
    },
    search_insights: {
      type: "string",
      required: true,
      description:
        "2-4 sentences summarizing the most interesting and relevant findings from web searches",
    },
    ideas: {
      type: "array",
      itemKinds: ["topic_idea"],
      required: true,
      description: "The individual topic ideas",
    },
  },
};

const plan = planKindMigration({
  schemas: { topic_ideas: topicIdeas, topic_idea: topicIdea },
  samples: {},
  labels: { topic_ideas: "Topic Ideas", topic_idea: "Topic Idea" },
  getDefinition: () => null,
});

// Pre-flight the live canonical example against the regenerated schema through
// the activation gate's OWN ajv leg (never a parallel validator). The DB
// trigger re-derives `validation_status` on write; this proves it will pass
// BEFORE the definition is touched.
const examplePath = process.env.TOPIC_IDEAS_EXAMPLE;
if (examplePath) {
  const sample = JSON.parse(readFileSync(examplePath, "utf8")) as unknown;
  const root = plan.kinds.find((k) => k.kind === "topic_ideas");
  console.log(
    "structural leg vs live canonical example:",
    JSON.stringify(validateStructuralLeg(sample, root?.emittedJsonSchema)),
  );
}

for (const kind of plan.kinds) {
  console.log(
    JSON.stringify(
      {
        kind: kind.kind,
        data: kind.data,
        edges: kind.edges,
        emittedBlockSchema: kind.emittedBlockSchema,
        emittedJsonSchema: kind.emittedJsonSchema,
        emittedFingerprint: kind.emittedFingerprint,
        unresolvedRefs: kind.unresolvedRefs,
      },
      null,
      2,
    ),
  );
}
