// features/education/tutor/types.ts
//
// The AI Tutor's canonical VOCABULARY — the two tunable knobs (teaching mode +
// personality style), their unions, their allowed-value lists, the defaults,
// and the type guards. ONE source of truth, imported by everything that needs
// to name or validate a tutor style:
//
//   • `settings.ts`              — re-exports these and owns the durable
//                                  read/write path (`userPreferences.tutor.*`).
//   • `TutorSettingsPanel.tsx`   — renders the lists as the learner's options.
//   • `userPreferences` slice    — type-imports the unions so the stored
//                                  preference can't drift from the vocabulary.
//   • the `education-tutor` surface manifest + its write handlers — the enum
//     spelled into the model-facing target description and validated against
//     the SAME constant, so an agent can never be told one vocabulary and
//     checked against another.
//
// DELIBERATELY DEPENDENCY-FREE. This module must stay importable from a plain
// node/tsx script (`pnpm check:surface-drift` imports every surface manifest),
// so it may never reach for the Redux store, React, or anything that does.
// That is exactly why the vocabulary lives here and not in `settings.ts`,
// which imports `@/lib/redux/store` for its non-React accessor.

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

export function isTutorTeachingMode(v: unknown): v is TutorTeachingMode {
  return v === "Socratic" || v === "Direct";
}

export function isTutorPersonalityStyle(v: unknown): v is TutorPersonalityStyle {
  return (
    v === "Encouraging & Step-by-Step" ||
    v === "Challenging & High-Level" ||
    v === "Balanced"
  );
}
