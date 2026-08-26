"use client";

/**
 * The live run console — what a proof run looks like while it happens.
 *
 * Every line here is a typed server event (`proof_run_started` / `_step` /
 * `proof_evaluated` / `_completed` / `_skipped`), rendered as it arrives. The
 * finished ATTESTATION is not re-rendered here: it goes through
 * `KindInstanceRender`, so the same `proof_attestation` component draws it in
 * this console, in the run history, and anywhere else the shape appears
 * (THE CANONICAL COMPONENT LAW).
 */

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleSlash,
  Loader2,
  Radio,
  ShieldQuestion,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import type {
  ProofEvaluatedData,
  ProofRunCompletedData,
  ProofRunStartedData,
} from "@/types/python-generated/stream-events";
import {
  PROOF_ATTESTATION_KIND,
  type ProofAttestation,
  type ProofResultKind,
} from "@/features/proof-runs/types";

export interface ProofRunConsoleState {
  isRunning: boolean;
  started: ProofRunStartedData | null;
  steps: string[];
  proofs: ProofEvaluatedData[];
  completed: ProofRunCompletedData | null;
  skippedReason: string | null;
  error: string | null;
}

export const EMPTY_CONSOLE: ProofRunConsoleState = {
  isRunning: false,
  started: null,
  steps: [],
  proofs: [],
  completed: null,
  skippedReason: null,
  error: null,
};

const STATUS_STYLE: Record<
  "passed" | "failed" | "skipped",
  { Icon: typeof CheckCircle2; className: string; label: string }
> = {
  passed: {
    Icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
    label: "Proven",
  },
  failed: {
    Icon: XCircle,
    className: "text-red-600 dark:text-red-400",
    label: "Failed",
  },
  skipped: {
    Icon: CircleSlash,
    className: "text-amber-600 dark:text-amber-400",
    label: "Not checked",
  },
};

/** The completed run's attestation, in the exact shape the kind component reads. */
function attestationFrom(
  completed: ProofRunCompletedData,
  proofs: ProofEvaluatedData[],
  started: ProofRunStartedData | null,
): ProofAttestation {
  return {
    __kind: "proof_attestation",
    verdict: completed.verdict,
    strength: completed.strength,
    mode: completed.mode,
    summary: completed.summary,
    passed: completed.passed,
    failed: completed.failed,
    skipped: completed.skipped,
    cost_usd: completed.cost_usd,
    total_tokens: completed.total_tokens,
    provider_calls: completed.provider_calls,
    conversation_id: started?.conversation_id ?? null,
    proofs: proofs.map((p): ProofResultKind => ({
      __kind: "proof_result",
      id: p.proof_id,
      title: p.title,
      status: p.status,
      required: p.required,
      detail: p.detail,
      observed: p.observed,
    })),
  };
}

export function ProofRunConsole({ state }: { state: ProofRunConsoleState }) {
  const tailRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) tailRef.current?.scrollIntoView({ block: "nearest" });
  }, [state.proofs.length, state.steps.length, state.completed, autoScroll]);

  if (
    !state.isRunning &&
    !state.started &&
    !state.skippedReason &&
    !state.error
  ) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
        <ShieldQuestion className="h-4 w-4" />
        Run a check to watch each proof land. Nothing here is a spinner — every
        line is a decision the server already made.
      </div>
    );
  }

  return (
    <div
      className="space-y-3"
      onWheel={() => setAutoScroll(false)}
      onTouchMove={() => setAutoScroll(false)}
    >
      {state.started ? (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Radio
              className={cn(
                "h-3.5 w-3.5",
                state.isRunning
                  ? "animate-pulse text-emerald-500"
                  : "text-muted-foreground",
              )}
            />
            <span className="font-medium text-foreground">
              {state.started.label || state.started.slug}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-px text-[10px] font-medium uppercase",
                state.started.mode === "live"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
              )}
            >
              {state.started.mode}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground">
            {state.started.gate_reason}
          </p>
          {state.started.conversation_id ? (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
              <span>receipts anchor</span>
              {/* The anchor is a REAL conversation holding this run's model
                  calls — the evidence the proofs are computed from. Naming an
                  id without a door is a dead end (`pnpm check:dead-ends`), and
                  here the door is the whole point: open it and read the calls. */}
              <EntityRef
                token="conversation"
                id={state.started.conversation_id}
                name={`${state.started.slug} run`}
              />
            </p>
          ) : null}
        </div>
      ) : null}

      {state.skippedReason ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          <span className="font-medium">The gate declined to run</span> —{" "}
          {state.skippedReason}
        </div>
      ) : null}

      {state.error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-200">
          {state.error}
        </div>
      ) : null}

      {state.steps.length > 0 ? (
        <ol className="space-y-1 text-xs text-muted-foreground">
          {state.steps.map((step, i) => (
            <li key={`${i}-${step}`} className="flex items-start gap-2">
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {state.proofs.length > 0 && !state.completed ? (
        <ul className="space-y-1">
          {state.proofs.map((proof) => {
            const style = STATUS_STYLE[proof.status];
            const Icon = style.Icon;
            return (
              <li
                key={proof.proof_id}
                className="flex items-start gap-2 text-xs"
              >
                <Icon className={cn("mt-0.5 h-3.5 w-3.5", style.className)} />
                <span className="min-w-0">
                  <span className="font-medium text-foreground">
                    {proof.title}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {proof.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {state.isRunning && !state.completed ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Working — proofs are evaluated after the check finishes its run.
        </div>
      ) : null}

      {state.completed ? (
        <KindInstanceRender
          kind={PROOF_ATTESTATION_KIND}
          value={attestationFrom(state.completed, state.proofs, state.started)}
          variant="bare"
          showRoutingNote={false}
        />
      ) : null}

      <div ref={tailRef} />
    </div>
  );
}
