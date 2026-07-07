/**
 * presentation_deck / presentation_slide — the widened schema (extra + preset),
 * emitted-schema regeneration, and the Slideshow bridge.
 *
 * Guards the fix for the STALE emitted_block_schema: the schema omitted `extra`
 * (a slide field the SlideView renderer reads: eyebrow / image / imagePrompt)
 * and the deck theme omitted `preset` (Slideshow / presets.ts read
 * `theme.preset` to choose one of the ten curated templates). Under strict
 * `additionalProperties:false`, an undeclared field makes a rich deck FAIL the
 * dual gate. All fields here are engineered from COMPONENT REALITY.
 *
 * Three legs, per the Shape System activation law:
 *   (a) the REAL converter (kindSchemaToJsonSchema, strict) over the widened
 *       schema consts materializes an emitted_json_schema that DECLARES `extra`
 *       (slide) and `preset` (deck theme + the embedded slide $def);
 *   (b) the canonical RICH deck example — mirrored byte-for-byte from the
 *       applied content_ir.kind_example row (migrations/kind_presentation_slide_widen.sql)
 *       — clears BOTH gate legs (structural ajv + render bridge) → isActive;
 *   (c) the legacy bridge (presentationServerDataFromEnvelope) derives the exact
 *       PresentationData the Slideshow component consumes: { slides, theme } with
 *       `theme.preset` and each slide's `extra` preserved through the __kind strip.
 */

import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
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
  PRESENTATION_KIND_SCHEMAS,
  PRESENTATION_PRESET_KEYS,
  presentationDeckKindSchema,
  presentationSlideKindSchema,
  presentationServerDataFromEnvelope,
} from "../kinds/presentation-deck";

const resolve = (kind: string): KindSchema | undefined =>
  PRESENTATION_KIND_SCHEMAS.find((schema) => schema.kind === kind);

/** The exact emitted_json_schema the migration materialized (strict, no __kind). */
function emittedJson(kind: string) {
  const out = kindSchemaToJsonSchema(kind, resolve, {
    strict: true,
    injectKind: false,
  });
  if (!out) throw new Error(`converter declined ${kind}`);
  return out.schema as Record<string, unknown>;
}

const SLIDE_JSON = emittedJson("presentation_slide");
const DECK_JSON = emittedJson("presentation_deck");

// ---------------------------------------------------------------------------
// Byte-for-byte mirror of the applied kind_example row (the canonical rich
// deck). Exercises theme.preset (enum) + slide.extra (string map).
// ---------------------------------------------------------------------------
const RICH_DECK: Record<string, unknown> = {
  __kind: "presentation_deck",
  title: "Q4 Business Review",
  slides: [
    {
      __kind: "presentation_slide",
      type: "title",
      layout: "title",
      title: "Q4 Business Review",
      subtitle: "Performance, wins, and the road into next year",
      extra: { eyebrow: "FY2026" },
    },
    {
      __kind: "presentation_slide",
      layout: "bullets",
      title: "Where we landed",
      bullets: [
        "Revenue up 32% year over year",
        "Net retention held at 118%",
        "Two new enterprise segments opened",
      ],
      extra: { eyebrow: "Overview" },
    },
    {
      __kind: "presentation_slide",
      layout: "image-split",
      title: "Product momentum",
      description: "Shipping faster with a smaller, sharper team.",
      bullets: ["47 releases", "P95 latency down 40%"],
      extra: { imagePrompt: "modern software team collaborating in a bright office" },
    },
    {
      __kind: "presentation_slide",
      layout: "quote",
      quote: "The best quarter we have ever had — and the setup for an even better one.",
      author: "Head of Revenue",
    },
    {
      __kind: "presentation_slide",
      type: "closing",
      layout: "closing",
      title: "Thank you",
      subtitle: "Questions?",
    },
  ],
  theme: { preset: "editorial", variant: "fancy" },
};

