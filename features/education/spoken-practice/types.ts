// features/education/spoken-practice/types.ts
//
// Types for the Spoken Practice surface (Education Hub). The session is modelled
// on the shared study spine — NO new table: a `study_session` (mode = one of the
// three modes) whose `settings.prompts[]` jsonb holds the generated plan, plus
// one `study_attempt` per spoken answer (item_type 'spoken_prompt', response_kind
// 'spoken'). See FEATURE.md.

import type {
  GradeResult,
  TrustConfidence,
  TrustEnvelope,
} from "@/features/education/trust/types";
import type { SpokenGrade } from "@/features/flashcards/fast-fire/agents/grading-core";

/**
 * The signature spoken-practice modes. Doubles as the study-spine `mode`/`method`
 * (free-form on the spine — extending this vocabulary is a value, never a
 * migration). `pronunciation` is the foreign-language / pronunciation mode: the
 * student says a target-language phrase aloud and is graded on BOTH content
 * correctness AND pronunciation/fluency (see `PronunciationAssessment`).
 */
export type SpokenPracticeMode =
  | "oral_exam"
  | "interview_prep"
  | "debate"
  | "pronunciation";

export const SPOKEN_PRACTICE_MODES: SpokenPracticeMode[] = [
  "oral_exam",
  "interview_prep",
  "debate",
  "pronunciation",
];

export function isSpokenPracticeMode(v: string): v is SpokenPracticeMode {
  return (SPOKEN_PRACTICE_MODES as string[]).includes(v);
}

/**
 * The grounding source a session is built on. `set` grounds in the student's own
 * deck (the headline capability); `topic` covers a typed subject or pasted
 * material. `material` is the text handed to the designer agent (may be empty).
 */
export interface PracticeSource {
  kind: "set" | "topic";
  /** fc_set id when kind === 'set' — recorded as study_session.source_set_id. */
  setId?: string;
  /** Human label ("Cardiac Physiology deck", "your pasted notes", the topic). */
  title: string;
  /** The grounding text passed to the designer as `study_material`. */
  material: string;
}

/** One planned prompt: the agent's output + a client-minted id + assembled trust. */
export interface PracticePrompt {
  /** Client-minted uuid — the study-spine item_id this prompt records under. */
  id: string;
  prompt: string;
  referenceAnswer: string;
  rubric: string;
  focusArea: string;
  confidence: TrustConfidence;
  trust: TrustEnvelope;
}

/** The full designed session (agent output, normalized). */
export interface PracticePlan {
  sessionTitle: string;
  intro: string;
  prompts: PracticePrompt[];
}

/** What the setup form collects before a session starts. */
export interface PracticeConfig {
  mode: SpokenPracticeMode;
  /** The subject / interview type / debate resolution — the required steer. */
  focus: string;
  difficulty: string;
  count: number;
  source: PracticeSource | null;
}

/** The outcome of grading one prompt (kept in-memory for the summary). */
export interface PromptResult {
  promptId: string;
  result: GradeResult | "skipped";
  score: number;
  grade: SpokenGrade | null;
}

/** The live runner's phase machine. */
export type RunnerPhase =
  | "idle"
  | "generating"
  | "asking"
  | "answering"
  | "grading"
  | "result"
  | "reviewing"
  | "summary"
  | "error";
