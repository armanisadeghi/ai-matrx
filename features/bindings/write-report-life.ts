// features/bindings/write-report-life.ts
//
// HOW LONG THE SERVER'S REPORT ON A WRITE STAYS TRUE (V1 finding R2-2).
//
// One rule, in one place, because it was got wrong by being asked against the
// wrong baseline. `applies_in` and `notes` describe THE ROW THE SERVER JUST
// WROTE. They stop being true when the person edits away from that row — and
// only then.
//
// 🚨 The rule used to be "clear it whenever the draft is dirty". `dirty` is
// measured against the STORED row the client last read, and a successful save
// leaves the draft dirty against that stale baseline until the refetch lands —
// so every save cleared its own report in the same commit that set it, and the
// sentence never rendered a single frame. Measured by the adversary with a
// MutationObserver over five saves on two hosts: `everRendered: false`.

export function writeReportStillDescribesDraft({
  writtenSignature,
  draftSignature,
}: {
  /** What the draft looked like when the server answered. `null` = no write. */
  writtenSignature: string | null;
  /** What the draft looks like now. */
  draftSignature: string;
}): boolean {
  if (writtenSignature === null) return false;
  return draftSignature === writtenSignature;
}
