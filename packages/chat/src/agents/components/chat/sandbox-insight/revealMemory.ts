/**
 * revealMemory — what the user already decided about ONE canvas pane,
 * remembered across reloads.
 *
 * THE DEFECT THIS EXISTS FOR (owner, seen live 2026-09-13): "Put away canvas"
 * did not stick. Reload, and the pane was back on screen. The reveal decision
 * lived in a React ref and the canvas slice is deliberately not persisted, so a
 * reload wiped both: every load looked like the first tool call all over again.
 *
 * A user-closed pane STAYS CLOSED. That is the whole contract. The item is
 * still OFFERED — one click away in the canvas switcher — so nothing becomes
 * unreachable; it simply stops appearing uninvited.
 *
 * Generic on purpose: the sandbox pane discovered this rule first, and every
 * later auto-revealing pane (a document created by a tool, an artifact, a file)
 * needs exactly the same two bits. One implementation, keyed by a namespace, so
 * the rule can never drift between them.
 *
 * Storage is localStorage: a per-device UI decision, not account state. A
 * blocked or full store costs the memory and nothing else — every read and
 * write is guarded.
 */

export interface CanvasRevealMemory {
  /** The reveal already happened for this item; never auto-open again. */
  autoOpened: boolean;
  /** The user put the pane away; never auto-open, even on a later tool call. */
  userClosed: boolean;
}

/** Nothing remembered. A read ALWAYS returns this shape, never a partial one:
 *  `memory.userClosed` must be a boolean at every call site, not `undefined`. */
const NOTHING_REMEMBERED: CanvasRevealMemory = {
  autoOpened: false,
  userClosed: false,
};

/** How many decisions are kept per namespace before the oldest are dropped. */
const MAX_REMEMBERED = 50;

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface CanvasRevealMemoryStore {
  read(sourceId: string | null): CanvasRevealMemory;
  write(sourceId: string | null, patch: Partial<CanvasRevealMemory>): void;
  prune(store: Storage): void;
}

/**
 * Build the reader/writer pair for one namespace (e.g. `matrx.sandboxCanvas.`).
 * The prefix MUST end in a dot so pruning can find the namespace's own keys and
 * nothing else.
 */
export function createCanvasRevealMemory(
  storagePrefix: string,
): CanvasRevealMemoryStore {
  const key = (sourceId: string) => `${storagePrefix}${sourceId}`;

  const read = (sourceId: string | null): CanvasRevealMemory => {
    if (!sourceId) return { ...NOTHING_REMEMBERED };
    const store = storage();
    if (!store) return { ...NOTHING_REMEMBERED };
    try {
      const raw = store.getItem(key(sourceId));
      if (!raw) return { ...NOTHING_REMEMBERED };
      const parsed = JSON.parse(raw) as Partial<CanvasRevealMemory>;
      if (!parsed || typeof parsed !== "object")
        return { ...NOTHING_REMEMBERED };
      return {
        autoOpened: parsed.autoOpened === true,
        userClosed: parsed.userClosed === true,
      };
    } catch {
      return { ...NOTHING_REMEMBERED };
    }
  };

  const prune = (store: Storage): void => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const k = store.key(i);
        if (k && k.startsWith(storagePrefix)) keys.push(k);
      }
      if (keys.length <= MAX_REMEMBERED) return;
      for (const k of keys.slice(0, keys.length - MAX_REMEMBERED)) {
        store.removeItem(k);
      }
    } catch {
      /* nothing to do */
    }
  };

  const write = (
    sourceId: string | null,
    patch: Partial<CanvasRevealMemory>,
  ): void => {
    if (!sourceId) return;
    const store = storage();
    if (!store) return;
    const next = { ...read(sourceId), ...patch };
    try {
      store.setItem(key(sourceId), JSON.stringify(next));
    } catch {
      // Quota or a blocked store. Prune the oldest decisions and try once more;
      // failing that, the pane simply forgets — it never breaks the chat.
      prune(store);
      try {
        store.setItem(key(sourceId), JSON.stringify(next));
      } catch {
        /* remembered nothing; nothing else is affected */
      }
    }
  };

  return { read, write, prune };
}
