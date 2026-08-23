/**
 * `generated_video_set` (+ child `generated_video`) — the output of every
 * video node in the platform (`ai.generate_video`, `ai.edit_video`,
 * `ai.extend_video`).
 *
 * PYTHON-OWNED: the seeded schema is `GenerateVideoOutput.model_json_schema()`
 * (`aidream/packages/matrx-ai/matrx_ai/graph_nodes/video_action.py`); the
 * `KindSchema` below mirrors that model.
 *
 * MEDIA DURABILITY. `GeneratedVideo` carries `file_id` — the durable handle —
 * beside `url` / `cdn_url` / `signed_url`. The bridge prefers the id and falls
 * back CDN → url → signed, so a clip renders through the most durable
 * reference the producer gave it and an expiring URL re-mints instead of
 * breaking.
 */

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import {
  formatCost,
  formatDuration,
  mediaHandleOf,
  optionalNumber,
  optionalString,
  readMediaHandleFields,
  readUsage,
  stringOrEmpty,
  type MediaHandleFields,
  type MediaUsage,
} from "./media-io-shared";
import { KIND_KEY } from "@ai-matrx/content-ir";

// ---------------------------------------------------------------------------
// Schemas — mirror of GeneratedVideo / GenerateVideoOutput.
// ---------------------------------------------------------------------------

export const generatedVideoKindSchema: KindSchema = {
  kind: "generated_video",
  fields: {
    // Declared ahead of the producer (see the header) — an optional field that
    // never arrives is simply absent; one that arrives parses natively.
    file_id: {
      type: "string",
      nullable: true,
      description:
        "cld_files id of the generated video — the durable handle. Pass this between nodes and re-mint any URL from it; never store a signed URL.",
    },
    url: { type: "string", nullable: true },
    cdn_url: { type: "string", nullable: true },
    signed_url: { type: "string", nullable: true },
    path: { type: "string", nullable: true },
    mime_type: { type: "string", nullable: true },
    duration_seconds: { type: "number", nullable: true },
  },
};

export const generatedVideoSetKindSchema: KindSchema = {
  kind: "generated_video_set",
  fields: {
    videos: { type: "array", itemKinds: ["generated_video"] },
    count: { type: "number" },
    model: { type: "string", required: true },
    usage: { type: "json", description: "Aggregated token / cost usage for the run." },
  },
};

export const GENERATED_VIDEO_SET_KIND_SCHEMAS: KindSchema[] = [
  generatedVideoSetKindSchema,
  generatedVideoKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING.
// ---------------------------------------------------------------------------

export interface GeneratedVideoData extends MediaHandleFields {
  handle: string | null;
  duration_seconds: number | null;
}

export interface GeneratedVideoSetData {
  videos: GeneratedVideoData[];
  count: number | null;
  model: string;
  usage: MediaUsage | null;
  isComplete: boolean;
}

export function readGeneratedVideo(entry: unknown): GeneratedVideoData | null {
  if (!isRecord(entry)) return null;
  const fields = readMediaHandleFields(entry);
  const handle = mediaHandleOf(fields);
  if (!handle) return null;
  return { ...fields, handle, duration_seconds: optionalNumber(entry.duration_seconds) };
}

export function readGeneratedVideoList(value: unknown): GeneratedVideoData[] {
  if (!Array.isArray(value)) return [];
  const out: GeneratedVideoData[] = [];
  for (const entry of value) {
    const video = readGeneratedVideo(entry);
    if (video) out.push(video);
  }
  return out;
}

export function generatedVideoSetServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (GeneratedVideoSetData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "generated_video_set") return undefined;
  const value = envelope.root.value;
  return {
    videos: readGeneratedVideoList(value.videos),
    count: optionalNumber(value.count),
    model: stringOrEmpty(value.model),
    usage: readUsage(value.usage),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = ["videos", "count", "model", "usage", KIND_KEY];

export function generatedVideoSetMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const videos = readGeneratedVideoList(value.videos);
  const model = optionalString(value.model);
  const cost = formatCost(readUsage(value.usage)?.cost_usd ?? null);

  const lines =
    videos.length > 0
      ? videos
          .map((video, index) => {
            const duration = formatDuration(video.duration_seconds);
            const label = `Clip ${index + 1}${duration ? ` (${duration})` : ""}`;
            const target = video.cdn_url ?? video.url ?? video.signed_url;
            return target ? `- [${label}](${target})` : `- ${label}`;
          })
          .join("\n")
      : "_(no clips)_";

  return joinBlocks([
    "# Generated video",
    [model ? `Model: \`${model}\`` : null, cost ? `Cost: ${cost}` : null]
      .filter(Boolean)
      .join(" · ") || null,
    lines,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions.
// ---------------------------------------------------------------------------

export const GENERATED_VIDEO_SET_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "generated_video_set",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "generated_video_set",
    toLegacyServerData: generatedVideoSetServerDataFromEnvelope,
    toMarkdown: generatedVideoSetMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "media",
    schema: generatedVideoSetKindSchema,
  },
  {
    kind: "generated_video",
    schemaSource: "system",
    tier: "eager",
    schema: generatedVideoKindSchema,
  },
];
