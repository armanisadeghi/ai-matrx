import type { AnyAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  setPreference,
  type UserPreferences,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { setMode, toggleMode } from "@/styles/themes/themeSlice";
import {
  setServerOverride,
  setCustomServerUrl,
  clearAdminPreferences,
} from "@/lib/redux/preferences/adminPreferencesSlice";
import { setIsInWindow, setLayoutStyle } from "@/lib/redux/slices/layoutSlice";
import {
  toggleWindowsHidden,
  restoreAll,
} from "@/lib/redux/slices/windowManagerSlice";
import type { SettingsPersistence } from "./types";

/**
 * One binding per slice the settings system can read/write.
 * New slices are added here — primitives and tabs never touch Redux directly.
 */
export type SliceBinding = {
  /** Read a value from `state[slice]` by key (may be dotted for nested shapes). */
  read: (state: RootState, key: string) => unknown;
  /** Return the action to dispatch to write `value` at `key`. */
  write: (key: string, value: unknown) => AnyAction;
  /** Persistence tier used for UI badges. */
  persistence: SettingsPersistence;
};

/**
 * Read a dotted key (e.g. "prompts.defaultTemperature") from an object by
 * walking dots; returns undefined if any step is missing.
 */
function readDotted(obj: unknown, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

export const sliceBindings: Record<string, SliceBinding> = {
  // ── userPreferences — 16 modules; key = "module.preference" ───────────────
  userPreferences: {
    read: (state, key) => readDotted(state.userPreferences, key),
    write: (key, value) => {
      const [module, preference, ...rest] = key.split(".");
      if (!module || !preference) {
        throw new Error(
          `userPreferences write requires "module.preference" key, got "${key}"`,
        );
      }
      if (rest.length > 0) {
        throw new Error(
          `userPreferences does not support nested keys beyond module.preference (got "${key}")`,
        );
      }
      return setPreference({
        module: module as keyof UserPreferences,
        preference,
        value,
      });
    },
    persistence: "synced",
  },

  // ── theme — single "mode" field ───────────────────────────────────────────
  theme: {
    read: (state, key) => readDotted(state.theme, key),
    write: (key, value) => {
      if (key === "mode") {
        if (value !== "light" && value !== "dark") {
          throw new Error(`theme.mode must be "light" | "dark", got ${value}`);
        }
        return setMode(value as "light" | "dark");
      }
      if (key === "toggle") return toggleMode();
      throw new Error(`theme has no writable key "${key}"`);
    },
    persistence: "synced",
  },

  // ── adminPreferences — flagged local-only until migrated ──────────────────
  adminPreferences: {
    read: (state, key) => readDotted(state.adminPreferences, key),
    write: (key, value) => {
      if (key === "serverOverride") return setServerOverride(value as never);
      if (key === "customServerUrl") return setCustomServerUrl(value as string);
      if (key === "clear") return clearAdminPreferences();
      throw new Error(`adminPreferences has no writable key "${key}"`);
    },
    persistence: "local-only",
  },

  // ── layout — not yet synced; tracks shell layout preference ───────────────
  layout: {
    read: (state, key) => readDotted(state.layout, key),
    write: (key, value) => {
      if (key === "isInWindow") return setIsInWindow(Boolean(value));
      if (key === "layoutStyle")
        return setLayoutStyle(value as "normal" | "extendedBottom" | "window");
      throw new Error(`layout has no writable key "${key}"`);
    },
    persistence: "local-only",
  },

  // ── windowManager — fully transient. Only the global hidden flag and the
  // "restore all" action are exposed here. `minimizeAll` needs viewport
  // dimensions and must be dispatched directly by its caller.
  windowManager: {
    read: (state, key) => readDotted(state.windowManager, key),
    write: (key) => {
      if (key === "toggleHidden") return toggleWindowsHidden();
      if (key === "restoreAll") return restoreAll();
      throw new Error(`windowManager has no writable key "${key}"`);
    },
    persistence: "session",
  },
};

/**
 * Parse a dotted settings path into its slice + key parts.
 * "theme.mode" → { slice: "theme", key: "mode" }
 * "userPreferences.prompts.defaultTemperature" → { slice: "userPreferences", key: "prompts.defaultTemperature" }
 */
export function parseSettingsPath(path: string): {
  slice: string;
  key: string;
} {
  const firstDot = path.indexOf(".");
  if (firstDot === -1) {
    throw new Error(`Invalid settings path "${path}" — missing slice prefix`);
  }
  return {
    slice: path.slice(0, firstDot),
    key: path.slice(firstDot + 1),
  };
}

export function getSliceBinding(slice: string): SliceBinding {
  const binding = sliceBindings[slice];
  if (!binding) {
    throw new Error(
      `No settings binding registered for slice "${slice}". Add one to features/settings/slice-bindings.ts.`,
    );
  }
  return binding;
}
