// features/notes/utils/concurrency.ts
//
// Bounded-concurrency fan-out for bulk note actions (move / ingest / delete).
// Mirrors the helper in features/files/components/surfaces/desktop/BulkActionsBar.tsx —
// small enough (and tied closely enough to how notes report per-item failures)
// that duplicating it locally beats a cross-feature import.

/**
 * Runs `worker(item)` for each item with a bounded concurrency. A failure on
 * one item is caught and reported via the returned `failures` array instead
 * of aborting the rest of the batch.
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<{
  succeeded: number;
  failed: number;
  failures: { item: T; error: unknown }[];
}> {
  let cursor = 0;
  let succeeded = 0;
  const failures: { item: T; error: unknown }[] = [];

  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        const item = items[i];
        try {
          await worker(item);
          succeeded++;
        } catch (error) {
          failures.push({ item, error });
        }
      }
    },
  );

  await Promise.all(runners);

  return { succeeded, failed: failures.length, failures };
}
