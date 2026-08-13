export const AI_VISIBILITY_EVIDENCE_VIEWS = [
  { id: "claims", label: "Claims" },
  { id: "sources", label: "Sources" },
  { id: "signals", label: "Decision signals" },
  { id: "history", label: "History" },
] as const;

export type AiVisibilityEvidenceView =
  (typeof AI_VISIBILITY_EVIDENCE_VIEWS)[number]["id"];

export function isAiVisibilityEvidenceView(
  value: string,
): value is AiVisibilityEvidenceView {
  return AI_VISIBILITY_EVIDENCE_VIEWS.some((view) => view.id === value);
}
