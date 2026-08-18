// features/education/tutor/mandates.ts
//
// Mandate key for the conversational AI Tutor (P2). This is a MANDATE KEY, not
// an agent id: it resolves LIVE (system default → org binding → user binding)
// to whatever agent the DATABASE currently binds — agent identity (and the
// tutor's entire persona/prompt) never lives in code. Swap the agent at
// /agents/mandates; no code change, no deploy. See
// features/agents/mandates/FEATURE.md.
//
// The one-shot in-study help lanes (helpLive / reviewBatch / microCoach) live
// in FC_MANDATES (features/flashcards/data/mandates.ts) — they are flashcards
// study-mode lanes; the CONVERSATIONAL tutor below is the education-wide one.
// The realtime VOICE tutor is a separate mandate (`education.voice_tutor`,
// consumed by features/flashcards/components/study/VoiceTutorPanel.tsx).

export const EDU_TUTOR_MANDATES = {
  /**
   * The persistent, memory-carrying, grounded conversational tutor. A
   * streaming TEXT agent (markdown out) with NO user-facing variables —
   * grounding rides its declared context policies (learner_memory ·
   * study_material · teaching_mode · personality_style), filled silently by
   * EducationTutorClient every turn. Emits a hidden per-turn TrustEnvelope
   * (`<!--MATRX_TRUST_V1 …-->`) parsed by turnTrust.ts.
   */
  tutor: "education.tutor_message",
} as const;

export type EduTutorMandateKey = keyof typeof EDU_TUTOR_MANDATES;

/** The mandate every /education/tutor conversation resolves its agent through. */
export const TUTOR_MANDATE_KEY = EDU_TUTOR_MANDATES.tutor;
