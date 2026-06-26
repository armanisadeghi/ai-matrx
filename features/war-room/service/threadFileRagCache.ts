/**
 * features/war-room/service/threadFileRagCache.ts
 *
 * A tiny module-level cache of a file's RAG SEARCHABLE state (`fetchFileRagStatus`
 * → `state==='completed'`), keyed by `cld_files.id`. It exists because that state
 * is DISTINCT from "has an extraction" (the cloudFiles `ragStatus` slice already
 * carries extraction-presence) and is NOT mirrored anywhere in Redux — yet the
 * SYNC `war_room` context builder needs it to stamp the `<file rag>` flag.
 *
 * Mirrors the pattern of `features/files/api/document-lookup.ts`'s module cache:
 * the prefetch effect in `ThreadAgentPanel` fills it (best-effort), and the sync
 * builder reads it. Unknown ⇒ `undefined` (the builder OMITS the flag rather than
 * guessing). Never a second Redux slice — this is ephemeral per-session wiring.
 */

const ragIndexedByFileId = new Map<string, boolean>();

/** Record whether a file is searchable via RAG (`fetchFileRagStatus` completed). */
export function setThreadFileRagIndexed(fileId: string, indexed: boolean): void {
  if (!fileId) return;
  ragIndexedByFileId.set(fileId, indexed);
}

/** Read a file's known RAG-searchable state, or `undefined` when not yet probed. */
export function getThreadFileRagIndexed(fileId: string): boolean | undefined {
  return ragIndexedByFileId.get(fileId);
}

/** True once a file has been probed (so the prefetch can skip it). */
export function hasThreadFileRagProbe(fileId: string): boolean {
  return ragIndexedByFileId.has(fileId);
}
