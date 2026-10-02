/**
 * Default prefs port: localStorage under one prefix; in memory — announced
 * once, because a draft that vanishes on reload is a silent failure — when
 * storage is unavailable (SSR, private mode, sandboxed frames).
 */

import type { ChatPrefsPort } from "../contract";
import { announceOnce } from "../errors";

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
