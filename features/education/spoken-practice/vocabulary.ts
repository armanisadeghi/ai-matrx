// features/education/spoken-practice/vocabulary.ts
//
// The icon-free half of the spoken-practice constants: the per-mode copy and
// the setup form's real vocabularies (difficulty levels, prompt counts, the
// answer guard).
//
// It is split out of `constants.ts` because the
// `matrx-user/education-practice-oral` MANIFEST reads these to spell its write
// target's enums out to the agent, and the surface registry is imported from
// server components — `constants.ts` pulls in `lucide-react` icons, which have
// no business in that graph. Same split `education/assessment/data/types.ts`
// and `scraper/scrape-command.ts` make for their manifests.
//
// The rule this buys: the picker the learner sees, the enum the agent is told
// about, and the check the write handler runs all read the ONE constant here.
// `constants.ts` re-exports every name below, so existing importers are
// unaffected.

import type { SpokenPracticeMode } from "./types";

/** Per-mode presentation + copy, with no icon (see ModeConfig in constants.ts). */
export interface ModeVocabulary {
  mode: SpokenPracticeMode;
  /** URL query value + human label. */
  label: string;
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

export const MODE_VOCABULARY: Record<SpokenPracticeMode, ModeVocabulary> = {
  oral_exam: {
    mode: "oral_exam",
    label: "Oral Exam",
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
  pronunciation: {
    mode: "pronunciation",
    label: "Language & Pronunciation",
    tagline: "Say phrases in your target language — graded on pronunciation too.",
    persona: "Language coach",
    focusLabel: "Language & focus",
    focusPlaceholder:
      "e.g. Spanish — greetings and everyday courtesy · French — ordering at a café",
    offersDeckGrounding: true,
    answerVerb: "Say it",
    howItWorks:
      "A language coach shows you a target-language phrase to say aloud. Each answer is graded on BOTH what you said (content) AND how you said it — pronunciation, fluency, intelligibility, and prosody, judged from your recording (holistic, not phoneme-level).",
  },
};

/** Prompt-count bounds (mirrors the designer agent's number widget). */
export const MIN_PROMPTS = 3;
export const MAX_PROMPTS = 12;
export const DEFAULT_PROMPTS = 5;

/**
 * The prompt counts the setup form actually OFFERS. Narrower than
 * MIN_PROMPTS..MAX_PROMPTS on purpose: those are the designer agent's bounds,
 * this is the picker's vocabulary — and it is the list the write handler
 * validates against, so an agent can never stage a count with no matching
 * option in the select the learner is looking at.
 */
export const PROMPT_COUNT_OPTIONS = [3, 4, 5, 6, 8, 10] as const;

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
