// features/education/spoken-practice/agents.ts
//
// THE single source of truth for the live Spoken Practice agent ids.
// Authored + verified in-system (agent_author + agent_run, gemini-3.5-flash,
// tools disabled); see FEATURE.md for the contracts. These permanent ids track
// the latest published version, so prompts/rubrics can be tuned in-system with
// no code change (same convention as FC_AGENTS / ASSESSMENT_AGENTS).
//
// Spoken Practice owns THREE DEDICATED, MODE-AWARE agents (examiner / interviewer
// / debate-judge). It does NOT reuse the FastFire flashcard grader or the
// flashcard batch-review agent: those are tuned for card drills and leaked
// tool-narration + "flashcard" framing into the user-facing oral-exam review
// (adversarial-review GAP 1). It still REUSES the grading-core primitives
// (upload + runSpokenGrader + coerceSpokenGrade), the study spine, and the trust
// stack unchanged — only the AGENTS are dedicated.

export const SPOKEN_PRACTICE_AGENTS = {
  /**
   * mode, focus, study_material, difficulty, count
   *   → { session_title, intro, prompts[{ prompt, reference_answer, rubric,
   *       focus_area, confidence }] }
   * Designs a grounded oral-exam / interview / debate session. confidence is
   * honest per-prompt grounding ('grounded' | 'inferred' | 'not_in_material').
   */
  designSession: "e1d9c1f7-c523-4e7a-8090-a74495cdc58f",

  /**
   * focus (target language + theme), difficulty, count, study_material
   *   → the SAME plan shape as designSession, but each `prompt` embeds the exact
   *     TARGET-LANGUAGE phrase to say (in guillemets + English gloss) and
   *     `reference_answer` is the clean expected utterance. The dedicated
   *     designer for the `pronunciation` mode (foreign-language practice); keeps
   *     the three shipped modes' designer untouched. Consumed by
   *     `coercePracticePlan` unchanged (same field names).
   */
  designLanguageSession: "e681a37f-5e9f-47c0-9f42-3b6caeeb9e88",

  /**
   * front (prompt), back (reference answer), rubric (mode-framed), seconds_allowed
   * (+ audio message part) → unified spoken grade JSON (result, score, rubric,
   * transcript, audio_feedback, missing, misconception). Mode is conveyed via the
   * first line of `rubric`; the grader frames feedback as examiner/interviewer/
   * judge and never says "flashcard". Consumed by `coerceSpokenGrade` unchanged.
   */
  gradeAnswer: "58090ae0-316c-44a9-ae0f-1d621e1946bc",

  /**
   * front (target phrase shown), back (clean expected utterance), rubric
   * (mode-framed), seconds_allowed (+ audio message part) → the unified spoken
   * grade JSON PLUS a `pronunciation` object { accuracy, fluency,
   * intelligibility, prosody, notes }. The DEDICATED grader for the
   * `pronunciation` mode: scores BOTH content correctness AND pronunciation/
   * fluency, judged HOLISTICALLY from the recording (our STT gives a transcript,
   * not phoneme scores — the grader is honest about that, no phoneme-perfect
   * claims). Consumed by `coerceSpokenGrade` unchanged (pronunciation is an
   * optional extra on the same `SpokenGrade` adapter).
   */
  gradePronunciation: "c028777d-c988-4b98-a6ae-141a88512596",

  /**
   * mode, transcript (prompt + spoken answer + verdict per turn), aggregate
   *   → { summary, strengths[], weaknesses[] }
   * The dedicated, MODE-AWARE end-of-session review (examiner / interviewer /
   * debate-judge). Tools disabled — reasons ONLY over the passed transcript, so it
   * can never narrate DB discovery. Same output shape the summary renderer reads.
   */
  reviewSession: "c51f73a5-5748-4789-994d-3dbcaba63bca",
} as const;

export type SpokenPracticeAgentKey = keyof typeof SPOKEN_PRACTICE_AGENTS;

/** The study-spine item_type every graded spoken-practice prompt records under. */
export const SPOKEN_PROMPT_ITEM_TYPE = "spoken_prompt" as const;
