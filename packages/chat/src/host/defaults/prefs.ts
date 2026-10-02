/**
 * Default prefs port: localStorage under one prefix; in memory — announced
 * once, because a draft that vanishes on reload is a silent failure — when
 * storage is unavailable (SSR, private mode, sandboxed frames).
 *
 * The typed preferences (P8) are not kept here: with no `preferences()` the
 * package keeps them in its own `chatHost` slice. There is no settings register here: every
 * knob reads as "not answered" (each reader's own default) and an override is
 * refused — both said once.
 */

import type {
  ChatKnobsPort,
  ChatPreferences,
  ChatPreferenceWrite,
  ChatPrefsPort,
} from "../contract";

/**
 * `change` applied to `current` — the package's own keeping of the person's
 * preferences (a host without `preferences()`). Returns `current` when the
 * change touches nothing the package reads.
 */
export function applyPreferenceWrite(
  current: ChatPreferences,
  change: ChatPreferenceWrite,
): ChatPreferences {
  switch (change.kind) {
    case "preference": {
      const field = PREFERENCE_FIELDS[`${change.module}.${change.preference}`];
      return field ? ({ ...current, [field]: change.value } as ChatPreferences) : current;
    }
    case "creator-panel-toggled":
      return { ...current, showCreatorPanel: !current.showCreatorPanel };
    case "debug-mode-toggled":
      return { ...current, debugMode: !current.debugMode };
    default:
      // Creator authority and debug-panel data: nothing in the package reads them.
      return current;
  }
}
import { announceOnce } from "../errors";

/** The platform defaults — what a host that keeps no preferences gets. */
export const DEFAULT_CHAT_PREFERENCES: ChatPreferences = Object.freeze({
  loaded: true,
  superAdminDebugger: false,
  debugMode: false,
  showCreatorPanel: false,
  creatorSettings: Object.freeze({
    showRawIds: false,
    showBuildAffordances: true,
    showDrafts: false,
    disableToolInjection: false,
  }),
  desktopTargetInstanceId: null,
  directiveApplyPolicy: "default",
  restoreUnsentDrafts: true,
  sandboxBySurface: Object.freeze({}),
  sandboxCanvasAutoOpen: true,
  conversationLanes: undefined,
  conversationSurfaces: undefined,
  activeScratchpadId: null,
}) as ChatPreferences;

/** `module.preference` → the typed field it sets (the stored preferences the package writes). */
export const PREFERENCE_FIELDS: Readonly<Record<string, keyof ChatPreferences>> = {
  "coding.activeAgentSandboxBySurface": "sandboxBySurface",
  "coding.sandboxCanvasAutoOpen": "sandboxCanvasAutoOpen",
  "assistant.directiveApplyPolicy": "directiveApplyPolicy",
  "prompts.restoreUnsentDrafts": "restoreUnsentDrafts",
  "conversationFilters.lanes": "conversationLanes",
  "conversationFilters.surfaces": "conversationSurfaces",
  "scratchpad.activeId": "activeScratchpadId",
};

/** No settings register: nothing is answered, every override is refused — said once. */
export function createUnhostedKnobs(): ChatKnobsPort {
  const unanswered = (): undefined => {
    announceOnce(
      "knobs-unhosted",
      "This host has no settings register, so every setting reads its built-in default. " +
        "Pass a `prefs.knobs` port to resolve organization and personal settings.",
    );
    return undefined;
  };
  return {
    useEffective: unanswered,
    useSession: unanswered,
    peekSession: unanswered,
    ensure: async () => unanswered(),
    async setOverride() {
      announceOnce(
        "knobs-unhosted-write",
        "A setting was changed, but this host has no settings register to keep it. " +
          "Pass a `prefs.knobs` port.",
      );
      return {
        ok: false,
        reason: "This app keeps no settings",
        detail: "its chat host has no settings register",
      };
    },
  };
}

export const CHAT_PREFS_PREFIX = "ai-matrx-chat:";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const probe = `${CHAT_PREFS_PREFIX}__probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseKnob<T extends string | number | boolean>(
  raw: string | null,
  fallback: T,
): T {
  if (raw == null) return fallback;
  if (typeof fallback === "boolean") {
    if (raw === "true") return true as T;
    if (raw === "false") return false as T;
    return fallback;
  }
  if (typeof fallback === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : fallback) as T;
  }
  return raw as T;
}

export function createWebPrefs(): ChatPrefsPort {
  const memory = new Map<string, string>();
  const listeners = new Set<(key: string) => void>();

  function store(): Storage | null {
    const s = storage();
    if (!s && typeof window !== "undefined") {
      announceOnce(
        "prefs-memory",
        "Chat preferences and drafts are kept in memory only (browser storage is unavailable), " +
          "so they are lost on reload. Pass a `prefs` port to keep them.",
      );
    }
    return s;
  }

  function emit(key: string): void {
    for (const listener of listeners) listener(key);
  }

  const port: ChatPrefsPort = {
    get(key) {
      const s = store();
      if (s) {
        try {
          return s.getItem(CHAT_PREFS_PREFIX + key);
        } catch {
          /* fall through to memory */
        }
      }
      return memory.get(key) ?? null;
    },
    set(key, value) {
      const s = store();
      try {
        if (s) s.setItem(CHAT_PREFS_PREFIX + key, value);
        else memory.set(key, value);
      } catch {
        memory.set(key, value);
      }
      emit(key);
    },
    remove(key) {
      const s = store();
      try {
        s?.removeItem(CHAT_PREFS_PREFIX + key);
      } catch {
        /* memory below */
      }
      memory.delete(key);
      emit(key);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    knob(key, fallback) {
      return parseKnob(port.get(key), fallback);
    },
    knobs: createUnhostedKnobs(),
    snapshot() {
      const out: Record<string, string> = Object.fromEntries(memory);
      const s = storage();
      if (s) {
        try {
          for (let i = 0; i < s.length; i += 1) {
            const full = s.key(i);
            if (!full?.startsWith(CHAT_PREFS_PREFIX)) continue;
            const value = s.getItem(full);
            if (value != null) out[full.slice(CHAT_PREFS_PREFIX.length)] = value;
          }
        } catch {
          /* memory only */
        }
      }
      return out;
    },
  };
  return port;
}
