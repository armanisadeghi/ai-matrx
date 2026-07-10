// features/ai-models/capabilities/feature-map.ts
//
// Groups the raw `capabilities.features` keys into a SMALL set of user-facing
// buckets so the picker shows the few that matter and never buries the rest.
//
// Rules (per product direction, 2026-07-09):
//   - The important buckets are visible as chips (schema/tools/search/…).
//   - Anything unmapped lands in "other" — surfaced, NEVER hidden.
//   - The `IGNORED` keys are represented by the INPUT/OUTPUT modality columns
//     (vision → image input, image_generation → image output, …) or are truly
//     niche; they are not shown as their own chip, but the detail card still
//     lists the complete raw feature set so nothing is ever invisible.
//
// This is a code-side stopgap. The real home for this mapping is the DB; keep
// it here only until that exists.

export type FeatureBucket =
  | "schema"
  | "tools"
  | "search"
  | "x_search"
  | "thinking"
  | "extraction"
  | "other";

export interface FeatureBucketMeta {
  label: string;
  description: string;
}

/** Display order for the buckets (most broadly useful first). */
export const FEATURE_BUCKET_ORDER: FeatureBucket[] = [
  "thinking",
  "tools",
  "schema",
  "search",
  "extraction",
  "x_search",
  "other",
];

export const FEATURE_BUCKETS: Record<FeatureBucket, FeatureBucketMeta> = {
  schema: { label: "Schema", description: "Structured & JSON output" },
  tools: { label: "Tools", description: "Function & tool calling" },
  search: { label: "Search", description: "Web search" },
  x_search: { label: "X Search", description: "X (Twitter) platform search" },
  thinking: { label: "Thinking", description: "Reasoning & extended thinking" },
  extraction: {
    label: "Extraction",
    description: "NER, classification & entity extraction",
  },
  other: { label: "Other", description: "Uncategorized or niche features" },
};

/** Raw feature key → bucket. Unmapped, non-ignored keys fall through to "other". */
const FEATURE_TO_BUCKET: Record<string, FeatureBucket> = {
  json_mode: "schema",
  structured_output: "schema",
  function_calling: "tools",
  tool_calling: "tools",
  web_search: "search",
  x_search: "x_search",
  thinking: "thinking",
  reasoning: "thinking",
  ner: "extraction",
  structured_extraction: "extraction",
  relation_extraction: "extraction",
  classification: "extraction",
  pii_detection: "extraction",
  computer_use: "other",
  conversational_editing: "other",
  image_editing: "other",
  image_to_video: "other",
  multi_turn: "other",
  stateful_editing: "other",
  video_editing: "other",
};

/** Represented by modality columns or truly niche — no dedicated chip. */
const IGNORED_FEATURES = new Set([
  "code_execution",
  "prompt_caching",
  "vision",
  "video_generation",
  "image_generation",
  "audio_generation",
]);

export interface GroupedFeatures {
  /** Buckets present on this model, in display order. */
  buckets: FeatureBucket[];
  /** All raw keys that mapped into each bucket (for the detail card). */
  byBucket: Partial<Record<FeatureBucket, string[]>>;
  /** Every raw feature key on the model, unfiltered — nothing hidden. */
  raw: string[];
}

/** Group a model's raw feature keys into the user-facing buckets. */
export function groupFeatures(features: string[]): GroupedFeatures {
  const byBucket: Partial<Record<FeatureBucket, string[]>> = {};
  for (const key of features) {
    if (IGNORED_FEATURES.has(key)) continue;
    const bucket = FEATURE_TO_BUCKET[key] ?? "other";
    (byBucket[bucket] ??= []).push(key);
  }
  const buckets = FEATURE_BUCKET_ORDER.filter((b) => byBucket[b]?.length);
  return { buckets, byBucket, raw: features };
}
