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
