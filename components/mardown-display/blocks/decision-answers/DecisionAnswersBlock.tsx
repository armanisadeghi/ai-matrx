"use client";

/**
 * DecisionAnswersBlock — the block-registry face of `decision_answers`.
 *
 * A THIN adapter: the bridge in `features/content-ir/kinds/decision-answers.ts`
 * hands the payload over verbatim, this reads it through THE reader and
 * renders THE primitive (`DecisionAnswers`). A second answers renderer here
 * would be the one that quietly drops the method tag.
 */

import { DecisionAnswers } from "@ai-matrx/chat/agents/decision-answers/DecisionAnswers";
import { readDecisionAnswers } from "@ai-matrx/agents/presentation/decision-answers";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";

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
        {/* The kind's broken state: what arrived, drawn by the generic
            structured floor (its raw data one explicit click away) — never a
            raw JSON dump (Arman, 2026-09-30). */}
        <StructuredValueView
          className="mt-2"
          value={serverData.payload}
          kind="decision_answers"
          note="could not be read"
        />
        <ErrorAlchemyMenu className="ml-auto" />
      </div>
    );
  }

  return <DecisionAnswers view={view} />;
}
