// features/education/spoken-practice/constants.ts
//
// Per-mode presentation + copy for the four spoken-practice modes, plus the
// shared runner tunables. The mode config is the ONE place mode-specific labels,
// icons, and setup copy live — components read from here, never hardcode.
//
// The copy and the setup vocabularies themselves live one module down, in
// `./vocabulary.ts`, which carries no icon imports so the surface manifest can
// read them without pulling `lucide-react` into the registry's graph. This file
// adds the icons and re-exports the rest, so every existing importer is
// unchanged.

import {
  GraduationCap,
  Briefcase,
  Scale,
  Languages,
  type LucideIcon,
} from "lucide-react";
import type { SpokenPracticeMode } from "./types";
import { MODE_VOCABULARY, type ModeVocabulary } from "./vocabulary";

export {
  ANSWER_MAX_SECONDS,
  DEFAULT_PROMPTS,
  DIFFICULTY_OPTIONS,
  MAX_PROMPTS,
  MIN_PROMPTS,
  MODE_VOCABULARY,
  PROMPT_COUNT_OPTIONS,
} from "./vocabulary";
export type { ModeVocabulary } from "./vocabulary";

export interface ModeConfig extends ModeVocabulary {
  icon: LucideIcon;
}

const MODE_ICONS: Record<SpokenPracticeMode, LucideIcon> = {
  oral_exam: GraduationCap,
  interview_prep: Briefcase,
  debate: Scale,
  pronunciation: Languages,
};

export const MODE_CONFIG: Record<SpokenPracticeMode, ModeConfig> = {
  oral_exam: { ...MODE_VOCABULARY.oral_exam, icon: MODE_ICONS.oral_exam },
  interview_prep: {
    ...MODE_VOCABULARY.interview_prep,
    icon: MODE_ICONS.interview_prep,
  },
  debate: { ...MODE_VOCABULARY.debate, icon: MODE_ICONS.debate },
  pronunciation: {
    ...MODE_VOCABULARY.pronunciation,
    icon: MODE_ICONS.pronunciation,
  },
};
