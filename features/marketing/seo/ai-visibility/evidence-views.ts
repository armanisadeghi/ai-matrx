import {
  AI_VISIBILITY_SUBVIEWS,
  isMarketingSubView,
} from "@/features/marketing/lib/site-subviews";

type AiVisibilitySubView = (typeof AI_VISIBILITY_SUBVIEWS)[number]["id"];

/**
 * The saved-evidence tables the AI-visibility workspace can render.
 *
 * `panels` is deliberately NOT one of them: it reads a different table
 * (`seo.ai_visibility_panel` + the responses its questions collected) and
 * answers a different question — presence over time rather than the evidence
 * behind one run — so it gets its own component instead of a fifth column set
 * inside the evidence table.
 */
export type AiVisibilityEvidenceView = Exclude<
  AiVisibilitySubView,
  "overview" | "panels"
>;

export function isAiVisibilityEvidenceView(
  value: string,
): value is AiVisibilityEvidenceView {
  return (
    value !== "overview" &&
    value !== "panels" &&
    isMarketingSubView("ai-visibility", value)
  );
}

export function isAiVisibilityPanelsView(value: string): boolean {
  return value === "panels";
}
