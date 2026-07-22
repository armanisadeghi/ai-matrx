/**
 * video_prompt_options kind — schema, examples, bridge, and the action
 * contract (the first ACTION-CARRYING kind).
 *
 * Legs, per the Shape System activation law:
 *   (a) both kind_example payloads (mirrored byte-for-byte from the applied
 *       content_ir.kind_example rows in kind_video_prompt_options_full.sql)
 *       pass the REAL structural gate against the emitted_json_schema
 *       produced by the REAL converter, and the recomputed fingerprints match
 *       the constants the migration stored;
 *   (b) the legacy bridge derives the exact camelCase serverData
 *       VideoPromptOptionsBlock consumes — including the `action` declaration
 *       KindAgentActionButton executes (agentId / variableName / label) and
 *       the variable-name default;
 *   (c) complete-only law + decline rules (no prompts → undefined).
 */

import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import { fingerprintText } from "../core/fingerprint";
import { envelopeFromCompleteValue } from "../core/normalize";
import type { KindSchema } from "../core/kind-schema.types";
import {
  runKindDualGate,
  validateStructuralLeg,
} from "../registry/kind-dual-gate";
import {
  kindSchemaToStorage,
  storageToKindSchema,
} from "../registry/kind-storage-transform";
import {
  DEFAULT_VIDEO_PROMPT_VARIABLE,
  VIDEO_PROMPT_OPTIONS_KIND_DEFINITIONS,
  VIDEO_PROMPT_OPTIONS_KIND_SCHEMAS,
  videoPromptOptionsKindSchema,
  videoPromptVariationKindSchema,
  videoPromptOptionsMarkdownFromValue,
  videoPromptOptionsServerDataFromEnvelope,
} from "../kinds/video-prompt-options";

const resolve = (kind: string): KindSchema | undefined =>
  VIDEO_PROMPT_OPTIONS_KIND_SCHEMAS.find((schema) => schema.kind === kind);

const emitted = kindSchemaToJsonSchema("video_prompt_options", resolve, {
  strict: true,
  injectKind: false,
});
if (!emitted) throw new Error("converter declined the video_prompt_options kind");
const EMITTED_JSON_SCHEMA = emitted.schema;

// ---------------------------------------------------------------------------
// Fixtures — byte-for-byte mirrors of the applied kind_example rows
// (migrations/kind_video_prompt_options_full.sql).
// ---------------------------------------------------------------------------

const CANONICAL_EXAMPLE: Record<string, unknown> = {
  __kind: "video_prompt_options",
  concept_received:
    "A short cover video for a science podcast episode about cell division.",
  action: {
    agent_id: "04b7c631-d675-4dca-8b52-0e3371aa87d3",
    variable_name: "video_description",
    label: "Generate video",
  },
  prompts: [
    {
      __kind: "video_prompt_variation",
      variation: 1,
      interpretation:
        "Literal scientific macro view emphasizing accuracy and awe.",
      aspect_ratio: "16:9",
      clip_length: "8s",
      prompt:
        "Extreme macro cinematography of a living cell dividing: the nucleus stretches, chromosomes glowing faint blue align along the center, then pull apart toward opposite poles as the membrane pinches into two daughter cells. Soft volumetric light through cytoplasm, shallow depth of field, documentary microscopy realism, slow graceful motion, 8 seconds.",
    },
    {
      __kind: "video_prompt_variation",
      variation: 2,
      interpretation:
        "Stylized abstract interpretation for a bold podcast-cover look.",
      aspect_ratio: "9:16",
      clip_length: "6s",
      prompt:
        "Abstract luminous orb of liquid glass splitting into two mirrored orbs, ribbons of light arcing between them like chromosomes, deep navy background with teal and magenta glow, elegant slow-motion split, minimal composition with centered symmetry, premium motion-design aesthetic, 6 seconds.",
    },
    {
      __kind: "video_prompt_variation",
      variation: 3,
      interpretation:
        "Narrative time-lapse framing life emerging from a single cell.",
      aspect_ratio: "16:9",
      clip_length: "8s",
      prompt:
        "Time-lapse journey beginning with a single glowing cell that divides again and again, the field of view pulling back as divisions accelerate into a shimmering cluster of thousands of cells forming a heart shape, warm golden light rising, hopeful cinematic score mood, photoreal with a dreamlike bloom, 8 seconds.",
    },
  ],
};

const SIMPLE_EXAMPLE: Record<string, unknown> = {
  __kind: "video_prompt_options",
  concept_received: "A calm ocean sunrise loop.",
  prompts: [
    {
      __kind: "video_prompt_variation",
      variation: 1,
      interpretation: "Single static wide shot, meditative pacing.",
      aspect_ratio: "16:9",
      clip_length: "4s",
      prompt:
        "Static wide shot of a calm ocean at sunrise, gentle waves rolling toward the camera, warm orange sky with thin clouds, photorealistic, seamless loop, 4 seconds.",
    },
  ],
};

// ---------------------------------------------------------------------------
// (a) Structural gate + migration parity
// ---------------------------------------------------------------------------

