// lib/sharedReads.ts — lane SHELL-DEDUPE
//
// ONE READ PER (PERSON, QUESTION), SHARED WHILE IT FLIES AND FOR A SHORT WHILE AFTER.
//
// The shell boots many surfaces a moment apart, and each used to ask the database its own copy of
// the same question (the inbox, the member's conversations, the account row). This is the one
// generic home of the pattern `features/organizations/service/memberOrganizationRows.ts` proved:
// callers that ask the same question for the same person share ONE promise. A read that failed is
// never shared past its flight; a write that changes the answer calls `forget`.

export interface SharedReads {
  /** The answer to (person, key): the held read when one is in flight or fresh, else `fetch()`. */
  read<T>(
    person: string | null | undefined,
    key: string,
    fetch: () => PromiseLike<T>,
    options?: { isFailure?: (answer: T) => boolean },
  ): Promise<T>;
  /** Forget what is held — one key, or every key when none is named (a write, a refresh). */
  forget(key?: string): void;
}

interface Held {
  at: number; // 0 while in flight
  read: Promise<unknown>;
}

/** `ttlMs`: how long a landed answer stays shared. Realtime / cadence refreshes ask `fetch` directly. */
export function createSharedReads(ttlMs: number): SharedReads {
  const held = new Map<string, Held>();
  const addr = (person: string, key: string) => `${person}\u0000${key}`;
  return {
    read(person, key, fetch, options) {
      // No person yet: nothing to key on, so nothing is shared (never one person's answer for another).
      if (!person) return Promise.resolve(fetch());
      const id = addr(person, key);
      const hit = held.get(id);
      if (hit && (hit.at === 0 || Date.now() - hit.at < ttlMs)) return hit.read as Promise<never>;
      const entry: Held = { at: 0, read: Promise.resolve() };
      entry.read = Promise.resolve(fetch()).then(
        (answer) => {
          if (options?.isFailure?.(answer)) {
            if (held.get(id) === entry) held.delete(id);
          } else entry.at = Date.now();
          return answer;
        },
        (thrown: unknown) => {
          if (held.get(id) === entry) held.delete(id);
          throw thrown;
        },
      );
      held.set(id, entry);
      return entry.read as Promise<never>;
    },
    forget(key) {
      if (key === undefined) held.clear();
      else for (const id of [...held.keys()]) if (id.endsWith(`\u0000${key}`)) held.delete(id);
    },
  };
}
