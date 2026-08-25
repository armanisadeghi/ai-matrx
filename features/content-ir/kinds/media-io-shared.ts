/**
 * Shared readers for the media workflow-I/O kinds (`generated_image_set`,
 * `generated_video_set`, `generated_audio`, `podcast_episode`).
 *
 * These four kinds are PYTHON-OWNED: their schemas are
 * `Model.model_json_schema()` output from
 * `aidream/packages/matrx-ai/matrx_ai/graph_nodes/{image_action,video_action,tts_action}.py`
 * and the podcast `PodcastEpisodeOutput`. The `KindSchema` mirrors beside each
 * component are the FE parser's view of the same models — change a model and
 * both the seeded schema and its mirror move in the same change.
 *
 * 🚨 MEDIA DURABILITY. Every one of these shapes may carry a `file_id` (the
 * durable handle) AND one or more URLs (a handoff). The rule this module
 * encodes once, so no component re-decides it: **prefer `file_id`; fall back
 * to the most durable URL available** (CDN → plain URL → signed URL). Never
 * persist or pass the URL as identity — `mediaHandleOf` returns the value
 * `<InlineMediaRef>` should resolve, and InlineMediaRef owns the URL
 * lifecycle from there (re-minting a signed URL from the id on expiry).
 *
 * As of 2026-08-20 the Python producers no longer POPULATE `signed_url` /
 * `audio_signed_url` on these outputs at all: a node output is written to
 * `workflow.node_outcome` and read back days later, so an expiring URL stored
 * there is a permanent 403 (51 live rows did exactly that). The fields stay in
 * the mirrors because the seeded kind schemas still declare them, and the
 * `mediaHandleOf` fallback stays because old rows carry them — it just never
 * fires for a new run. Never "fix" a null `signed_url` by populating it.
 *
 * `GeneratedVideo` / `TextToSpeechOutput` do not carry `file_id` YET — the
 * producer-side fix landed 2026-08-18 (every media payload carries `file_id`);
 * record: `aidream/aidream/services/podcast/FEATURE.md` § Every media payload carries the id.
 * The readers below already look for it, so those shapes light up with the
 * durable handle the moment that lands, with no FE change.
 */

import { isRecord } from "./legacy-bridge-utils";
import type { MaterializedKind } from "./kind-payload";
import type { AiUsage, GeneratedImage } from "./generated/kinds.generated";

export function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
  );
}

/**
 * A media item's identity fields, as every one of these shapes expresses them
 * — PICKED from the registry's own `generated_image`, so a producer that gains
 * a locator field cannot leave this reader behind (`check:kind-type-twins`).
 */
export type MediaHandleFields = MaterializedKind<
  Pick<GeneratedImage, "file_id" | "url" | "cdn_url" | "signed_url" | "mime_type">
>;

export function readMediaHandleFields(
  entry: Record<string, unknown>,
): MediaHandleFields {
  return {
    file_id: optionalString(entry.file_id),
    url: optionalString(entry.url),
    cdn_url: optionalString(entry.cdn_url),
    signed_url: optionalString(entry.signed_url),
    mime_type: optionalString(entry.mime_type),
  };
}

/**
 * The value to hand `<InlineMediaRef ref={…}>` — the durable id when the
 * producer supplied one, else the most durable URL it did supply. `null` when
 * the item carries nothing resolvable (the component renders its fallback,
 * never a broken tag).
 */
export function mediaHandleOf(fields: MediaHandleFields): string | null {
  return fields.file_id ?? fields.cdn_url ?? fields.url ?? fields.signed_url;
}

/** Aggregate usage as these outputs report it — display only, never math we own. */
export type MediaUsage = MaterializedKind<Pick<AiUsage, "cost_usd" | "total_tokens">>;

export function readUsage(value: unknown): MediaUsage | null {
  if (!isRecord(value)) return null;
  const cost = optionalNumber(value.cost_usd);
  const tokens = optionalNumber(value.total_tokens);
  if (cost === null && tokens === null) return null;
  return { cost_usd: cost, total_tokens: tokens };
}

/** `42.5` → `0:42`; `null` → `null`. Shared by the audio and video renderers. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null;
  const whole = Math.round(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** `$0.0400` — provider costs here are routinely sub-cent. */
export function formatCost(cost: number | null): string | null {
  if (cost === null) return null;
  return cost >= 1 ? `$${cost.toFixed(2)}` : `$${cost.toFixed(4)}`;
}
