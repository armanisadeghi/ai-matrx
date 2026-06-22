/**
 * User-facing RAG vocabulary.
 *
 * DB columns, API fields, Redux keys, and pipeline stage ids stay `chunk*`.
 * Import these labels for any human-readable copy in RAG surfaces.
 */
export const RAG_VOCAB = {
  segment: "Knowledge Segment",
  segments: "Knowledge Segments",
  segmentShort: "Segment",
  segmentsShort: "Segments",
  segmentation: "Segmentation",
  segmenting: "Segmenting",
  /** Lowercase pipeline stage verb in "extract → clean → segment → embed". */
  segmentStage: "segment",
} as const;

/** e.g. "1,843 segments" — short form is default for counts and tables. */
export function ragSegmentCount(n: number, short = true): string {
  const label =
    n === 1
      ? short
        ? RAG_VOCAB.segmentShort
        : RAG_VOCAB.segment
      : short
        ? RAG_VOCAB.segmentsShort
        : RAG_VOCAB.segments;
  return `${n.toLocaleString()} ${label.toLowerCase()}`;
}

/** Full pipeline subtitle: extract → clean → segment → embed */
export const RAG_PIPELINE_SUBTITLE = `Full pipeline (extract → clean → ${RAG_VOCAB.segmentStage} → embed)`;
