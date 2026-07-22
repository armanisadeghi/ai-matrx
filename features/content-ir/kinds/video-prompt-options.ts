/**
 * video_prompt_options kind → VideoPromptOptionsBlock bridge (+ compiled
 * definitions).
 *
 * The first ACTION-CARRYING kind: an agent emits production-ready video
 * prompt variations, and the rendered component lets the user fire the
 * generation agent (one click → visible chat overlay, prompt pre-filled)
 * through the platform-owned `KindAgentActionButton` primitive
 * (features/content-ir/react/actions/). Canonical `__kind` JSON shape:
 *
 *   { __kind:"video_prompt_options", concept_received?,
 *     action?: { agent_id, variable_name?, label? },
 *     prompts: [
 *       { __kind:"video_prompt_variation", variation?, interpretation?,
 *         aspect_ratio?, clip_length?, prompt } ] }
 *
 * `action` declares WHICH agent the Generate button launches and which
 * variable name receives the selected prompt text. Content only DECLARES the
 * action — execution is platform-mediated, click-only, and runs as the
 * viewing user (the launch fails safe if they can't access the agent).
 * `aspect_ratio` / `clip_length` are advisory generation settings the
 * component maps onto `llmOverrides` (`aspect_ratio` / `duration_seconds`).
 *
 * Complete-only bridge (makeCompleteEnvelopeBridge): the component renders
 * finished variation cards with live action buttons — partial payloads never
 * reach it; the dispatch entry's loading state stands while streaming.
 */

import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

export const VIDEO_PROMPT_ASPECT_RATIOS = ["16:9", "9:16"] as const;
export const VIDEO_PROMPT_CLIP_LENGTHS = ["4s", "6s", "8s"] as const;

/** Variable the prompt is injected into when `action.variable_name` is absent. */
export const DEFAULT_VIDEO_PROMPT_VARIABLE = "video_description";

// ---------------------------------------------------------------------------
// Schemas — single source for storage rows + emitted JSON Schemas
// (kindSchemaToStorage / kindSchemaToJsonSchema), never hand-written twice.
// ---------------------------------------------------------------------------

