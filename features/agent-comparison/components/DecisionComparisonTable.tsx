"use client";

/**
 * DecisionComparisonTable — question × agent, with the judge's verdict.
 *
 * Two agents answering the same questions is the one comparison a battle can
 * settle objectively, and it is the one a scroll of two message columns makes
 * impossible: the answers are ten lines apart, the probabilities are in
 * different places, and the question that actually split them is invisible.
 * So: one row per question, one cell per agent (answer + probability), a
 * DELTA column that says how far apart they are, and a verdict column where
 * the judge writes what was actually true.
 *
 * The verdict is the point. Without recorded ground truth, a battle produces
 * a preference; with it, a battle produces calibration data for every agent
 * version that answered.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { labelConversations } from "@/features/agents/decision-review/service";
import { ReviewAnswersLink } from "@/features/agents/decision-review/components/ReviewAnswersLink";
import {
  selectActiveBattleColumns,
  selectMountedBattleSetId,
} from "../shared/activeBattleColumns";
import { readAnswersFromContent } from "../decisions/readColumnAnswers";
import {
  loadDecisionVerdicts,
  saveDecisionVerdict,
  type DecisionVerdicts,
} from "../decisions/verdicts";
import {
  answerProbability,
  formatAnswerHeadline,
  METHOD_EXPLANATIONS,
  METHOD_LABELS,
  type DecisionAnswersView,
} from "@/features/agents/decision-answers/read";
import type { RootState } from "@/lib/redux/store";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

function percent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

interface ColumnAnswers {
  columnId: string;
  label: string;
  view: DecisionAnswersView | null;
}

/**
 * The latest assistant turn of each column, read for decision answers. The
 * selector walks backwards so a follow-up turn that was NOT a decision does
 * not blank a column that answered a moment ago.
 */
function selectColumnAnswers(
  byConversationId: RootState["messages"]["byConversationId"],
  conversationId: string,
) {
  const entry = byConversationId[conversationId];
  const ordered = entry?.orderedIds;
  const byId = entry?.byId;
  if (!ordered || !byId) return null;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const record = byId[ordered[i]];
    if (record?.role !== "assistant") continue;
    const view = readAnswersFromContent(record.content);
    if (view) return view;
  }
  return null;
}

function ColumnAnswerCell({
  view,
  questionName,
}: {
  view: DecisionAnswersView | null;
  questionName: string;
}) {
  const answer = view?.answers.find((a) => a.name === questionName);
  if (!answer) {
    const refusal = view?.refusals.find((r) => r.name === questionName);
    if (refusal) {
      return (
        <span className="text-[11px] text-amber-600 dark:text-amber-400">
          refused — {refusal.reason}
          <ErrorAlchemyMenu error={refusal.reason} />
        </span>
      );
    }
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const probability = answerProbability(answer);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-medium">{formatAnswerHeadline(answer)}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {percent(probability)}
      </span>
    </span>
  );
}