describe("video_prompt_options kind — structural gate (the applied kind_example rows)", () => {
  it("the canonical example passes validateStructuralLeg", () => {
    expect(
      validateStructuralLeg(CANONICAL_EXAMPLE, EMITTED_JSON_SCHEMA),
    ).toEqual({ ok: true });
  });

  it("the simple (no-action) example passes validateStructuralLeg", () => {
    expect(validateStructuralLeg(SIMPLE_EXAMPLE, EMITTED_JSON_SCHEMA)).toEqual({
      ok: true,
    });
  });

  it("the FULL dual gate (structural + render) passes on the canonical example", () => {
    const [rootDefinition] = VIDEO_PROMPT_OPTIONS_KIND_DEFINITIONS;
    const result = runKindDualGate({
      kind: "video_prompt_options",
      sample: CANONICAL_EXAMPLE,
      emittedJsonSchema: EMITTED_JSON_SCHEMA,
      definition: rootDefinition,
    });
    expect(result.structural).toEqual({ ok: true });
    expect(result.render).toEqual({ ok: true });
    expect(result.isActive).toBe(true);
  });

  it("recomputed fingerprints match the constants applied by kind_video_prompt_options_full.sql", () => {
    const rootBlock = kindSchemaToJsonSchema("video_prompt_options", resolve, {
      strict: true,
      injectKind: true,
    })?.schema;
    const variationBlock = kindSchemaToJsonSchema(
      "video_prompt_variation",
      resolve,
      { strict: true, injectKind: true },
    )?.schema;
    expect(fingerprintText(JSON.stringify(rootBlock))).toBe(
      "176-1ut7b47c3g3bl",
    );
    expect(fingerprintText(JSON.stringify(variationBlock))).toBe(
      "hg-1g78p54v7kyha",
    );
  });

  it("storage rows round-trip losslessly (data[] ⇄ KindSchema)", () => {
    for (const schema of [
      videoPromptOptionsKindSchema,
      videoPromptVariationKindSchema,
    ]) {
      expect(
        storageToKindSchema(schema.kind, kindSchemaToStorage(schema)),
      ).toEqual(schema);
    }
  });
});

// ---------------------------------------------------------------------------
// (b) The bridge derives serverData the component + action button consume
// ---------------------------------------------------------------------------

describe("video_prompt_options kind — legacy bridge (toLegacyServerData)", () => {
  it("canonical example → camelCase serverData with the action declaration", () => {
    const serverData = videoPromptOptionsServerDataFromEnvelope(
      envelopeFromCompleteValue(CANONICAL_EXAMPLE, "video_prompt_options"),
    );
    expect(serverData).toBeDefined();
    if (!serverData) throw new Error("unreachable");

    expect(serverData.concept).toBe(
      "A short cover video for a science podcast episode about cell division.",
    );
    // The action contract KindAgentActionButton executes.
    expect(serverData.action).toEqual({
      agentId: "04b7c631-d675-4dca-8b52-0e3371aa87d3",
      variableName: "video_description",
      label: "Generate video",
    });

    const prompts = serverData.prompts as Array<Record<string, unknown>>;
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toMatchObject({
      variation: 1,
      aspectRatio: "16:9",
      clipLength: "8s",
    });
    expect(typeof prompts[0].prompt).toBe("string");
    expect((prompts[0].prompt as string).length).toBeGreaterThan(0);
  });

  it("no-action example → action null, cards render display-only", () => {
    const serverData = videoPromptOptionsServerDataFromEnvelope(
      envelopeFromCompleteValue(SIMPLE_EXAMPLE, "video_prompt_options"),
    );
    expect(serverData).toBeDefined();
    expect(serverData?.action).toBeNull();
    expect(serverData?.prompts).toHaveLength(1);
  });

  it("action without variable_name defaults to video_description", () => {
    const serverData = videoPromptOptionsServerDataFromEnvelope(
      envelopeFromCompleteValue(
        {
          ...SIMPLE_EXAMPLE,
          action: { agent_id: "04b7c631-d675-4dca-8b52-0e3371aa87d3" },
        },
        "video_prompt_options",
      ),
    );
    expect(
      (serverData?.action as Record<string, unknown> | null)?.variableName,
    ).toBe(DEFAULT_VIDEO_PROMPT_VARIABLE);
  });

  it("complete-only law: a streaming envelope is declined", () => {
    const complete = envelopeFromCompleteValue(
      CANONICAL_EXAMPLE,
      "video_prompt_options",
    );
    const streaming = {
      ...complete,
      root: { ...complete.root, status: "streaming" as const },
    };
    expect(videoPromptOptionsServerDataFromEnvelope(streaming)).toBeUndefined();
  });

  it("declines payloads the component cannot render (no usable prompts)", () => {
    const empty = envelopeFromCompleteValue(
      { __kind: "video_prompt_options", prompts: [] },
      "video_prompt_options",
    );
    expect(videoPromptOptionsServerDataFromEnvelope(empty)).toBeUndefined();

    const promptless = envelopeFromCompleteValue(
      {
        __kind: "video_prompt_options",
        prompts: [{ __kind: "video_prompt_variation", variation: 1 }],
      },
      "video_prompt_options",
    );
    expect(
      videoPromptOptionsServerDataFromEnvelope(promptless),
    ).toBeUndefined();
  });

  it("toMarkdown renders variation sections, never a JSON dump", () => {
    const markdown = videoPromptOptionsMarkdownFromValue(CANONICAL_EXAMPLE);
    expect(markdown).toContain("# Video Prompt Options");
    expect(markdown).toContain("## Variation 1 (16:9, 8s)");
    expect(markdown).toContain(
      "Generation agent: 04b7c631-d675-4dca-8b52-0e3371aa87d3 (video_description)",
    );
    expect(markdown).not.toContain("__kind");
  });
});
