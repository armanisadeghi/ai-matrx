/**
 * Run acquisition and the work it protects under one cleanup boundary.
 *
 * A lock can be acquired before a later lock attempt fails. Keeping the acquisition
 * inside this `try` is what makes that partial state releasable rather than leaked.
 */
export async function withBuildLockCleanup<T>(
  work: () => Promise<T>,
  release: () => Promise<void>,
): Promise<T> {
  try {
    return await work();
  } finally {
    await release();
  }
}

/**
 * Share one in-flight cleanup with every caller.
 *
 * Signals can arrive while the normal `finally` is releasing rows. A later caller
 * must await that same release before it is safe to exit the process.
 */
export function onceAsync<T>(work: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= work();
    return promise;
  };
}
