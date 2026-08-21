"use client";

/**
 * TheWindow — the big glass pane of the Courier concept: one camera-sized
 * region that carries the whole lifecycle without the page ever reshaping.
 *
 *  - Act I  (order):   the workflow's declared inputs as a plain order form.
 *  - Act II (watch):   the followed step's INTERNALS, live, through the
 *                      canonical content-ir pipeline (InvocationBody →
 *                      LiveRunDisplay / KindInstanceRender — never bespoke).
 *  - Act III (handoff): every deliverable, rendered as its real kind
 *                      component, stacked for keeps.
 *
 * Mid-run emissions ("Show on Screen" steps) append below the stage through
 * the canonical DbEmitRenderer — growth-only, inside this pane's own scroll.
 */

import { useEffect } from "react";
import { Crosshair, PackageOpen, Pin, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import IconResolver from "@/components/official/icons/IconResolver";
import DbEmitRenderer from "@/features/workflow-emit/DbEmitRenderer";
import type { EmitMode } from "@/features/workflow-emit/types";
import {
  InterruptCard,
  InvocationBody,
  PHASE_LABEL,
  PhaseIcon,
  RunErrorCard,
} from "@/features/workflow-runtime/components/readout-parts";
import {
  FAMILY_ICON,
  FAMILY_STYLE,
  familyNoun,
  humanizeKind,
  type RunStepPresentation,
} from "@/features/workflow-runtime/components/run/node-presentation";
import {
  selectNodeAggregate,
  selectRunEmissions,
  selectRunStatus,
} from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import {
  missingRequiredFields,
  type RunFormSection,
} from "@/features/workflow-runtime/surface/run-form";
import { RunFormFieldControl } from "@/features/workflow-runtime/components/RunFormFieldControl";

const EMIT_MODES: ReadonlySet<string> = new Set([
  "confirmation",
  "summary",
  "full",
  "restructured",
]);

function toEmitMode(raw: string): EmitMode {
  return EMIT_MODES.has(raw) ? (raw as EmitMode) : "full";
}

// ── Act I — the order form ─────────────────────────────────────────────────

export function OrderWindow({
  sections,
  values,
  onFieldChange,
  starting,
  onStart,
  stepCount,
}: {
  sections: RunFormSection[];
  values: Record<string, Record<string, unknown>>;
  onFieldChange: (nodeId: string, key: string, value: unknown) => void;
  starting: boolean;
  onStart: () => void;
  stepCount: number;
}) {
  const missing = missingRequiredFields(sections, values);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <p className="text-sm text-muted-foreground">
        {sections.length > 0
          ? "A few things it needs from you, then it takes over."
          : "Nothing needed from you — it has everything it needs."}
      </p>

      {sections.map((section) => (
        <fieldset key={section.nodeId} className="mt-5">
          <legend className="text-sm font-semibold text-foreground">
            {section.title}
          </legend>
          <div className="mt-2 space-y-3">
            {section.fields.map((field) => (
              <label key={field.key} className="block">
                <span className="text-xs font-medium text-foreground">
                  {field.label}
                  {field.required ? (
                    <span className="text-destructive"> *</span>
                  ) : null}
                </span>
                {field.help ? (
                  <span className="block text-[11px] text-muted-foreground">
                    {field.help}
                  </span>
                ) : null}
                <RunFormFieldControl
                  field={field}
                  value={values[section.nodeId]?.[field.key]}
                  onChange={(v) => onFieldChange(section.nodeId, field.key, v)}
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          disabled={starting || missing.length > 0}
          onClick={onStart}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {starting ? "Starting…" : "Start the work"}
        </button>
        <span className="text-xs text-muted-foreground">
          {missing.length > 0
            ? `Still needed: ${missing.join(", ")}`
            : `${stepCount} steps will run on their own.`}
        </span>
      </div>
    </div>
  );
}

// ── Act II — the live camera ───────────────────────────────────────────────

function ConnectingBody() {
  return (
    <div className="px-4 py-6">
      <p className="text-sm text-muted-foreground">Connecting to the run…</p>
      <div aria-hidden className="mt-3 space-y-2">
        <div className="h-2.5 w-[88%] animate-pulse rounded-full bg-muted" />
        <div className="h-2.5 w-[72%] animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
        <div className="h-2.5 w-[80%] animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function StageForStep({
  runId,
  step,
  ensureLane,
}: {
  runId: string;
  step: RunStepPresentation;
  ensureLane: (runId: string, invocationKey: string, seed?: string) => string | null;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const style = FAMILY_STYLE[step.family];

  // Camera-driven lane promotion: ONLY the followed step's live invocations
  // get a streaming lane (1–3 at a time — far inside the 12-lane budget).
  // ensureLane is idempotent and refuses politely when the budget is full;
  // the tracked tail keeps the pane honest either way. An effect, never a
  // render-time side effect — promotion dispatches into Redux.
  useEffect(() => {
    const promotable = aggregate.invocations
      .filter(
        (inv) =>
          (inv.phase === "running" || inv.phase === "retrying") &&
          !inv.laneRequestId,
      )
      .slice(0, 3);
    for (const inv of promotable) {
      ensureLane(runId, inv.invocationKey, inv.textTail || undefined);
    }
  }, [runId, aggregate, ensureLane]);

  const shown = aggregate.invocations.slice(0, 3);
  const hidden = aggregate.invocations.length - shown.length;

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            style.bg,
            style.ring,
          )}
        >
          <IconResolver
            iconName={step.iconName ?? FAMILY_ICON[step.family]}
            size={18}
            className={style.text}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {step.label}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {familyNoun(step.family)}
            {step.outputKind
              ? ` — hands you: ${humanizeKind(step.outputKind)}`
              : ""}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <PhaseIcon phase={aggregate.phase} />
          {PHASE_LABEL[aggregate.phase] ?? aggregate.phase}
        </span>
      </div>

      {aggregate.expectedCount > 1 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Working in {aggregate.expectedCount} parts — {aggregate.settledCount}{" "}
          done
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {aggregate.phase === "idle" ? (
          <p className="text-xs text-muted-foreground">
            Coming up — the run hasn't reached this step yet.
            {step.outputKind
              ? ` When it does, ${humanizeKind(step.outputKind).toLowerCase()} will appear right here.`
              : ""}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This step is queued — its work shows here the moment it begins.
          </p>
        ) : (
          shown.map((inv) => (
            <div
              key={inv.invocationKey}
              className={cn(
                shown.length > 1 &&
                  "rounded-xl border border-border bg-card p-3",
              )}
            >
              {shown.length > 1 ? (
                <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <PhaseIcon phase={inv.phase} />
                  Part {inv.itemIndex + 1}
                </p>
              ) : null}
              <InvocationBody runId={runId} invocation={inv} />
            </div>
          ))
        )}
        {hidden > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            …and {hidden} more parts working alongside these.
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── Act III — the handoff ──────────────────────────────────────────────────

function HandoffStack({
  runId,
  deliverables,
}: {
  runId: string;
  deliverables: RunStepPresentation[];
}) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <PackageOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        Here's what it made for you
      </div>
      <div className="mt-3 space-y-4">
        {deliverables.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This workflow does its work quietly — everything it produced was
            handed to the steps that needed it.
          </p>
        ) : (
          deliverables.map((step) => (
            <DeliverableCard key={step.nodeId} runId={runId} step={step} />
          ))
        )}
      </div>
    </div>
  );
}

function DeliverableCard({
  runId,
  step,
}: {
  runId: string;
  step: RunStepPresentation;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const first = aggregate.invocations[0] ?? null;
  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <IconResolver
          iconName={step.iconName ?? FAMILY_ICON[step.family]}
          size={14}
          className={FAMILY_STYLE[step.family].text}
        />
        {humanizeKind(step.outputKind ?? step.label)}
      </h3>
      <div className="mt-2">
        {first ? (
          <InvocationBody runId={runId} invocation={first} prefer="persisted" />
        ) : (
          <p className="text-xs text-muted-foreground">
            This one didn't get made this time.
          </p>
        )}
      </div>
    </section>
  );
}

// ── The pane itself (Act II + III share one scroll region) ─────────────────

export function WatchWindow({
  runId,
  followedStep,
  pinned,
  onFollowLive,
  deliverables,
  ensureLane,
  stepLabels,
}: {
  runId: string;
  followedStep: RunStepPresentation | null;
  pinned: boolean;
  onFollowLive: () => void;
  deliverables: RunStepPresentation[];
  ensureLane: (runId: string, invocationKey: string, seed?: string) => string | null;
  stepLabels: Record<string, string>;
}) {
  const status = useAppSelector(selectRunStatus(runId));
  const emissions = useAppSelector(selectRunEmissions(runId));
  const delivered = status === "completed";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      {/* Run-level truths always outrank the camera. */}
      <div className="space-y-3 px-4 pt-3 empty:hidden">
        <RunErrorCard runId={runId} nodeLabels={stepLabels} />
        <InterruptCard runId={runId} />
      </div>

      {pinned && !delivered ? (
        <div className="px-4 pt-2">
          <button
            type="button"
            onClick={onFollowLive}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent"
          >
            <Crosshair className="h-3 w-3" />
            You aimed the camera here — follow the live work again
          </button>
        </div>
      ) : null}

      {delivered ? (
        <HandoffStack runId={runId} deliverables={deliverables} />
      ) : status === null ? (
        <ConnectingBody />
      ) : followedStep ? (
        <StageForStep runId={runId} step={followedStep} ensureLane={ensureLane} />
      ) : (
        <ConnectingBody />
      )}

      {emissions.length > 0 ? (
        <div className="border-t border-border px-4 py-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Pin className="h-3 w-3" />
            Put on screen along the way
          </p>
          <div className="mt-2 space-y-3">
            {emissions.map((emission, index) => (
              <div
                key={emission.seq ?? `live:${index}`}
                className="rounded-xl border border-border bg-card p-3"
              >
                <DbEmitRenderer
                  componentRef={emission.componentRef}
                  mode={toEmitMode(emission.mode)}
                  payload={emission.payload}
                  title={emission.title}
                  nodeId={emission.nodeId}
                  runId={runId}
                  seq={emission.seq ?? index}
                  isPersisted={emission.persisted}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
