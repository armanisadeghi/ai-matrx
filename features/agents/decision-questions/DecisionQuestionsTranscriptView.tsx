"use client";

import { readQuestions, type DecisionQuestionSpec } from "./types";

/**
 * The questions a decision turn PUT, as they read in a transcript (live and
 * after reload). The builder owns the editor; this is the read-only record of
 * the ask, so the Answers card below it has its questions beside it.
 */
function criteriaSummary(q: DecisionQuestionSpec): string | null {
  const c = q.criteria;
  if (!c) return null;
  if (Array.isArray(c)) return c.map((level, i) => `${i}: ${level}`).join(" · ");
  if (q.type === "noul") {
    const noul = c as { true?: string; false?: string };
    return [noul.true && `Yes: ${noul.true}`, noul.false && `No: ${noul.false}`]
      .filter(Boolean)
      .join(" · ");
  }
  return Object.keys(c).join(" · ");
}

const TYPE_LABEL: Record<string, string> = {
  noul: "Yes / no",
  choice: "Choice",
  score: "Score",
};

export function DecisionQuestionsTranscriptView({
  payload,
}: {
  payload: Record<string, unknown> | null | undefined;
}) {
  const questions = readQuestions(payload);
  return (
    <div className="my-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs">
      <div className="mb-1.5 font-medium text-foreground">
        Questions {questions.length > 0 ? `(${questions.length})` : ""}
      </div>
      {questions.length === 0 ? (
        <div className="text-muted-foreground">This decision part carries no questions.</div>
      ) : (
        <ol className="space-y-1.5">
          {questions.map((q, i) => {
            const summary = criteriaSummary(q);
            return (
              <li key={`${q.name}-${i}`} className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-foreground">{q.name}</span>
                  <span className="text-muted-foreground">{TYPE_LABEL[q.type] ?? q.type}</span>
                </div>
                {q.instructions ? <div className="text-foreground/90">{q.instructions}</div> : null}
                {summary ? <div className="text-muted-foreground">{summary}</div> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
