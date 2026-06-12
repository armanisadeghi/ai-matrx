/**
 * features/pdf/utils/source.ts
 *
 * Canonical PDF source-wire builders — the ONE place a request "source" is
 * constructed for the Python `/utilities/pdf/*` endpoints. Every surface
 * (extractor studio, analysis studio, demos, edit tab) builds its source
 * through these helpers; never hand-roll the shape at a callsite.
 *
 * Backend contract (verified against aidream `MediaRef` + `SourceMixin`):
 *   - `media` is a MediaRef accepting EXACTLY ONE identifier:
 *       `file_id` (cld_files.id) | `url` (https://…) | `file_uri` (s3://…).
 *   - `cld_id` is NOT a recognized field. MediaRef is declared with
 *     `extra="allow"`, so an unknown key is silently dropped — the ref ends
 *     up with no identifier, the resolver skips it, and the endpoint 422s
 *     with "Provide one of: file, url, local_path, or media." This exact
 *     mistake broke every cld-file-sourced operation before 2026-06-11.
 *     Never send `cld_id`.
 *   - Top-level legacy `url` is still accepted by SourceMixin, but new code
 *     sends everything through `media` for one uniform path.
 */

/** Wire shape for a single-PDF source on any `/utilities/pdf/*` endpoint. */
export type PdfSourceWire =
  | { media: { file_id: string } }
  | { media: { file_uri: string } }
  | { media: { url: string } };

/** Wire shape for the insert-pages second source (`InsertPagesRequest`). */
export type PdfInsertSourceWire =
  | { source_media: { file_id: string } | { file_uri: string } }
  | { source_url: string };

/** Structural inputs — matches `PdfDocument` fields without importing it. */
export interface PdfSourceInputs {
  /** "cld_file" when the doc points at a cld_files row. */
  sourceKind?: string | null;
  /** cld_files.id when sourceKind === "cld_file". */
  sourceId?: string | null;
  /** Public URL or s3:// URI fallback. */
  sourceUrl?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Source wire for a known cld_files row id. */
export function buildPdfSourceFromFileId(
  fileId: string,
): { media: { file_id: string } } {
  return { media: { file_id: fileId } };
}

/**
 * Build the canonical source wire from a document's source fields.
 * Returns null when the document has no resolvable source (caller shows
 * its "re-upload / no source linked" error).
 */
export function buildPdfSource(inputs: PdfSourceInputs): PdfSourceWire | null {
  if (inputs.sourceKind === "cld_file" && inputs.sourceId) {
    return buildPdfSourceFromFileId(inputs.sourceId);
  }
  const url = inputs.sourceUrl?.trim();
  if (!url) return null;
  if (url.startsWith("s3://") || url.startsWith("supabase://")) {
    // Native cloud URIs are a first-class MediaRef identifier — previously
    // these were rejected client-side ("No source file linked").
    return { media: { file_uri: url } };
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { media: { url } };
  }
  return null;
}

/**
 * Parse a raw user-typed second-source string (merge / insert inputs):
 * a cld file UUID, an http(s) URL, or an s3://-style URI.
 */
export function parsePdfSourceInput(value: string): PdfSourceWire | null {
  const t = value.trim();
  if (!t) return null;
  if (t.startsWith("http://") || t.startsWith("https://")) {
    return { media: { url: t } };
  }
  if (t.startsWith("s3://") || t.startsWith("supabase://")) {
    return { media: { file_uri: t } };
  }
  if (UUID_RE.test(t)) {
    return buildPdfSourceFromFileId(t);
  }
  return null;
}

/** Convert a source wire into the insert-pages second-source fields. */
export function toInsertSourceWire(src: PdfSourceWire): PdfInsertSourceWire {
  if ("url" in src.media) return { source_url: src.media.url };
  return { source_media: src.media };
}
