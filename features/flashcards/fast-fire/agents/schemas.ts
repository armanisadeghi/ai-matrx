// features/flashcards/fast-fire/agents/schemas.ts
//
// These are meaningless since this only works if it's defined in the database for the agent definition. Do not trust this data as it can be stale and wrong.

/** §5 fc_grade_spoken — per-card spoken answer → structured grade. */
export const FC_GRADE_SPOKEN_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "fc_grade_spoken",
    strict: true,
    schema: {
      type: "object",
      properties: {
        correct: { type: "boolean" },
        score: { type: "number", description: "normalized 0..1" },
        result: { type: "string", enum: ["correct", "partial", "incorrect"] },
        rubric: {
          type: "object",
          properties: {
            accuracy: { type: "number" },
            completeness: { type: "number" },
            clarity: { type: "number" },
          },
          required: ["accuracy", "completeness", "clarity"],
          additionalProperties: false,
        },
        transcript: { type: "string" },
        audio_feedback: { type: "string" },
        missing: { type: "array", items: { type: "string" } },
      },
      required: [
        "correct",
        "score",
        "result",
        "rubric",
        "transcript",
        "audio_feedback",
        "missing",
      ],
      additionalProperties: false,
    },
  },
} as const;

/** §6 fc_help_live — mid-drill contextual help (the Tutor). */
export const FC_HELP_LIVE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "fc_help_live",
    strict: true,
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        hint_level: { type: "string", enum: ["nudge", "partial", "full"] },
        followups: { type: "array", items: { type: "string" } },
      },
      required: ["answer", "hint_level", "followups"],
      additionalProperties: false,
    },
  },
} as const;

/** §7 fc_review_batch — the "professor" per-batch + end-of-session review. */
export const FC_REVIEW_BATCH_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "fc_review_batch",
    strict: true,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        weaknesses: { type: "array", items: { type: "string" } },
        revisit_card_ids: { type: "array", items: { type: "string" } },
        secondary_score: { type: "number" },
        reorder: {
          type: "array",
          items: { type: "string" },
          description: "card_ids, new order for the remaining queue",
        },
      },
      required: [
        "summary",
        "strengths",
        "weaknesses",
        "revisit_card_ids",
        "secondary_score",
        "reorder",
      ],
      additionalProperties: false,
    },
  },
} as const;