export const videoPromptOptionsKindSchema: KindSchema = {
  kind: "video_prompt_options",
  fields: {
    concept_received: {
      type: "string",
      description: "Echo of the user's raw concept the variations interpret.",
    },
    action: {
      type: "inline_object",
      description:
        "Declares the generation agent the rendered Generate button launches. Platform-mediated, click-only.",
      fields: {
        agent_id: { type: "string", required: true },
        variable_name: {
          type: "string",
          description:
            "Agent variable that receives the selected prompt text. Default: video_description.",
        },
        label: { type: "string" },
      },
    },
    prompts: {
      type: "array",
      itemKinds: ["video_prompt_variation"],
      required: true,
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const videoPromptVariationKindSchema: KindSchema = {
  kind: "video_prompt_variation",
  fields: {
    variation: { type: "number" },
    interpretation: {
      type: "string",
      description:
        "One sentence explaining the creative angle this version resolves.",
    },
    aspect_ratio: {
      type: "enum",
      values: [...VIDEO_PROMPT_ASPECT_RATIOS],
      open: true,
    },
    clip_length: {
      type: "enum",
      values: [...VIDEO_PROMPT_CLIP_LENGTHS],
      open: true,
    },
    prompt: {
      type: "string",
      required: true,
      description: "The full, production-ready video generation prompt text.",
    },
  },
};

export const VIDEO_PROMPT_OPTIONS_KIND_SCHEMAS: KindSchema[] = [
  videoPromptOptionsKindSchema,
  videoPromptVariationKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — camelCase shape VideoPromptOptionsBlock consumes.
// ---------------------------------------------------------------------------

export interface VideoPromptActionData {
  agentId: string;
  variableName: string;
  label: string | null;
}

export interface VideoPromptVariationData {
  variation: number | null;
  interpretation: string | null;
  aspectRatio: string | null;
  clipLength: string | null;
  prompt: string;
}

export interface VideoPromptOptionsData {
  concept: string | null;
  action: VideoPromptActionData | null;
  prompts: VideoPromptVariationData[];
}

const MAPPED_SET_KEYS = new Set([
  "concept_received",
  "action",
  "prompts",
]);
const MAPPED_VARIATION_KEYS = new Set([
  "variation",
  "interpretation",
  "aspect_ratio",
  "clip_length",
  "prompt",
]);

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function mapAction(value: unknown): VideoPromptActionData | null {
  if (!isRecord(value)) return null;
  const agentId = nonEmptyString(value.agent_id);
  if (!agentId) return null;
  return {
    agentId,
    variableName:
      nonEmptyString(value.variable_name) ?? DEFAULT_VIDEO_PROMPT_VARIABLE,
    label: nonEmptyString(value.label),
  };
}

function mapVariation(
  variation: Record<string, unknown>,
): Record<string, unknown> | null {
  const prompt = nonEmptyString(variation.prompt);
  if (!prompt) return null;

  const mapped: Record<string, unknown> = {
    variation: typeof variation.variation === "number" ? variation.variation : null,
    interpretation: nonEmptyString(variation.interpretation),
    aspectRatio: nonEmptyString(variation.aspect_ratio),
    clipLength: nonEmptyString(variation.clip_length),
    prompt,
  };

  // Zero data loss: schema-unknown extras ride along untouched.
  for (const [key, value] of Object.entries(variation)) {
    if (MAPPED_VARIATION_KEYS.has(key) || key in mapped) continue;
    mapped[key] = value;
  }
  return mapped;
}

export const videoPromptOptionsServerDataFromEnvelope =
  makeCompleteEnvelopeBridge("video_prompt_options", (value) => {
    if (!Array.isArray(value.prompts)) return undefined;

    const prompts: Record<string, unknown>[] = [];
    for (const entry of value.prompts) {
      if (!isRecord(entry)) continue;
      const mapped = mapVariation(entry);
      if (mapped) prompts.push(mapped);
    }
    if (prompts.length === 0) return undefined;

    const serverData: Record<string, unknown> = {
      concept: nonEmptyString(value.concept_received),
      action: mapAction(value.action),
      prompts,
    };

    for (const [key, extra] of Object.entries(value)) {
      if (MAPPED_SET_KEYS.has(key) || key in serverData) continue;
      serverData[key] = extra;
    }

    return serverData;
  });

// ---------------------------------------------------------------------------
// toMarkdown facet — one section per variation; the action declaration and
// unknown keys never silently vanish.
// ---------------------------------------------------------------------------

const MD_SET_KNOWN_KEYS = ["concept_received", "action", "prompts"];
const MD_VARIATION_KNOWN_KEYS = [
  "variation",
  "interpretation",
  "aspect_ratio",
  "clip_length",
  "prompt",
];

function variationMarkdown(
  variation: Record<string, unknown>,
  index: number,
): string {
  const number =
    typeof variation.variation === "number" ? variation.variation : index + 1;
  const specs = [
    nonEmptyString(variation.aspect_ratio),
    nonEmptyString(variation.clip_length),
  ].filter(Boolean);

  const blocks: Array<string | null> = [
    `## Variation ${number}${specs.length > 0 ? ` (${specs.join(", ")})` : ""}`,
    nonEmptyString(variation.interpretation),
    nonEmptyString(variation.prompt),
  ];

  const extras = collectExtras(variation, MD_VARIATION_KNOWN_KEYS);
  const extrasBlock = additionalDetailsSection(extras);
  if (extrasBlock) blocks.push(extrasBlock);

  return joinBlocks(blocks);
}

export function videoPromptOptionsMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const prompts = Array.isArray(value.prompts)
    ? value.prompts.filter(isRecordValue)
    : [];
  const action = mapAction(value.action);

  return joinBlocks([
    `# Video Prompt Options`,
    nonEmptyString(value.concept_received)
      ? `Concept: ${nonEmptyString(value.concept_received)}`
      : null,
    ...prompts.map(variationMarkdown),
    action ? `Generation agent: ${action.agentId} (${action.variableName})` : null,
    additionalDetailsSection(collectExtras(value, MD_SET_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const VIDEO_PROMPT_OPTIONS_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "video_prompt_options",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "video_prompt_options",
    toLegacyServerData: videoPromptOptionsServerDataFromEnvelope,
    toMarkdown: videoPromptOptionsMarkdownFromValue,
    persistence: { persistStructured: true },
    schema: videoPromptOptionsKindSchema,
  },
  {
    kind: "video_prompt_variation",
    schemaSource: "system",
    tier: "eager",
    schema: videoPromptVariationKindSchema,
  },
];
