/**
 * presentation_deck kind → Slideshow bridge.
 *
 * Successor to the legacy `{ presentation: { slides, theme } }` root-key
 * detection. The kind's authored shape is FLAT:
 *
 *   { __kind:"presentation_deck", title?, slides: [
 *       { __kind:"presentation_slide", type?, title?, subtitle?, bullets?,
 *         ... } ], theme? }
 *
 * PresentationArtifact already tolerates the flattened shape — it reads
 * `payload.presentation?.slides ?? payload.slides ?? payload` — so the
 * bridge just hands over the reconstructed zero-loss value (extras like
 * `imageUrl` aliases ride the residue merge) once `slides` proves to be a
 * non-empty array.
 */

import type { KindSchema } from "../core/kind-schema.types";
import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  joinBlocks,
  isRecordValue,
} from "./kind-markdown-utils";

// ---------------------------------------------------------------------------
// Schemas — the ONE source of truth for the presentation_deck / _slide field
// shapes. `system-kinds.ts` references these consts by import (rather than
// re-declaring them inline), so the compiled pre-warm floor and the migrated
// content_ir rows are generated from the SAME field maps — no drift.
//
// Every field below is engineered from COMPONENT REALITY (the real renderer),
// never guessed:
//   - Slideshow.tsx / SlideView.tsx read a slide's `SlideData`: type, layout,
//     title, subtitle, description, bullets, quote, author, image_url,
//     `imageUrl` (camelCase alias, SlideView L43/L91), notes, and the free-form
//     `extra` dict (SlideView reads extra.eyebrow / extra.image /
//     extra.imagePrompt / extra.image_prompt as strings, and extra.stats /
//     extra.columns as arrays for the stat / two-column layouts).
//   - The deck's `theme.preset` (Slideshow L59, presets.ts `resolveDeckTheme`)
//     names a curated template — one of the ten SLIDE_PRESETS keys. It lives on
//     the DECK theme, NOT on a slide.
//
// `extra` is typed as a free-form STRING map (`record` of string). The
// FieldSchema union has no "object with arbitrary/heterogeneous values" variant,
// so the string-valued extras the component consumes most (eyebrow, image,
// imagePrompt) validate, while richer array-valued extras (stats/columns) await
// a future `json`/`any` FieldSchema primitive. This is a strict improvement over
// the prior schema, which declared no `extra` at all — so `additionalProperties:
// false` rejected EVERY slide carrying one.
// ---------------------------------------------------------------------------

/** The ten curated deck templates (presets.ts SLIDE_PRESETS / PRESET_LIST). */
export const PRESENTATION_PRESET_KEYS = [
  "classic",
  "corporate",
  "editorial",
  "bold",
  "minimal",
  "midnight",
  "ocean",
  "sunset",
  "forest",
  "mono",
] as const;

export const presentationSlideKindSchema: KindSchema = {
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
    imageUrl: { type: "string" },
    notes: { type: "string" },
    // Free-form escape hatch — SlideView reads eyebrow / image / imagePrompt /
    // image_prompt from here. Typed as a string map (see module note).
    extra: { type: "record", values: "string" },
  },
};

export const presentationDeckKindSchema: KindSchema = {
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
        // Curated template selector — one of the ten preset keys.
        preset: { type: "enum", values: [...PRESENTATION_PRESET_KEYS] },
      },
    },
    additionalDetails: { type: "inline_object", fields: {} },
  },
};

/** Resolver set for the converters + dual gate (root + referenced child). */
export const PRESENTATION_KIND_SCHEMAS: KindSchema[] = [
  presentationDeckKindSchema,
  presentationSlideKindSchema,
];

export const presentationServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "presentation_deck",
  (value) => {
    if (!Array.isArray(value.slides) || value.slides.length === 0) {
      return undefined;
    }
    return value;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — presentation_deck → one section per slide.
//
// Slide title becomes the section heading, subtitle renders italic, bullets
// stay a list, quotes become blockquotes with attribution, speaker notes are
// labeled. Theme + set-level unknown keys go under "Additional details";
// slide-level unknown keys ride an inline key: value list.
// ---------------------------------------------------------------------------

const MD_SLIDE_KNOWN_KEYS = [
  "type",
  "layout",
  "title",
  "subtitle",
  "description",
  "bullets",
  "quote",
  "author",
  "image_url",
  "notes",
];

const MD_DECK_KNOWN_KEYS = ["title", "slides"];

function slideMarkdown(slide: Record<string, unknown>, index: number): string {
  const heading =
    typeof slide.title === "string" && slide.title !== ""
      ? `## Slide ${index + 1}: ${slide.title}`
      : `## Slide ${index + 1}`;
  const blocks: Array<string | null> = [heading];

  if (typeof slide.subtitle === "string" && slide.subtitle !== "") {
    blocks.push(`*${slide.subtitle}*`);
  }
  if (typeof slide.description === "string" && slide.description !== "") {
    blocks.push(slide.description);
  }

  const bullets = Array.isArray(slide.bullets)
    ? slide.bullets.filter(
        (bullet): bullet is string => typeof bullet === "string",
      )
    : [];
  if (bullets.length > 0) {
    blocks.push(bullets.map((bullet) => `- ${bullet}`).join("\n"));
  }

  if (typeof slide.quote === "string" && slide.quote !== "") {
    const attribution =
      typeof slide.author === "string" && slide.author !== ""
        ? `\n> — ${slide.author}`
        : "";
    blocks.push(`> ${slide.quote}${attribution}`);
  }
  if (typeof slide.image_url === "string" && slide.image_url !== "") {
    blocks.push(`![Slide image](${slide.image_url})`);
  }
  if (typeof slide.notes === "string" && slide.notes !== "") {
    blocks.push(`**Notes:** ${slide.notes}`);
  }

  const extras = extrasList(collectExtras(slide, MD_SLIDE_KNOWN_KEYS));
  if (extras) blocks.push(extras);

  return joinBlocks(blocks);
}

export function presentationMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== ""
      ? value.title
      : "Presentation";
  const slides = Array.isArray(value.slides)
    ? value.slides.filter(isRecordValue)
    : [];

  return joinBlocks([
    `# ${title}`,
    ...slides.map(slideMarkdown),
    // `theme` intentionally lands here — presentation styling is metadata,
    // not content, but it must not silently vanish.
    additionalDetailsSection(collectExtras(value, MD_DECK_KNOWN_KEYS)),
  ]);
}
