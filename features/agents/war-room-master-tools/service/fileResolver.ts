/**
 * features/agents/war-room-master-tools/service/fileResolver.ts
 *
 * The ONE seam that resolves a `war_room_read_file` `file_id` (a `cld_files.id`
 * the agent saw in the inline `war_room` <files> block) to the canonical
 * extraction it can read: the `processed_documents.id` and a display name.
 *
 * Reuses the canonical paths only — never a new fetch:
 *   1. The cloudFiles Redux slice (`selectFileById`) when the file is already
 *      hydrated — it carries `canonicalProcessedDocumentId` + `fileName`.
 *   2. Otherwise `lookupFileDocument(fileId)` — the SAME owner-scoped, RLS-gated
 *      direct read of `processed_documents` the cloud-files RAG badge uses.
 *
 * Everything is owner-scoped: the slice only holds the user's files, and the
 * `processed_documents` read is RLS-gated to the authenticated user — a file the
 * user can't see never resolves. Returns a null `processedDocumentId` (with the
 * resolvable name still set) when the file exists but has no extraction yet.
 */

import type { RootState } from "@/lib/redux/store";
import { selectFileById, lookupFileDocument } from "@/features/files";

export interface ResolvedReadFile {
  /** True only when the `cld_files.id` is visible to the user at all. */
  exists: boolean;
  /** The canonical `processed_documents.id`, or null when not yet extracted. */
  processedDocumentId: string | null;
  /** A display name, when resolvable from the slice. */
  fileName: string | null;
  /** MIME hint from the slice, when known. */
  mime: string | null;
}

/**
 * Resolve a `cld_files.id` to its canonical extraction + display metadata.
 *
 * Best-effort and non-throwing: on a transient `processed_documents` read error
 * (`kind:"unavailable"`) it returns `exists:true, processedDocumentId:null` so
 * the handler surfaces a clean "no extraction available" rather than an error —
 * the agent can retry. A `kind:"absent"` is the same shape (file exists, no
 * extraction). Only a genuinely unknown id (not in the slice and absent from the
 * RLS-gated read) reports `exists:false`.
 */
export async function resolveReadFile(
  state: RootState,
  fileId: string,
): Promise<ResolvedReadFile> {
  const record = selectFileById(state, fileId);
  const fileName = record?.fileName ?? null;
  const mime = record?.mimeType ?? null;

  // Fast path: the slice already knows the canonical processed-document id.
  if (record?.canonicalProcessedDocumentId) {
    return {
      exists: true,
      processedDocumentId: record.canonicalProcessedDocumentId,
      fileName,
      mime,
    };
  }

  // Otherwise probe `processed_documents` directly (owner/RLS-scoped, memoized).
  const lookup = await lookupFileDocument(fileId);
  if (lookup.kind === "found") {
    return {
      exists: true,
      processedDocumentId: lookup.doc.processed_document_id,
      fileName,
      mime,
    };
  }

  // `absent` (no extraction) or `unavailable` (transient): if the file is in the
  // slice it definitely exists; if it isn't and the read found nothing, treat it
  // as unknown so the handler can say so clearly.
  return {
    exists: record != null || lookup.kind === "unavailable",
    processedDocumentId: null,
    fileName,
    mime,
  };
}
