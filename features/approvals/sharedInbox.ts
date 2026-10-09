// features/approvals/sharedInbox.ts — lane PAGE-BUNDLE-2
//
// ONE READ OF EVERYTHING WAITING ON HER, PER PAGE LOAD. The bell's count, the approvals list and the
// table page's held-writes chip each asked `custom.work_inbox` (three calls per table page on
// production). They share one read: in flight, and for SHARED_INBOX_MS after it lands. A failed read
// is never shared past its flight; `forgetWaitingWorkInbox` (a decision was made) asks again.
// Kept free of imports so the approvals query keys can forget it without pulling the store client.

const SHARED_INBOX_MS = 5_000;
let shared: { userId: string; at: number; read: Promise<unknown> } | null = null;

export function sharedInboxRead<T>(userId: string, read: () => Promise<T>): Promise<T> {
  const held = shared;
  if (held && held.userId === userId && (held.at === 0 || Date.now() - held.at < SHARED_INBOX_MS)) {
    return held.read as Promise<T>;
  }
  const entry: { userId: string; at: number; read: Promise<unknown> } = { userId, at: 0, read: Promise.resolve() };
  const promise = read().then(
    (value) => {
      entry.at = Date.now();
      return value;
    },
    (thrown: unknown) => {
      if (shared === entry) shared = null;
      throw thrown;
    },
  );
  entry.read = promise;
  shared = entry;
  return promise;
}

/** A decision was made: the next read of the inbox asks the store again. */
export function forgetWaitingWorkInbox(): void {
  shared = null;
}
