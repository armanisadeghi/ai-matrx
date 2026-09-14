/**
 * sandboxCanvasMemory — what the user already decided about this chat's
 * sandbox pane, remembered across reloads.
 *
 * THE DEFECT THIS EXISTS FOR (owner, seen live 2026-09-13): "Put away canvas"
 * did not stick. Reload, and the sandbox pane was back on screen. The reveal
 * decision lived in a React ref (`autoOpenedFor`) and the canvas slice is
 * deliberately not persisted, so a reload wiped both: every load looked like
 * the first sandbox tool call all over again.
 *
 * A user-closed pane STAYS CLOSED. That is the whole contract. The box is
 * still offered — one click away in the canvas switcher — so nothing becomes
 * unreachable; it simply stops appearing uninvited.
 *
 * Scope: per conversation AND per box (the canvas source id), because binding
 * a different box to the same chat is a new thing to reveal, not the thing the
 * user put away. Storage is localStorage: this is a per-device UI decision,
 * not account state, and a blocked or full store costs the memory and nothing
 * else — every read and write is guarded.
 */

export interface SandboxCanvasMemory {
  /** The reveal already happened for this box; never auto-open again. */
  autoOpened: boolean;
  /** The user put the pane away; never auto-open, even on a later tool call. */
  userClosed: boolean;
}

/** Nothing remembered. A read ALWAYS returns this shape, never a partial one:
 *  `memory.userClosed` must be a boolean at every call site, not `undefined`. */
const NOTHING_REMEMBERED: SandboxCanvasMemory = {
  autoOpened: false,
  userClosed: false,
};

const STORAGE_PREFIX = "matrx.sandboxCanvas.";

/** How many conversations' decisions are kept before the oldest are dropped. */
const MAX_REMEMBERED = 50;

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function key(sourceId: string): string {
  return `${STORAGE_PREFIX}${sourceId}`;
}

export function readSandboxCanvasMemory(
  sourceId: string | null,
): SandboxCanvasMemory {
  if (!sourceId) return { ...NOTHING_REMEMBERED };
  const store = storage();
  if (!store) return { ...NOTHING_REMEMBERED };
  try {
    const raw = store.getItem(key(sourceId));
    if (!raw) return { ...NOTHING_REMEMBERED };
    const parsed = JSON.parse(raw) as Partial<SandboxCanvasMemory>;
    if (!parsed || typeof parsed !== "object")
      return { ...NOTHING_REMEMBERED };
    return {
      autoOpened: parsed.autoOpened === true,
      userClosed: parsed.userClosed === true,
    };
  } catch {
    return { ...NOTHING_REMEMBERED };
  }
}

export function writeSandboxCanvasMemory(
  sourceId: string | null,
  patch: Partial<SandboxCanvasMemory>,
): void {
  if (!sourceId) return;
  const store = storage();
  if (!store) return;
  const next = { ...readSandboxCanvasMemory(sourceId), ...patch };
  try {
    store.setItem(key(sourceId), JSON.stringify(next));
  } catch {
    // Quota or a blocked store. Prune the oldest decisions and try once more;
    // failing that, the pane simply forgets — it never breaks the chat.
    pruneSandboxCanvasMemory(store);
    try {
      store.setItem(key(sourceId), JSON.stringify(next));
    } catch {
      /* remembered nothing; nothing else is affected */
    }
  }
}

/** Keep the store bounded — one key per conversation×box adds up over months. */
export function pruneSandboxCanvasMemory(store: Storage): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    if (keys.length <= MAX_REMEMBERED) return;
    for (const k of keys.slice(0, keys.length - MAX_REMEMBERED)) {
      store.removeItem(k);
    }
  } catch {
    /* nothing to do */
  }
}
