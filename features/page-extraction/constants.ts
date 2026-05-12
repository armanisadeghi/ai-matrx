/**
 * features/page-extraction/constants.ts
 *
 * Pure constants. No side effects, no imports beyond types.
 */

/** Max pages we'll send in a single agent call. Above this the LLM context
 *  budget starts to dominate cost and the quality drop documented for full-
 *  document runs sets in. Tune later if needed. */
export const MAX_CHUNK_SIZE = 50;

/** Minimum non-zero chunk size. */
export const MIN_CHUNK_SIZE = 1;

/** Default chunk size if neither job nor request specifies one. */
export const DEFAULT_CHUNK_SIZE = 1;

/** Default concurrency cap. The aidream side also enforces an upper bound. */
export const DEFAULT_MAX_CONCURRENT = 3;

/** Hard upper bound on concurrency from the UI (matches DB CHECK). */
export const MAX_CONCURRENT_CAP = 20;

/** Marker placed between pages inside a chunk's selection text. */
export const PAGE_MARKER = (pageNumber: number) =>
  `--- Page ${pageNumber} ---`;

/** Realtime channel name per file. */
export const realtimeChannelName = (fileId: string) =>
  `page-extraction:${fileId}`;
