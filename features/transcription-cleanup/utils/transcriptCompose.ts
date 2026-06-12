/** Join non-empty transcript parts with blank lines between them. */
export function composeTranscriptParts(
  ...parts: (string | null | undefined)[]
): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

/** Visible transcript while recording — prefix/base/live/suffix in order. */
export function composeTranscriptDisplay(
  base: string,
  live: string,
  prefix: string,
  suffix: string,
): string {
  return composeTranscriptParts(prefix, base, live, suffix);
}

/** Final commit body — baked prefix/suffix around committed base + new chunk. */
export function composeCommittedTranscript(
  base: string,
  newChunk: string,
  prefix: string,
  suffix: string,
): string {
  const body = composeTranscriptParts(base, newChunk);
  return composeTranscriptParts(prefix, body, suffix);
}