describe("presentation schema — widened for extra + preset", () => {
  it("declares `extra` (free-form string map) + `imageUrl` on the slide", () => {
    const props = SLIDE_JSON.properties as Record<string, unknown>;
    expect(props.extra).toEqual({
      type: "object",
      additionalProperties: { type: "string" },
    });
    expect(props.imageUrl).toEqual({ type: "string" });
    // additionalProperties:false must NOT reject a slide that carries `extra`.
    expect(SLIDE_JSON.additionalProperties).toBe(false);
  });

  it("declares `preset` (enum of the ten real templates) on the deck theme", () => {
    const theme = (DECK_JSON.properties as Record<string, Record<string, unknown>>)
      .theme;
    const preset = (theme.properties as Record<string, unknown>).preset as {
      type: string;
      enum: string[];
    };
    expect(preset.type).toBe("string");
    expect(preset.enum).toEqual([...PRESENTATION_PRESET_KEYS]);
  });

  it("embeds the WIDENED slide (with extra) in the deck's $defs", () => {
    const defs = DECK_JSON.$defs as Record<string, Record<string, unknown>>;
    const slideProps = defs.presentation_slide.properties as Record<string, unknown>;
    expect(slideProps.extra).toEqual({
      type: "object",
      additionalProperties: { type: "string" },
    });
    expect(slideProps.imageUrl).toEqual({ type: "string" });
  });

  it("accepts a rich standalone slide (extra + imageUrl) structurally", () => {
    const richSlide = {
      __kind: "presentation_slide",
      layout: "stat",
      title: "Momentum",
      imageUrl: "https://cdn.example.com/hero.jpg",
      extra: { eyebrow: "Highlights", imagePrompt: "abstract growth chart" },
    };
    const leg = validateStructuralLeg(richSlide, SLIDE_JSON);
    expect(leg.ok).toBe(true);
  });

  it("rejects a non-string `extra` value (the string-map contract)", () => {
    const badSlide = {
      __kind: "presentation_slide",
      title: "Bad",
      extra: { count: 3 },
    };
    expect(validateStructuralLeg(badSlide, SLIDE_JSON).ok).toBe(false);
  });

  it("round-trips the widened schemas through storage (record + enum survive)", () => {
    for (const schema of [presentationSlideKindSchema, presentationDeckKindSchema]) {
      const restored = storageToKindSchema(schema.kind, kindSchemaToStorage(schema));
      expect(restored).toEqual(schema);
    }
  });
});

describe("presentation_deck — canonical rich example clears the dual gate", () => {
  const gate = runKindDualGate({
    kind: "presentation_deck",
    sample: RICH_DECK,
    emittedJsonSchema: DECK_JSON,
    definition: {
      legacyBlockType: "presentation",
      toLegacyServerData: presentationServerDataFromEnvelope,
    },
  });

  it("passes the structural leg against the emitted schema", () => {
    expect(gate.structural.ok).toBe(true);
  });

  it("passes the render leg (bridge produces serverData) → isActive", () => {
    expect(gate.render.ok).toBe(true);
    expect(gate.isActive).toBe(true);
  });
});

describe("presentation bridge — feeds Slideshow the PresentationData shape", () => {
  const serverData = presentationServerDataFromEnvelope(
    envelopeFromCompleteValue(RICH_DECK, "presentation_deck"),
  );

  it("returns { slides, theme } with theme.preset preserved", () => {
    expect(serverData).toBeDefined();
    const data = serverData as Record<string, unknown>;
    expect(Array.isArray(data.slides)).toBe(true);
    expect((data.slides as unknown[]).length).toBe(5);
    expect(data.theme).toEqual({ preset: "editorial", variant: "fancy" });
  });

  it("preserves each slide's `extra` through the __kind strip", () => {
    const slides = (serverData as { slides: Array<Record<string, unknown>> }).slides;
    // __kind is stripped for the legacy component; the domain fields survive.
    expect(slides[0].__kind).toBeUndefined();
    expect(slides[0].extra).toEqual({ eyebrow: "FY2026" });
    expect(slides[2].extra).toEqual({
      imagePrompt: "modern software team collaborating in a bright office",
    });
  });
});
