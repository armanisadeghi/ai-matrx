// features/start/widgets/seedOnce.ts — WRITE THE FIRST LAYOUT EXACTLY ONCE.
//
// Three ways a first visit used to write it twice (seen live: v1 + an identical v2): a remount before the
// row list re-read, React StrictMode's double effect, and two tabs opened together. The guard: a
// per-tab memo (remount, StrictMode), a cross-tab lock (Web Locks, when the browser has them), and a
// FRESH re-read of the person's rows inside the lock — another tab may have written while we waited.

export interface SeedOnceDeps {
  userId: string;
  /** Run `fn` while holding a lock no other tab can hold (Web Locks), or just run it. */
  lock: (name: string, fn: () => Promise<void>) => Promise<void>;
  /** Fresh read: does this person already have a layout row? */
  hasRow: () => Promise<boolean>;
  write: () => Promise<unknown>;
}

const IN_FLIGHT = new Map<string, Promise<"wrote" | "skipped">>();
const DONE = new Set<string>();

export function seedStartLayoutOnce(deps: SeedOnceDeps): Promise<"wrote" | "skipped"> {
  if (DONE.has(deps.userId)) return Promise.resolve("skipped");
  const running = IN_FLIGHT.get(deps.userId);
  if (running) return running.then(() => "skipped" as const);
  const run = (async () => {
    let outcome: "wrote" | "skipped" = "skipped";
    await deps.lock(`matrx-start-seed:${deps.userId}`, async () => {
      if (await deps.hasRow()) return;
      await deps.write();
      outcome = "wrote";
    });
    DONE.add(deps.userId);
    return outcome;
  })();
  IN_FLIGHT.set(deps.userId, run);
  return run.finally(() => IN_FLIGHT.delete(deps.userId));
}

/** Web Locks when present (every tab of this browser), else run directly. */
export function browserLock(name: string, fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks ? locks.request(name, fn) : fn();
}

/** Test seam: forget what this tab seeded. */
export function __resetSeedOnceForTests(): void {
  DONE.clear();
  IN_FLIGHT.clear();
}
