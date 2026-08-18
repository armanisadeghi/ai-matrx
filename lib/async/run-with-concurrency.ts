export interface ConcurrencyFailure<T> {
  item: T;
  index: number;
  error: unknown;
}

export interface ConcurrencyResult<T> {
  started: number;
  succeeded: number;
  failed: number;
  failures: ConcurrencyFailure<T>[];
}

/**
 * Runs independent items through a bounded worker pool. One item failing does
 * not stop the rest, and `shouldStart` can stop new work without interrupting
 * items already in flight.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStart: () => boolean = () => true,
): Promise<ConcurrencyResult<T>> {
  if (items.length === 0) {
    return { started: 0, succeeded: 0, failed: 0, failures: [] };
  }

  let cursor = 0;
  let started = 0;
  let succeeded = 0;
  const failures: ConcurrencyFailure<T>[] = [];
  const requestedLimit = Number.isFinite(limit) ? Math.floor(limit) : 1;
  const workerCount = Math.max(1, Math.min(requestedLimit, items.length));

  const runners = Array.from({ length: workerCount }, async () => {
    while (shouldStart()) {
      const index = cursor++;
      if (index >= items.length) return;
      started += 1;
      const item = items[index];
      try {
        await worker(item, index);
        succeeded += 1;
      } catch (error) {
        failures.push({ item, index, error });
      }
    }
  });

  await Promise.all(runners);
  failures.sort((left, right) => left.index - right.index);

  return {
    started,
    succeeded,
    failed: failures.length,
    failures,
  };
}
