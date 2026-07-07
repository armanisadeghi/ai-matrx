// features/education/tutor/settings.ts
//
// Per-learner AI Tutor preferences — teaching mode (Socratic vs Direct) and
// personality/style — that tune every tutor conversation (VISION §4). These
// ride into the tutor agent as launch variables (`teaching_mode`,
// `personality_style`), so the tutor teaches the way the learner asked.
//
// Persistence is localStorage today (per-browser, instant, no round-trip). The
// getter/setter are the single access point, so the backend can later be
// swapped for the durable settings system without touching any caller.

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

const STORAGE_KEY = "education.tutor.settings";

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

/** Read the learner's tutor settings (defaults when unset / SSR / blocked). */
export function getTutorSettings(): TutorSettings {
  if (typeof window === "undefined") return { ...DEFAULT_TUTOR_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TUTOR_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<TutorSettings>;
    return {
      teachingMode: isTeachingMode(parsed.teachingMode)
        ? parsed.teachingMode
        : DEFAULT_TUTOR_SETTINGS.teachingMode,
      personalityStyle: isPersonalityStyle(parsed.personalityStyle)
        ? parsed.personalityStyle
        : DEFAULT_TUTOR_SETTINGS.personalityStyle,
    };
  } catch {
    return { ...DEFAULT_TUTOR_SETTINGS };
  }
}

/** Persist a partial update to the learner's tutor settings; returns the merged result. */
export function setTutorSettings(patch: Partial<TutorSettings>): TutorSettings {
  const next = { ...getTutorSettings(), ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // Notify same-tab listeners (storage event only fires cross-tab).
      window.dispatchEvent(new CustomEvent("education-tutor-settings-changed"));
    } catch {
      // best-effort — a blocked localStorage just keeps defaults
    }
  }
  return next;
}
