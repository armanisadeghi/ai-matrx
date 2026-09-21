"use client";

/**
 * DecisionAnswersBlock — the block-registry face of `decision_answers`.
 *
 * A THIN adapter: the bridge in `features/content-ir/kinds/decision-answers.ts`
 * hands the payload over verbatim, this reads it through THE reader and
 * renders THE primitive (`DecisionAnswers`). A second answers renderer here
 * would be the one that quietly drops the method tag.
 */

import { DecisionAnswers } from "@/features/agents/decision-answers/DecisionAnswers";
import { readDecisionAnswers } from "@/features/agents/decision-answers/read";

export interface DecisionAnswersBlockProps {
  serverData: Record<string, unknown>;
}

export default function DecisionAnswersBlock({
  serverData,
}: DecisionAnswersBlockProps) {
  const view = readDecisionAnswers(serverData.payload);

  if (!view) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
      >
        <p className="font-medium text-destructive">
          These decision answers could not be read
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The payload says it is `decision_answers` but carries no `answers`
          object. The raw value is below so nothing is hidden.
        </p>
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(serverData.payload, null, 2)}
        </pre>
      </div>
    );
  }

  return <DecisionAnswers view={view} />;
}
