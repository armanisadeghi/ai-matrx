/**
 * `generated_image_set` (+ child `generated_image`) — the output of every
 * image-generating node in the platform (`ai.generate_image`).
 *
 * PYTHON-OWNED: the seeded schema is `GenerateImageOutput.model_json_schema()`
 * (`aidream/packages/matrx-ai/matrx_ai/graph_nodes/image_action.py`); the
 * `KindSchema` below is the FE parser's mirror of the same model. A model
 * change re-seeds the kind AND updates this mirror in the same change —
 * `packages/matrx-ai/tests/test_media_node_output_kinds.py` fails otherwise.
 *
 * The bridge is STREAMING: `images` is an array of a child kind, so each image
 * appears as its object closes. An empty list is a normal mid-generation
 * state the component renders — never a spinner, never raw JSON.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import {
  formatCost,
  mediaHandleOf,
  optionalNumber,
  optionalString,
  readMediaHandleFields,
  readUsage,
  stringOrEmpty,
  type MediaHandleFields,
  type MediaUsage,
} from "./media-io-shared";

// ---------------------------------------------------------------------------
// Schemas — mirror of GeneratedImage / GenerateImageOutput.
// ---------------------------------------------------------------------------

export const generatedImageKindSchema: KindSchema = {
  kind: "generated_image",
  fields: {
    file_id: {
      type: "string",
      nullable: true,
      description:
        "cld_files id — the durable handle. Every URL is re-minted from this; never store a signed URL as identity.",
    },
    url: { type: "string", nullable: true, description: "Inline-render URL." },
    cdn_url: {
      type: "string",
      nullable: true,
      description: "Permanent CDN URL, present only when the image is public.",
    },
    signed_url: {
      type: "string",
      nullable: true,
      description: "Expiring inline URL, present only for a non-public image.",
    },
    path: { type: "string", nullable: true, description: "Local filesystem path, when the provider wrote one." },
    data_b64: { type: "string", nullable: true, description: "Base64 bytes, only when no file was persisted." },
    mime_type: { type: "string", nullable: true },
    size_bytes: { type: "number", nullable: true },
    width: { type: "number", nullable: true },
    height: { type: "number", nullable: true },
    seed: { type: "number", nullable: true, description: "Seed the provider used, when it reports one." },
  },
};

export const generatedImageSetKindSchema: KindSchema = {
  kind: "generated_image_set",
  fields: {
    images: {
      type: "array",
      itemKinds: ["generated_image"],
      description: "Every image the provider returned, in order.",
    },
    count: { type: "number", description: "How many images were generated." },
    model: { type: "string", required: true, description: "Image model id that produced the images." },
    // `usage` is the shared AiUsage envelope — carried as opaque JSON rather
    // than registered as two more kinds (AiUsage / AiModelUsage) that no
    // surface renders on its own.
    usage: { type: "json", description: "Aggregated token / cost usage for the run." },
  },
};

export const GENERATED_IMAGE_SET_KIND_SCHEMAS: KindSchema[] = [
  generatedImageSetKindSchema,
  generatedImageKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING.
// ---------------------------------------------------------------------------

export interface GeneratedImageData extends MediaHandleFields {
  /** What `<InlineMediaRef>` resolves — file_id when present, else the most durable URL. */
  handle: string | null;
  width: number | null;
  height: number | null;
  seed: number | null;
  size_bytes: number | null;
}

export interface GeneratedImageSetData {
  images: GeneratedImageData[];
  count: number | null;
  model: string;
  usage: MediaUsage | null;
  isComplete: boolean;
}

export function readGeneratedImage(entry: unknown): GeneratedImageData | null {
  if (!isRecord(entry)) return null;
  const fields = readMediaHandleFields(entry);
  const handle = mediaHandleOf(fields);
  // A mid-stream image object exists before any of its URL fields close, and
  // an image with no resolvable handle is nothing the user can see — dropped
  // rather than rendered as a broken tile.
  if (!handle) return null;
  return {
    ...fields,
    handle,
    width: optionalNumber(entry.width),
    height: optionalNumber(entry.height),
    seed: optionalNumber(entry.seed),
    size_bytes: optionalNumber(entry.size_bytes),
  };
}

export function readGeneratedImageList(value: unknown): GeneratedImageData[] {
  if (!Array.isArray(value)) return [];
  const out: GeneratedImageData[] = [];
  for (const entry of value) {
    const image = readGeneratedImage(entry);
    if (image) out.push(image);
  }
  return out;
}

export function generatedImageSetServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (GeneratedImageSetData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "generated_image_set") return undefined;
  const value = envelope.root.value;
  return {
    images: readGeneratedImageList(value.images),
    count: optionalNumber(value.count),
    model: stringOrEmpty(value.model),
    usage: readUsage(value.usage),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = ["images", "count", "model", "usage"];

export function generatedImageSetMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const images = readGeneratedImageList(value.images);
  const model = optionalString(value.model);
  const cost = formatCost(readUsage(value.usage)?.cost_usd ?? null);

  const lines =
    images.length > 0
      ? images
          .map((image, index) => {
            const dims = image.width && image.height ? ` (${image.width}×${image.height})` : "";
            const target = image.cdn_url ?? image.url ?? image.signed_url;
            const label = `Image ${index + 1}${dims}`;
            return target ? `- [${label}](${target})` : `- ${label}`;
          })
          .join("\n")
      : "_(no images)_";

  return joinBlocks([
    "# Generated images",
    [model ? `Model: \`${model}\`` : null, cost ? `Cost: ${cost}` : null]
      .filter(Boolean)
      .join(" · ") || null,
    lines,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const GENERATED_IMAGE_SET_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "generated_image_set",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "generated_image_set",
    toLegacyServerData: generatedImageSetServerDataFromEnvelope,
    toMarkdown: generatedImageSetMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "gallery",
    schema: generatedImageSetKindSchema,
  },
  {
    kind: "generated_image",
    schemaSource: "system",
    tier: "eager",
    schema: generatedImageKindSchema,
  },
];
