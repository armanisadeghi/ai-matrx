"use client";

/**
 * The ONE guided-checklist surface. A consumer supplies a registered
 * definition and a context; everything below is the primitive's job.
 *
 * Design laws this component enforces so no consumer has to:
 *  - A failing step ALWAYS shows the reason and the one-click way out (NO DEAD
 *    ENDS). A red row with no next step is the thing this replaces.
 *  - "We couldn't check" renders neutral, never red — it is not the user's
 *    fault and it is not a failure.
 *  - A step we do for the user says so and shows itself working; it never
 *    presents as something they must do.
 *  - A regression is announced ("this was set up before — it isn't now"),
 *    never silently reopened.
 *  - Copy-paste values come with a copy button each, because retyping a DNS
 *    record by hand is how a non-technical expert gets a silent typo.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  HelpCircle,
  Loader2,
  Lock,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { checklistSteps } from "../engine";
import { useGuidedChecklist } from "../useGuidedChecklist";
import type {
  ChecklistDefinition,
  ChecklistScope,
  ChecklistStep,
  CopyValue,
  ResolvedStep,
} from "../types";

function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function StepIcon({ step }: { step: ResolvedStep }) {
  const base = "h-4 w-4 shrink-0";
  switch (step.status) {
    case "done":
      return <CheckCircle2 className={cn(base, "text-emerald-600")} />;
    case "busy":
      return <Loader2 className={cn(base, "animate-spin text-primary")} />;
    case "blocked":
      return <Lock className={cn(base, "text-muted-foreground")} />;
    case "unknown":
      return <HelpCircle className={cn(base, "text-muted-foreground")} />;
    default:
      return <Circle className={cn(base, "text-amber-600")} />;
  }
}

function CopyRow({ value }: { value: CopyValue }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Your browser wouldn't let us copy that. Select it and copy manually.");
    }
  };
  return (
    <div className="rounded-md border bg-muted/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {value.label}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px]"
          onClick={() => void copy()}
        >
          {copied ? (
            <Check className="mr-1 h-3 w-3 text-emerald-600" />
          ) : (
            <Copy className="mr-1 h-3 w-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <code className="mt-0.5 block break-all font-mono text-xs">
        {value.value}
      </code>
      {value.hint ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{value.hint}</p>
      ) : null}
    </div>
  );
}

interface RowProps<Ctx> {
  resolved: ResolvedStep;
  definition: ChecklistStep<Ctx>;
  context: Ctx;
  isCurrent: boolean;
  onConfirm: (stepId: string, confirmed: boolean) => void;
  onRun: (stepId: string) => void;
  onFix: (stepId: string) => void;
}

function StepRow<Ctx>({
  resolved,
  definition,
  context,
  isCurrent,
  onConfirm,
  onRun,
  onFix,
}: RowProps<Ctx>) {
  const result = resolved.result;
  const fix = result?.fix ?? (definition.kind === "verified" ? definition.fix : undefined);
  // Expanded when this is the step to work on, or when it has something to say.
  const open =
    isCurrent || resolved.status === "action" || resolved.status === "unknown";

  return (
    <li
      className={cn(
        "rounded-md border p-2.5 transition-colors",
        isCurrent ? "border-primary/40 bg-primary/[0.03]" : "bg-card/40",
        resolved.status === "done" && "opacity-80",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          <StepIcon step={resolved} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={cn(
                "text-sm font-medium",
                resolved.status === "done" && "text-muted-foreground",
              )}
            >
              {resolved.title}
            </span>
            {resolved.optional ? (
              <span className="text-[11px] text-muted-foreground">optional</span>
            ) : null}
            {definition.kind === "auto" && resolved.status !== "done" ? (
              <span className="text-[11px] text-muted-foreground">
                we do this for you
              </span>
            ) : null}
            {resolved.stale && resolved.lastCheckedAt ? (
              <span className="text-[11px] text-muted-foreground">
                last checked {relativeTime(resolved.lastCheckedAt)}
              </span>
            ) : null}
          </div>

          {resolved.regressed ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              This was set up before and isn&apos;t any more.
            </p>
          ) : null}

          {open && resolved.description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {resolved.description}
            </p>
          ) : null}

          {resolved.status === "blocked" ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Waiting on: {resolved.blockedBy.join(", ")}
            </p>
          ) : null}

          {open && result?.reason ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {result.reason}
            </p>
          ) : null}
          {result?.detail && resolved.status !== "done" ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {result.detail}
            </p>
          ) : null}
          {resolved.status === "done" && result?.detail ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {result.detail}
            </p>
          ) : null}

          {/* Copy-paste values + how-to for a step only a human can do. */}
          {open && definition.kind === "confirmed" ? (
            <>
              {definition.values ? (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {definition.values(context).map((value) => (
                    <CopyRow key={value.label} value={value} />
                  ))}
                </div>
              ) : null}
              {definition.howTo ? (
                <ol className="mt-1.5 list-inside list-decimal text-xs text-muted-foreground">
                  {definition.howTo(context).map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ol>
              ) : null}
            </>
          ) : null}

          {open && definition.extra ? (
            <div className="mt-1.5">{definition.extra(context)}</div>
          ) : null}

          {/* Actions — every non-done step ends in something the user can press. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {definition.kind === "confirmed" && resolved.status !== "blocked" ? (
              <Button
                size="sm"
                variant={resolved.status === "done" ? "ghost" : "default"}
                className="h-7"
                onClick={() =>
                  onConfirm(resolved.id, resolved.status !== "done")
                }
              >
                {resolved.status === "done"
                  ? "Undo"
                  : (definition.confirmLabel ?? "I've done this")}
              </Button>
            ) : null}

            {definition.kind === "auto" &&
            definition.autoRun === false &&
            resolved.status === "action" ? (
              <Button
                size="sm"
                className="h-7"
                onClick={() => onRun(resolved.id)}
              >
                {definition.runLabel ?? "Do this for me"}
              </Button>
            ) : null}

            {/*
              `running`, not `busy`: a step whose CHECK is in flight is busy
              too, and printing "Setting up your payouts account…" while we are
              merely looking claims we started something on the user's behalf
              that we did not. (Caught in live render, 2026-08-14.)
            */}
            {resolved.running &&
            definition.kind === "auto" &&
            definition.runningLabel ? (
              <span className="text-xs text-muted-foreground">
                {definition.runningLabel}
              </span>
            ) : null}

            {/*
              THE ONE-CLICK FIX. A failure without one is a dead end.

              But a BLOCKED step must not offer one: it already says "Waiting
              on: X", and putting a button under that tells the user to do two
              contradictory things at once. Caught in live render, 2026-08-14 —
              three blocked authentication steps each said "waiting on the
              domain" and then offered "Check it now".
            */}
            {fix &&
            resolved.status !== "done" &&
            resolved.status !== "busy" &&
            resolved.status !== "blocked" ? (
              fix.href ? (
                <Button asChild size="sm" variant="outline" className="h-7">
                  <Link
                    href={fix.href}
                    target={fix.newTab ? "_blank" : undefined}
                    rel={fix.newTab ? "noopener noreferrer" : undefined}
                  >
                    {fix.label}
                    {fix.newTab ? (
                      <ArrowUpRight className="ml-1 h-3 w-3" />
                    ) : null}
                  </Link>
                </Button>
              ) : fix.run ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => onFix(resolved.id)}
                >
                  {fix.label}
                </Button>
              ) : null
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export interface GuidedChecklistProps<Ctx> {
  definition: ChecklistDefinition<Ctx>;
  context: Ctx;
  scope: ChecklistScope | null;
  /** Hold the checks until the caller's own data has loaded. */
  ready?: boolean;
  /**
   * Render nothing at all once every required step passes. Use on a surface
   * where the checklist is a gate rather than a permanent panel — but only
   * when something else on that surface can bring it back.
   */
  hideWhenComplete?: boolean;
  /** Rendered under the header when the checklist is complete. */
  completeSlot?: React.ReactNode;
  className?: string;
}

export function GuidedChecklist<Ctx>({
  definition,
  context,
  scope,
  ready,
  hideWhenComplete,
  completeSlot,
  className,
}: GuidedChecklistProps<Ctx>) {
  const { resolved, error, recheck, setConfirmed, runStep, runFix } =
    useGuidedChecklist({ definition, context, scope, ready });

  if (!resolved) {
    return (
      <div className={cn("rounded-lg border p-3", className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking what&apos;s already set up…
        </div>
      </div>
    );
  }

  if (resolved.complete && hideWhenComplete) return null;

  const byId = new Map(
    checklistSteps(definition, context).map((step) => [step.id, step]),
  );

  return (
    <div className={cn("rounded-lg border p-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            {resolved.complete
              ? (definition.completeTitle ?? resolved.title)
              : resolved.title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {resolved.complete
              ? (definition.completeDescription ?? "Everything's ready.")
              : (resolved.description ?? null)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {resolved.doneCount} of {resolved.requiredCount} done
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            onClick={recheck}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Check again
          </Button>
        </div>
      </div>

      {/* Progress: derived live, never a stored percentage. */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            resolved.complete ? "bg-emerald-600" : "bg-primary",
          )}
          style={{
            width: `${resolved.requiredCount === 0 ? 0 : Math.round((resolved.doneCount / resolved.requiredCount) * 100)}%`,
          }}
        />
      </div>

      {error ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {error}
        </p>
      ) : null}

      {resolved.complete && completeSlot ? (
        <div className="mt-2">{completeSlot}</div>
      ) : null}

      <ul className="mt-2 flex flex-col gap-1.5">
        {resolved.steps.map((step) => {
          const spec = byId.get(step.id);
          if (!spec) return null;
          return (
            <StepRow
              key={step.id}
              resolved={step}
              definition={spec}
              context={context}
              isCurrent={step.id === resolved.currentStepId}
              onConfirm={setConfirmed}
              onRun={runStep}
              onFix={runFix}
            />
          );
        })}
      </ul>
    </div>
  );
}
