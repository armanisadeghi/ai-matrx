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

import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  joinBlocks,
  isRecordValue,
} from "./kind-markdown-utils";

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
