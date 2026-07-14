// features/education/spoken-practice/constants.ts
//
// Per-mode presentation + copy for the three spoken-practice modes, plus the
// shared runner tunables. The mode config is the ONE place mode-specific labels,
// icons, and setup copy live — components read from here, never hardcode.

import { GraduationCap, Briefcase, Scale, type LucideIcon } from "lucide-react";
import type { SpokenPracticeMode } from "./types";

export interface ModeConfig {
  mode: SpokenPracticeMode;
  /** URL query value + human label. */
  label: string;
  icon: LucideIcon;
  /** One-line pitch on the mode card. */
  tagline: string;
  /** The examiner/interviewer/moderator persona noun, for running-UI chrome. */
  persona: string;
  /** Label for the required `focus` field, tuned to the mode. */
  focusLabel: string;
  focusPlaceholder: string;
  /** Whether grounding in one of the student's decks is offered/encouraged. */
  offersDeckGrounding: boolean;
  /** The verb shown on the answer button ("Answer" / "Respond" / "Argue"). */
  answerVerb: string;
  /** Short "how it works" line on the setup screen. */
  howItWorks: string;
}

export const MODE_CONFIG: Record<SpokenPracticeMode, ModeConfig> = {
  oral_exam: {
    mode: "oral_exam",
    label: "Oral Exam",
    icon: GraduationCap,
    tagline: "A viva voce examiner quizzes you on your material — out loud.",
    persona: "Examiner",
    focusLabel: "Subject",
    focusPlaceholder: "e.g. The cardiac cycle and heart physiology",
    offersDeckGrounding: true,
    answerVerb: "Answer",
    howItWorks:
      "The examiner asks escalating questions on your subject. You answer aloud; each answer is graded on accuracy, articulation, and completeness, and an examiner's summary closes the session.",
  },
  interview_prep: {
    mode: "interview_prep",
    label: "Interview Prep",
    icon: Briefcase,
    tagline: "A mock interviewer for college, med school, or a job.",
    persona: "Interviewer",
    focusLabel: "Interview type & role",
    focusPlaceholder:
      "e.g. Medical school admissions interview · Entry-level frontend role",
    offersDeckGrounding: false,
    answerVerb: "Respond",
    howItWorks:
      "The interviewer mixes behavioral and role questions. You respond aloud; feedback covers content substance AND delivery (clarity, structure, conciseness).",
  },
  debate: {
    mode: "debate",
    label: "Debate",
    icon: Scale,
    tagline: "Argue a position — the AI stress-tests your reasoning.",
    persona: "Opponent",
    focusLabel: "Resolution / topic",
    focusPlaceholder:
      "e.g. Universities should replace exams with project-based assessment",
    offersDeckGrounding: false,
    answerVerb: "Argue",
    howItWorks:
      "You're assigned a position and open your case. Later prompts are pointed counter-challenges that steelman the other side. Grading judges argument structure, evidence, and reasoning.",
  },
};

/** Prompt-count bounds (mirrors the designer agent's number widget). */
export const MIN_PROMPTS = 3;
export const MAX_PROMPTS = 12;
export const DEFAULT_PROMPTS = 5;

/**
 * Safety cap on a single spoken answer. Spoken-practice answers are long-form
 * (an argument, a viva explanation), so there is NO short per-answer timer like
 * FastFire — the learner presses "Done" to submit. This is only the runaway
 * guard that auto-submits if they never do.
 */
export const ANSWER_MAX_SECONDS = 150;

/** Difficulty options offered in setup (free-text `allowOther` on the agent). */
export const DIFFICULTY_OPTIONS = [
  "High School",
  "Undergraduate",
  "Graduate / Advanced",
  "MCAT / Professional Exam",
  "Entry-Level Job",
  "Senior / Expert Role",
] as const;
