/**
 * ONE answer to "which stored file does this render block show?"
 *
 * A signed URL is a handoff, never an identity — so two blocks pointing at the
 * SAME file can look completely different as strings (a `file_id`, a CDN link, a
 * freshly-minted signed link with a different signature each time). Comparing
 * URLs would miss every one of those. This resolves each block down to its
 * `file_id` so the slot walker can tell "the same picture, twice" from "two
 * pictures", and drop the duplicate.
 *
 * Why this exists: an agent that produced an image used to hand the calling
 * model a signed URL as TEXT. The model would paste it into its answer, the
 * accumulator turned that markdown line into its own `image` block, and the
 * user saw the picture twice — once as the media block, once as prose. The
 * server side no longer hands out URLs, so the model has nothing to paste. This
 * makes that a STRUCTURAL guarantee rather than a bet on model behaviour.
 */
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

/**
 * Only media-bearing blocks participate. A `text` block that happens to contain
 * a link must never dedupe against a real image — text is not a media surface.
 */
const MEDIA_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "image",
  "image_output",
  "audio",
  "audio_output",
  "video",
  "video_output",
  "matrx_file",
]);

/** First markdown/HTML-ish link target on the line: `![alt](url)` or `[label](url)`. */
const MARKDOWN_LINK_TARGET = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)/;

/**
 * The `file_id` this block renders, or null when it is not a media block or
 * points at something we do not own (an external image, a YouTube embed).
 *
 * Resolution order — most authoritative first:
 *   1. `data.file_id`  — the canonical identity the server now sends.
 *   2. `data.url`      — recover the id from our own user-files URL shape.
 *   3. markdown in `content` — a model-authored `![alt](url)` line.
 */
export function blockMediaFileId(
  block: Pick<RenderBlockPayload, "type" | "content" | "data"> | undefined,
): string | null {
  if (!block || !MEDIA_BLOCK_TYPES.has(block.type)) return null;

  const data = block.data as Record<string, unknown> | null | undefined;

  const directId = data?.file_id;
  if (typeof directId === "string" && directId) return directId;

  const dataUrl = data?.url;
  if (typeof dataUrl === "string" && dataUrl) {
    const fromData = fileIdFromUserFilesUrl(dataUrl);
    if (fromData) return fromData;
  }

  if (typeof block.content === "string" && block.content) {
    const target = MARKDOWN_LINK_TARGET.exec(block.content)?.[1];
    if (target) return fileIdFromUserFilesUrl(target);
  }

  return null;
}
