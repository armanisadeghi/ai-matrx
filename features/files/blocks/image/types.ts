/**
 * features/files/blocks/image/types.ts
 *
 * THE canonical shape for every image in the app.
 *
 * Every source format (stream `image_output` event, stream `partial_image`,
 * stream `render_block:image`, DB `cx_message.content[]` media part, external
 * URL, just-uploaded local file) is normalized to `UnifiedImageBlock` at the
 * boundary via the adapters in `./adapters/`. Past that boundary, no component,
 * selector, hook, or renderer touches the original shape — they only speak
 * `UnifiedImageBlock`.
 *
 * Two variants distinguished by `origin`:
 *   - `MatrxImageBlock`    — owned files (cld_files row); always carries
 *                            `fileId` + `fileUri`, so we can always re-mint a
 *                            signed URL on expiry.
 *   - `ExternalImageBlock` — files we do not own (tool results, model
 *                            citations); always carries `externalUrl`; never
 *                            re-signed, never refreshed.
 *
 * Invariants (enforced at adapter boundary):
 *   1. `MatrxImageBlock` has `fileId !== null` AND `fileUri !== null`.
 *   2. `ExternalImageBlock` has `externalUrl !== null`.
 *   3. `base64` populated + matrx => `status === "streaming"` (partial).
 *      Once `status === "complete"` for matrx, base64 is cleared and at
 *      least one URL flavor is populated.
 *
 * Field nulls vs. undefined:
 *   - We use `null` for "known empty" — explicitly no value here.
 *   - We use optional fields only on internal helpers where presence/absence
 *     is a meaningful boolean.
 *   - The shape is FLAT and EXHAUSTIVE so destructuring is safe. Consumers
 *     should never have to write `block.x?.y?.z` — every shape position is
 *     spelled out.
 */

export type UnifiedImageBlock = MatrxImageBlock | ExternalImageBlock;

// ─── Shared fields ──────────────────────────────────────────────────────────

/**
 * Fields that BOTH variants carry. Variants differ only in identity fields.
 * Consumers that just need to render an image can read these without
 * narrowing on `origin`.
 */
interface ImageBlockShared {
  // ── URL flavors. Resolver picks the best at render time. ──────────────────
  /** Permanent CDN URL — no expiry, no auth required. Preferred when present. */
  cdnUrl: string | null;
  /** Short-lived presigned URL (~1h). Auth is baked into query params. */
  signedUrl: string | null;
  /** Attachment-disposition variant. Used for the download action. */
  downloadUrl: string | null;
  /** Inline base64 bytes. Used for streaming partials and tiny inline assets. */
  base64: string | null;

  // ── Bytes-level metadata ─────────────────────────────────────────────────
  mimeType: string | null;
  fileName: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;

  // ── Lifecycle ────────────────────────────────────────────────────────────
  /**
   * "complete"   — final image; all configured URLs are valid as of emission
   * "streaming"  — generating; only `base64` (partial preview) may be present
   * "error"      — generation failed; renderer shows error state
   */
  status: "complete" | "streaming" | "error";
  /** 0–1 progress. Meaningful only when status === "streaming". */
  progress: number | null;
  /**
   * Ms epoch (Date.now()-style) when `signedUrl` expires. null if no
   * signed URL or expiry is unknown. The resolver in `useUnifiedImageUrl`
   * is the ONE place that consults this for refresh decisions.
   */
  signedUrlExpiresAt: number | null;

  // ── Extension point ──────────────────────────────────────────────────────
  /**
   * Free-form. Adapters MAY promote known keys (`model`, `prompt`, `feature`,
   * etc.) into typed structures over time, but consumers must NOT rely on a
   * specific shape — read with narrowing and fall back to null. This is the
   * deliberate flexibility escape hatch: organized today, expandable tomorrow.
   *
   * Common keys (when adapters supply them):
   *   model     : string  — model that generated this (e.g. "gpt-image-2")
   *   provider  : string  — "openai" | "anthropic" | ...
   *   feature   : string  — "ai_images" | "podcast_covers" | ...
   *   prompt    : string  — the prompt that produced this (if applicable)
   *   source    : string  — "ai_media" | "user_upload" | "external" | ...
   */
  metadata: Record<string, unknown> | null;
}

// ─── Matrx-owned variant (cld_files row) ────────────────────────────────────

/**
 * An image we own — corresponds to a row in `public.cld_files`. Carries
 * everything needed to render WITHOUT a round-trip (denormalized snapshot),
 * AND to refresh if any URL goes stale (`fileId` + `fileUri` are the immutable
 * identity).
 *
 * The cached, denormalized view of the cld_files row at message-creation
 * time. If this block ever goes stale (visibility changed, file deleted,
 * etc.), `fileId` always lets us re-hydrate from Supabase directly without
 * a Python round-trip.
 */
export interface MatrxImageBlock extends ImageBlockShared {
  origin: "matrx";

  /** cld_files.id — the permanent identity. REQUIRED. */
  fileId: string;
  /**
   * cld_files.storage_uri — `s3://bucket/key` form. Immutable; survives
   * URL churn. REQUIRED.
   */
  fileUri: string;
  /**
   * cld_files.canonical_storage_uri — the editable canonical version
   * (different bucket from `fileUri` in some cases). null when no
   * separate canonical exists.
   */
  canonicalFileUri: string | null;

  /**
   * cld_files.visibility — drives URL resolution strategy:
   *   "public"  — prefer cdnUrl; no expiry refresh needed
   *   "private" — must use signedUrl; refresh via expiry-wheel
   *   "shared"  — same refresh rules as private
   */
  visibility: "public" | "private" | "shared";

  /** cld_files.thumbnail_url — pre-rendered low-res variant, or null. */
  thumbnailUrl: string | null;
  /** cld_files.thumbnail_storage_uri — native URI for the thumbnail. */
  thumbnailUri: string | null;

  /** cld_files.parent_file_id — derivation lineage (e.g. cropped/rotated from). */
  parentFileId: string | null;
  /**
   * cld_files.derivation_kind — how this was produced from `parentFileId`.
   * E.g. "manual_upload" | "extracted_pages" | "cropped" | "rendered_page_image".
   * See cld_files_derivation_kind_known constraint for the full list.
   */
  derivationKind: string | null;
}

// ─── External variant (not in our system) ───────────────────────────────────

/**
 * An image we do NOT own — an arbitrary URL from a tool result, model
 * citation, or external link. We render it; we never refresh it; we never
 * try to mint a fresh URL.
 */
export interface ExternalImageBlock extends ImageBlockShared {
  origin: "external";

  /** The external URL. REQUIRED. */
  externalUrl: string;

  /**
   * Optional UI label — e.g. "Wikimedia", "Tool: web_search", "Citation".
   * Renderer may show this as an attribution badge.
   */
  sourceLabel: string | null;
}

// ─── Type guards ────────────────────────────────────────────────────────────
//
// Guards moved to `./guards.ts` — they accept `unknown` (not
// `UnifiedImageBlock`) so they can be used at trust boundaries (Redux reads,
// adapter inputs) to prove the shape rather than force-casting.
