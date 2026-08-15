import {
  AI_VISIBILITY_SUBVIEWS,
  isMarketingSubView,
} from "@/features/marketing/lib/site-subviews";

type AiVisibilitySubView = (typeof AI_VISIBILITY_SUBVIEWS)[number]["id"];
export type AiVisibilityEvidenceView = Exclude<
  AiVisibilitySubView,
  "overview"
>;

export function isAiVisibilityEvidenceView(
  value: string,
): value is AiVisibilityEvidenceView {
  return value !== "overview" && isMarketingSubView("ai-visibility", value);
}
