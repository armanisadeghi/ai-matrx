"use client";

/**
 * THE DECISION RECORD — provenance, always.
 *
 * SPEC-workflow-ui-contract §4.2: "**Provenance is surfaced, always:** …every
 * surface showing an approval MUST show 'Approved by <person>' or
 * 'Auto-approved by <agent> after the deadline' — an escalated decision that
 * reads as a human's is the exact failure this field exists to prevent."
 *
 * The live question is gone the instant the run resumes, so without this strip
 * a finished run showed no trace of who signed off — including when NOBODY
 * did and an agent decided on the deadline. It reads the settled
 * `control.human_input` outputs (`matrx_decision`) straight out of the fold,
 * so it costs no request and survives a refresh like any other durable fact.
 *
 * Deliberately tight: one line per decision, the note beneath it when there is
 * one. A decision is a fact, not a section.
 */

import { AlertTriangle, BotMessageSquare, Check, UserCheck, X } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import { selectRunDecisions } from "../redux/workflow-runs.selectors";
import { decisionLine, type SettledDecision } from "./interrupt-view";

export function RunDecisions({
  runId,
  /** nodeId → the author's label, when the host has the definition. */
  nodeLabels,
}: {
  runId: string;
  nodeLabels?: Record<string, string>;
}) {
  const decisions = useAppSelector(selectRunDecisions(runId));
  if (decisions.length === 0) return null;
  return (
    <ul data-run-decisions={runId} className="space-y-1">
      {decisions.map((decision, index) => (
        <DecisionRow
          key={`${decision.nodeId}:${index}`}
          decision={decision}
          label={nodeLabels?.[decision.nodeId] ?? null}
        />
      ))}
    </ul>
  );
}

function DecisionRow({
  decision,
  label,
}: {
  decision: SettledDecision;
  label: string | null;
}) {
  const escalated = decision.provenance?.authority !== "human";
  const unrecorded = decision.provenance === null;
  return (
    <li
      data-decision-node={decision.nodeId}
      data-decision-authority={decision.provenance?.authority ?? "unrecorded"}
      className={cn(
        "rounded-lg border px-2.5 py-1.5",
        unrecorded
          ? "border-red-500/40 bg-red-500/5"
          : decision.approved === false
            ? "border-destructive/30 bg-destructive/5"
            : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Verdict decision={decision} unrecorded={unrecorded} />
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
          {decisionLine(decision)}
        </span>
        {escalated && !unrecorded ? (
          <BotMessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : null}
      </div>
      {label ? (
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      ) : null}
      {decision.note ? (
        <p className="mt-0.5 break-words text-[11px] text-foreground/80">
          “{decision.note}”
        </p>
      ) : null}
    </li>
  );
}

function Verdict({
  decision,
  unrecorded,
}: {
  decision: SettledDecision;
  unrecorded: boolean;
}) {
  if (unrecorded) {
    return (
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
    );
  }
  if (decision.approved === true) {
    return <Check className="h-3.5 w-3.5 shrink-0 text-primary" />;
  }
  if (decision.approved === false) {
    return <X className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  }
  return <UserCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

export default RunDecisions;
