// features/make/describe/runStore.ts — lane MAKE-WORKS-2: ONE SUBMISSION, ONE BUILD.
//
// Each press of Make it gets a request key, and the run (with what each step produced) is kept in this browser per
// organization. A reload, a paused tab or Try again REATTACHES to that run instead of starting another: the key names
// the one-off template (custom.template_declare upserts on it, custom.template_install resumes it), and a Space step
// that was already started looks for the Space it built before building again. Pure, no network.

export const RUN_STORE_KEY = "make.describe.run.v1";
/** A run still going after this long is not reattached (the Space Builder's own wait is 12 minutes). */
export const REATTACH_IN_FLIGHT_MS = 15 * 60_000;
/** A finished or failed run is shown again on reload for this long, then forgotten. */
export const SHOW_AGAIN_MS = 30 * 60_000;

export interface KeptRun {
  key: string;
  organizationId: string;
  startedAt: number;
  endedAt: number | null;
  failed: unknown;
}

const slot = (organizationId: string) => `${RUN_STORE_KEY}:${organizationId}`;

/** A new request key: one per press of Make it. */
export function newRequestKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The one-off template's catalogue stamp, from the request key: the same submission always declares the same template. */
export function stampOf(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20).toUpperCase();
}

export function keepRun<T extends KeptRun>(run: T): void {
  try {
    localStorage.setItem(slot(run.organizationId), JSON.stringify(run));
  } catch {
    // A full or blocked store only loses the reattach, never the run.
  }
}

/**
 * The organization's kept run, if it should come back: one still in flight (to reattach), or a finished or failed one
 * from the last half hour (to show again). Anything older is forgotten.
 */
export function keptRun<T extends KeptRun>(organizationId: string, now = Date.now()): { run: T; inFlight: boolean } | null {
  let run: T | null = null;
  try {
    const raw = localStorage.getItem(slot(organizationId));
    run = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    run = null;
  }
  if (!run || run.organizationId !== organizationId || typeof run.key !== "string") return null;
  const inFlight = !run.endedAt && !run.failed;
  const fresh = inFlight ? now - run.startedAt < REATTACH_IN_FLIGHT_MS : now - (run.endedAt ?? run.startedAt) < SHOW_AGAIN_MS;
  if (!fresh) {
    try {
      localStorage.removeItem(slot(organizationId));
    } catch {
      // nothing to forget
    }
    return null;
  }
  return { run, inFlight };
}
