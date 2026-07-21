import { AlertTriangle, CheckCircle } from "lucide-react";
import type { MetaEvaluation } from "./metrics";

/**
 * MetaRecommendations — the canonical issues/success list for a meta
 * title + description evaluation. Purely presentational; give it the two
 * evaluations and it renders the warnings (or the all-clear lines).
 *
 * Consumed by the Metadata Analyzer (public page + window panel) and any
 * surface that shows SERP guidance. `compact` tightens spacing for inline
 * embeds (e.g. the marketing page workspace).
 */
export interface MetaRecommendationsProps {
  titleEval?: MetaEvaluation | null;
  descriptionEval?: MetaEvaluation | null;
  /** Hide the success lines and show only problems. */
  issuesOnly?: boolean;
  compact?: boolean;
}

export function MetaRecommendations({
  titleEval,
  descriptionEval,
  issuesOnly = false,
  compact = false,
}: MetaRecommendationsProps) {
  const rowClass = compact ? "gap-2 text-xs" : "gap-2.5 text-xs";
  const iconClass = compact
    ? "mt-0.5 h-3 w-3 shrink-0"
    : "mt-0.5 h-3.5 w-3.5 shrink-0";

  const renderField = (
    evaluation: MetaEvaluation | null | undefined,
    successText: string,
  ) => {
    if (!evaluation || evaluation.charCount === 0) return null;
    if (evaluation.issues.length) {
      return evaluation.issues.map((issue) => (
        <div key={issue} className={`flex items-start text-warning ${rowClass}`}>
          <AlertTriangle className={iconClass} />
          <span>{issue}</span>
        </div>
      ));
    }
    if (issuesOnly) return null;
    return (
      <div className={`flex items-start text-success ${rowClass}`}>
        <CheckCircle className={iconClass} />
        <span>{successText}</span>
      </div>
    );
  };

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {renderField(
        titleEval,
        "Title looks great — within pixel and character limits on all devices.",
      )}
      {renderField(
        descriptionEval,
        "Description looks great — within pixel and character limits on all devices.",
      )}
    </div>
  );
}
