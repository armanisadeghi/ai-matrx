// features/education/tutor/settings.ts
//
// Per-learner AI Tutor preferences — teaching mode (Socratic vs Direct) and
// personality/style — that tune every tutor conversation (VISION §4). These
// ride into the tutor agent as launch variables (`teaching_mode`,
// `personality_style`), so the tutor teaches the way the learner asked.
//
// Persistence lives on the DURABLE platform settings system
// (`userPreferences.tutor`, features/settings) — synced across devices (IDB +
// localStorage mirror + Supabase), NOT per-browser localStorage. This module
// owns the tutor-domain VOCABULARY (the unions + defaults, the single source of
// truth the userPreferences slice type-imports) plus the non-React accessor and
// the one-time localStorage→durable migration. React surfaces read/write via
// `useSetting("userPreferences.tutor.*")`; non-React callers (grounding) use
// `getTutorSettings()`.

import { getStore } from "@/lib/redux/store";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";

export type TutorTeachingMode = "Socratic" | "Direct";
export type TutorPersonalityStyle =
  | "Encouraging & Step-by-Step"
  | "Challenging & High-Level"
  | "Balanced";

export interface TutorSettings {
  teachingMode: TutorTeachingMode;
  personalityStyle: TutorPersonalityStyle;
}

export const TUTOR_TEACHING_MODES: TutorTeachingMode[] = ["Socratic", "Direct"];
export const TUTOR_PERSONALITY_STYLES: TutorPersonalityStyle[] = [
  "Encouraging & Step-by-Step",
  "Challenging & High-Level",
  "Balanced",
];

export const DEFAULT_TUTOR_SETTINGS: TutorSettings = {
  teachingMode: "Socratic",
  personalityStyle: "Encouraging & Step-by-Step",
};

function isTeachingMode(v: unknown): v is TutorTeachingMode {
  return v === "Socratic" || v === "Direct";
}
function isPersonalityStyle(v: unknown): v is TutorPersonalityStyle {
  return (
    v === "Encouraging & Step-by-Step" ||
    v === "Challenging & High-Level" ||
    v === "Balanced"
  );
}

/**
 * Read the learner's tutor settings from the durable store. Non-React accessor
 * (grounding assembly runs outside a component). Runs the one-time legacy
 * migration first so a learner who saved a preference before the durable
 * cutover never loses it — even if they never open the settings panel.
 */
export function getTutorSettings(): TutorSettings {
  migrateLegacyTutorSettings();
  const tutor = getStore().getState().userPreferences.tutor;
  return {
    teachingMode: isTeachingMode(tutor?.teachingMode)
      ? tutor.teachingMode
      : DEFAULT_TUTOR_SETTINGS.teachingMode,
    personalityStyle: isPersonalityStyle(tutor?.personalityStyle)
      ? tutor.personalityStyle
      : DEFAULT_TUTOR_SETTINGS.personalityStyle,
  };
}

// ── One-time localStorage → durable migration ────────────────────────────────
//
// The setting used to live in this localStorage key (per-browser only). We read
// it ONCE, seed the durable pref if the learner had customized it, then delete
// the key so it can never shadow-revive. Idempotent + guarded so it's a cheap
// no-op after the first call, regardless of which surface triggers it first.

const LEGACY_STORAGE_KEY = "education.tutor.settings";
let migrationDone = false;

/** Migrate a legacy localStorage tutor setting onto the durable store, once. */
export function migrateLegacyTutorSettings(): void {
  if (migrationDone || typeof window === "undefined") return;
  migrationDone = true;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return; // blocked localStorage — nothing to migrate
  }
  if (!raw) return;

  let parsed: Partial<TutorSettings> = {};
  try {
    parsed = JSON.parse(raw) as Partial<TutorSettings>;
  } catch {
    // Corrupt value — drop it so it can't recur.
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }

  const store = getStore();
  const patches: { preference: "teachingMode" | "personalityStyle"; value: string }[] = [];
  if (isTeachingMode(parsed.teachingMode)) {
    patches.push({ preference: "teachingMode", value: parsed.teachingMode });
  }
  if (isPersonalityStyle(parsed.personalityStyle)) {
    patches.push({ preference: "personalityStyle", value: parsed.personalityStyle });
  }
  // Only seed durable prefs that are still at their default — never clobber a
  // value the sync engine already hydrated from another device.
  const current = store.getState().userPreferences.tutor;
  for (const p of patches) {
    if (current?.[p.preference] === DEFAULT_TUTOR_SETTINGS[p.preference]) {
      store.dispatch(
        setPreference({ module: "tutor", preference: p.preference, value: p.value }),
      );
    }
  }
  if (patches.length > 0) {
    // Loud: a recovery/migration firing is worth a breadcrumb (CLAUDE.md).
    console.info(
      "[education.tutor] Migrated tutor settings from localStorage to the " +
        "durable settings system (userPreferences.tutor).",
    );
  }
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
