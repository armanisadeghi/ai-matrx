/** Canonical response-review rubric shared by feedback controls and scopes. */
export interface FeedbackMetricDefinition {
  id: string;
  label: string;
  hint: string;
}

export const RESPONSE_FEEDBACK_METRICS: readonly FeedbackMetricDefinition[] = [
  {
    id: "accuracy",
    label: "Accuracy",
    hint: "Are the facts / claims correct? Any hallucinations?",
  },
  {
    id: "relevance",
    label: "Relevance",
    hint: "Does the response actually answer the request?",
  },
  {
    id: "completeness",
    label: "Completeness",
    hint: "Are all parts of the request addressed, with no gaps?",
  },
  {
    id: "instruction_following",
    label: "Instruction following",
    hint: "Did the agent honor every explicit instruction (format, scope, tone)?",
  },
  {
    id: "reasoning",
    label: "Reasoning",
    hint: "Is the logical flow sound? Are conclusions justified?",
  },
  {
    id: "clarity",
    label: "Clarity",
    hint: "Is the writing clear, well-structured, and easy to scan?",
  },
  {
    id: "conciseness",
    label: "Conciseness",
    hint: "Right length for the task — no padding, no terseness that omits.",
  },
];
