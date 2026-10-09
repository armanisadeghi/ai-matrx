// lib/boot/primaryContent.ts — lane PAGE-BUNDLE-2
//
// THE PAGE'S OWN CONTENT FIRST, THE SHELL'S BACKGROUND READS AFTER.
//
// A page whose first data is what the person came for (a table's rows) HOLDS the shell's heavy
// background reads until that data is on screen: `custom.context_tree` (~1.2 s on production) and
// `get_user_file_tree` (~1.2 s) were started before the rows and competed with them for the
// database and the main thread. A hold is released by the page when its content shows, or by
// itself after its cap — a page that never shows its content never starves the shell. Readers
// wait with `whenPrimaryContentShown()`, which also waits for the document's load event, so a hold
// registered while the page hydrates is always seen. No hold → the shell reads at load, as before.

const DEFAULT_CAP_MS = 4_000;

const holds = new Map<string, ReturnType<typeof setTimeout>>();
let waiters: Array<() => void> = [];

function settle(): void {
  if (holds.size > 0) return;
  const ready = waiters;
  waiters = [];
  for (const resolve of ready) resolve();
}

/** Hold the shell's background reads until `release()` or `capMs`. Idempotent per key. */
export function holdPrimaryContent(key: string, capMs = DEFAULT_CAP_MS): () => void {
  if (typeof window === "undefined") return () => {};
  const existing = holds.get(key);
  if (existing) clearTimeout(existing);
  const release = () => {
    const timer = holds.get(key);
    if (timer === undefined) return;
    clearTimeout(timer);
    holds.delete(key);
    settle();
  };
  holds.set(key, setTimeout(release, capMs));
  return release;
}

function documentLoaded(): Promise<void> {
  if (typeof document === "undefined" || document.readyState === "complete") return Promise.resolve();
  return new Promise((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
}

/** Resolves once the document has loaded and no page holds its primary content back. */
export async function whenPrimaryContentShown(): Promise<void> {
  if (typeof window === "undefined") return;
  await documentLoaded();
  if (holds.size === 0) return;
  await new Promise<void>((resolve) => waiters.push(resolve));
}

/** Tests only. */
export function resetPrimaryContentHolds(): void {
  for (const timer of holds.values()) clearTimeout(timer);
  holds.clear();
  settle();
}
