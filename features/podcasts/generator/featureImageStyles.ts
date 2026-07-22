// features/podcasts/generator/featureImageStyles.ts
//
// The visual-style choices for the podcast FEATURE IMAGE — a sixth image
// rendered from the episode's full transcript (the other five come from the
// metadata agent's short descriptions, written before a script exists).
//
// Two-step chain, server-side: the transcript + the chosen style go to the
// "GPT Image Prompt Generator" agent, whose detailed prompt is then rendered by
// "Matrx Image Ultra" (gpt-image-2).
//
// ── CONTRACT ────────────────────────────────────────────────────────────────
// `value` is the WIRE TOKEN sent as `feature_image_style`. These tokens MUST
// stay identical to aidream's `FeatureImageStyle` StrEnum in
// packages/matrx-ai/matrx_ai/agent_runners/podcast_generator.py — that enum owns
// the actual prose handed to the prompt agent, so a token is the only thing
// crossing the wire. An unknown token degrades to the default server-side
// (resolve_feature_image_style) rather than failing a run, so a drift here
// silently downgrades instead of breaking — keep them in sync deliberately.

export type FeatureImageStyleValue =
  | "infographic"
  | "concept_map"
  | "timeline"
  | "quote_card"
  | "editorial_illustration"
  | "cinematic_scene"
  | "diagram"
  | "comic_panels"
  | "minimal_abstract"
  | "isometric_3d"
  | "auto";

export interface FeatureImageStyleOption {
  value: FeatureImageStyleValue;
  label: string;
  /** One-line explanation shown under the label in the picker. */
  blurb: string;
}

export const DEFAULT_FEATURE_IMAGE_STYLE: FeatureImageStyleValue = "infographic";

export const FEATURE_IMAGE_STYLES: readonly FeatureImageStyleOption[] = [
  {
    value: "infographic",
    label: "Infographic",
    blurb: "Key facts and numbers laid out with clear visual hierarchy.",
  },
  {
    value: "concept_map",
    label: "Concept map",
    blurb: "Main ideas as labeled nodes, with the relationships drawn in.",
  },
  {
    value: "timeline",
    label: "Timeline",
    blurb: "Events or steps along a chronological spine.",
  },
  {
    value: "quote_card",
    label: "Quote card",
    blurb: "Built around the episode's most striking line.",
  },
  {
    value: "editorial_illustration",
    label: "Editorial illustration",
    blurb: "A magazine-style metaphor for the central argument.",
  },
  {
    value: "cinematic_scene",
    label: "Cinematic scene",
    blurb: "Photoreal, dramatically lit depiction of the subject.",
  },
  {
    value: "diagram",
    label: "Diagram",
    blurb: "An explainer schematic of how the thing actually works.",
  },
  {
    value: "comic_panels",
    label: "Comic panels",
    blurb: "The through-line told as a short sequential strip.",
  },
  {
    value: "minimal_abstract",
    label: "Minimal abstract",
    blurb: "Album-cover restraint — shape, color, and negative space.",
  },
  {
    value: "isometric_3d",
    label: "Isometric 3D",
    blurb: "The subject as a small, detailed three-dimensional world.",
  },
  {
    value: "auto",
    label: "Let the agent decide",
    blurb: "Reads the transcript and picks the style that fits it best.",
  },
] as const;

/** Narrow an arbitrary string to a known style, else the default. */
export function toFeatureImageStyle(
  value: string | null | undefined,
): FeatureImageStyleValue {
  const match = FEATURE_IMAGE_STYLES.find((s) => s.value === value);
  return match ? match.value : DEFAULT_FEATURE_IMAGE_STYLE;
}