export function DecisionComparisonTable() {
  const dispatch = useAppDispatch();
  const columns = useAppSelector(selectActiveBattleColumns);
  const setId = useAppSelector(selectMountedBattleSetId);

  // One subscription to the message map (a stable reference between message
  // writes), then the matrix is derived. Mapping inside the selector would
  // mint a new array on every unrelated store write.
  const messagesByConversationId = useAppSelector(
    (state: RootState) => state.messages.byConversationId,
  );

  const answersByColumn: ColumnAnswers[] = useMemo(
    () =>
      columns.map((column, index) => ({
        columnId: column.columnId,
        label: column.label ?? `Agent ${index + 1}`,
        view: selectColumnAnswers(
          messagesByConversationId,
          column.conversationId,
        ),
      })),
    [columns, messagesByConversationId],
  );

  const answering = answersByColumn.filter((c) => c.view);

  // Every question any column answered, in the order the first one asked.
  const questionNames: string[] = [];
  for (const column of answering) {
    for (const answer of column.view?.answers ?? []) {
      if (!questionNames.includes(answer.name)) questionNames.push(answer.name);
    }
    for (const refusal of column.view?.refusals ?? []) {
      if (!questionNames.includes(refusal.name))
        questionNames.push(refusal.name);
    }
  }

  const [verdicts, setVerdicts] = useState<DecisionVerdicts>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState<string | null>(null);
  const [verdictError, setVerdictError] = useState<string | null>(null);

  useEffect(() => {
    if (!setId) {
      setVerdicts({});
      return;
    }
    let cancelled = false;
    loadDecisionVerdicts(setId)
      .then((loaded) => {
        if (!cancelled) setVerdicts(loaded);
      })
      .catch((error) => {
        console.error("[decision-verdicts] load failed", error);
        if (!cancelled)
          setVerdictError(
            "The verdicts already on this comparison could not be read. Anything you type now may overwrite them.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const commitVerdict = useCallback(
    async (questionName: string) => {
      if (!setId) return;
      const draft = drafts[questionName] ?? "";
      if (draft.trim() === (verdicts[questionName]?.answer ?? "")) return;
      setSavingName(questionName);
      setVerdictError(null);
      try {
        const next = await saveDecisionVerdict(setId, questionName, draft);
        setVerdicts(next);
        // The same truth labels every column's answer in the decision review
        // store (platform.judge_verdict), so a battle verdict feeds each
        // answering agent version's calibration.
        if (draft.trim()) {
          const conversationIds = answersByColumn
            .filter((c) => c.view?.answers.some((a) => a.name === questionName))
            .map(
              (c) =>
                columns.find((col) => col.columnId === c.columnId)
                  ?.conversationId,
            )
            .filter((id): id is string => Boolean(id));
          if (conversationIds.length > 0) {
            try {
              const labeled = await labelConversations(
                dispatch,
                conversationIds,
                questionName,
                draft,
              );
              const skipped = Object.values(labeled.skipped ?? {});
              if (skipped.length > 0) {
                setVerdictError(
                  `Saved on the comparison, but not recorded for calibration on ${skipped.length} column(s): ${skipped[0]}`,
                );
              }
            } catch (labelError) {
              console.error(
                "[decision-verdicts] calibration label failed",
                labelError,
              );
              setVerdictError(
                "Saved on the comparison, but not recorded for calibration — label it from Review answers instead.",
              );
            }
          }
        }
      } catch (error) {
        console.error("[decision-verdicts] save failed", error);
        setVerdictError(
          "That verdict was not saved. It is still in the box — try again, or copy it out before leaving.",
        );
      } finally {
        setSavingName(null);
      }
    },
    [setId, drafts, verdicts, answersByColumn, columns, dispatch],
  );

  if (answering.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        No column has returned decision answers yet.
      </p>
    );
  }

  const reviewAgentId = columns.find((c) => c.agentId)?.agentId ?? null;

  return (
    <div className="flex flex-col gap-2 p-2">
      {reviewAgentId && (
        <div className="flex justify-end">
          <ReviewAnswersLink agentId={reviewAgentId} force />
        </div>
      )}
      {answering.length < 2 && (
        <p className="text-[11px] text-muted-foreground">
          Only one column has answered — the delta fills in when a second one
          does.
        </p>
      )}

      {!setId && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Save this comparison before recording verdicts — an unsaved battle
            has nowhere to keep them.
          </span>
        </p>
      )}

      {verdictError && (
        <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{verdictError}</span>
          <ErrorAlchemyMenu error={verdictError} />
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-xs border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-medium py-1 pr-2">Question</th>
              {answering.map((column) => (
                <th
                  key={column.columnId}
                  className="text-left font-medium py-1 pr-2"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {column.label}
                    {column.view?.method && (
                      <span
                        className="normal-case font-normal text-[10px] text-muted-foreground"
                        title={METHOD_EXPLANATIONS[column.view.method]}
                      >
                        {METHOD_LABELS[column.view.method]}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              <th className="text-left font-medium py-1 pr-2 w-[4.5rem]">
                Delta
              </th>
              <th className="text-left font-medium py-1 w-[12rem]">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {questionNames.map((name) => {
              const answers = answering.map((c) =>
                c.view?.answers.find((a) => a.name === name),
              );
              const probabilities = answers
                .map((a) => (a ? answerProbability(a) : null))
                .filter((p): p is number => p != null);
              const spread =
                probabilities.length >= 2
                  ? Math.max(...probabilities) - Math.min(...probabilities)
                  : null;
              const shownAnswers = answers
                .map((a) => (a ? formatAnswerHeadline(a) : null))
                .filter((a): a is string => a != null);
              const disagree =
                shownAnswers.length >= 2 && new Set(shownAnswers).size > 1;
              const verdict = verdicts[name];
              const draft = drafts[name] ?? verdict?.answer ?? "";
              return (
                <tr key={name} className="border-t border-border/60 align-top">
                  <td className="py-1.5 pr-2">
                    {/* The question as asked leads; the field name is secondary. */}
                    {(() => {
                      const asked = answers.find(
                        (a) => a?.instruction,
                      )?.instruction;
                      return (
                        <>
                          {asked && (
                            <span className="block text-xs leading-snug text-foreground">
                              {asked}
                            </span>
                          )}
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {name}
                          </span>
                        </>
                      );
                    })()}
                  </td>
                  {answering.map((column) => (
                    <td key={column.columnId} className="py-1.5 pr-2">
                      <ColumnAnswerCell
                        view={column.view}
                        questionName={name}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 pr-2">
                    {disagree ? (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                        different answers
                      </span>
                    ) : spread != null ? (
                      <span
                        className={cn(
                          "font-mono text-[10px]",
                          spread >= 0.2
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {percent(spread)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1">
                      <Input
                        value={draft}
                        disabled={!setId}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [name]: e.target.value,
                          }))
                        }
                        onBlur={() => void commitVerdict(name)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitVerdict(name);
                        }}
                        placeholder={setId ? "What was true" : "Save first"}
                        aria-label={`True answer for ${name}`}
                        className="h-6 text-[11px]"
                      />
                      {savingName === name ? (
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      ) : verdict ? (
                        <Check
                          className="w-3 h-3 text-emerald-500"
                          aria-label="Verdict saved"
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
