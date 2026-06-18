/** Univer owns React roots; synchronous dispose during React commit causes races. */
export function disposeUniverInstance(
  instance: { dispose(): void } | null | undefined,
): void {
  const target = instance;
  if (!target) return;
  queueMicrotask(() => {
    try {
      target.dispose();
    } catch {
      // Instance may already be torn down by a concurrent unmount.
    }
  });
}
