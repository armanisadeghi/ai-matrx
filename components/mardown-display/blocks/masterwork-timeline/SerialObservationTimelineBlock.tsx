"use client";

/**
 * SerialObservationTimelineBlock — THE ONE renderer for the
 * `serial_observation_timeline` kind (unfolding-case contract §1).
 *
 * What it draws, in the order the expertise lives in:
 *   1. the opening facts — everything known before anything was done
 *   2. each step — when, what became newly known, what was done next (kind
 *      chip + target + the practitioner's own why), and what was STILL unknown
 *   3. how it turned out — COLLAPSED by default, because reading the answer
 *      before the steps is exactly how a reader stops learning the reasoning
 *
 * 🚨 A SEALED CASE NEVER SHOWS ITS ANSWER. A held-out case is what the desk is
 * examined on; the resolution is read by the case oracle and the judge and by
 * nothing else. The bridge already refuses to put it in the rendered value, so
 * this component has nothing to leak — it says the case is sealed and why,
 * instead of drawing a disclosure that would open onto nothing.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, HelpCircle } from "lucide-react";

import {
  type TimelineStepData,
  type UnfoldedTimelineData,
} from "@/features/content-ir/kinds/serial-observation-timeline";

export interface SerialObservationTimelineBlockProps {
  serverData?: unknown;
}

const ACTION_LABEL: Record<string, string> = {
  ask: "Ask",
  examine: "Examine",
  test: "Test",
  image: "Image",
  treat: "Treat",
  observe: "Watch and wait",
  refer: "Refer",
  wait: "Wait",
  commit: "Commit to an answer",
};

function readData(serverData: unknown): UnfoldedTimelineData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<UnfoldedTimelineData>;
  if (typeof candidate.title !== "string") return null;
  if (!Array.isArray(candidate.steps)) return null;
  return candidate as UnfoldedTimelineData;
}

function Facts({
  items,
  tone,
  label,
}: {
  items: string[];
  tone: "known" | "unknown";
  label: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="flex flex-wrap gap-1">
        {items.map((item) => (
          <li
            key={item}
            className={
              tone === "known"
                ? "inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs text-foreground"
                : "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
            }
          >
            {tone === "unknown" ? (
              <HelpCircle className="h-3 w-3" aria-hidden />
            ) : null}
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Step({ step }: { step: TimelineStepData }) {
  return (
    <li className="relative pl-6">
      <span
        className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background"
        aria-hidden
      />
      <div className="space-y-2 pb-4">
        <p className="text-xs font-semibold text-foreground">
          Step {step.step}
          {step.at ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {step.at}
            </span>
          ) : null}
        </p>
        <Facts
          items={step.newlyKnown}
          tone="known"
          label="Newly known at this point"
        />
        {step.action ? (
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-foreground">
            <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {step.action.kind
                ? (ACTION_LABEL[step.action.kind] ?? step.action.kind)
                : "Next"}
            </span>
            {step.action.target ? <span>{step.action.target}</span> : null}
            {step.action.why ? (
              <span className="text-muted-foreground">
                — {step.action.why}
              </span>
            ) : null}
          </p>
        ) : null}
        <Facts
          items={step.notYetKnown}
          tone="unknown"
          label="Still not known"
        />
        {step.excerpt ? (
          <blockquote className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
            “{step.excerpt}”
          </blockquote>
        ) : null}
      </div>
    </li>
  );
}

export function SerialObservationTimelineBlock({
  serverData,
}: SerialObservationTimelineBlockProps) {
  const data = readData(serverData);
  const [showResolution, setShowResolution] = useState(false);
  if (!data) return null;

  return (
    <div className="my-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-base font-semibold text-foreground">
          {data.title}
        </h3>
        {data.domain ? (
          <span className="text-xs text-muted-foreground">{data.domain}</span>
        ) : null}
        {data.sealed ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            <EyeOff className="h-3 w-3" aria-hidden />
            Sealed — held-out case
          </span>
        ) : null}
      </div>

      {data.openingFacts.length > 0 ? (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
          <Facts
            items={data.openingFacts}
            tone="known"
            label="Known before anything was done"
          />
        </div>
      ) : null}

      {data.steps.length > 0 ? (
        <ol className="mt-4 border-l border-border pl-1">
          {data.steps.map((step) => (
            <Step key={step.step} step={step} />
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No steps were read out of this case — the narrative may not describe
          one thing happening after another. Paste it again with the order made
          explicit, or use one of the other ways to add a source.
        </p>
      )}

      {data.sealed ? (
        <p className="mt-2 border-t border-border pt-3 text-xs text-muted-foreground">
          How it turned out is sealed. The desk is examined on this case and
          never learns from it, so the answer is not shown here — only the
          Audition sees it.
        </p>
      ) : data.resolution ? (
        <div className="mt-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowResolution((v) => !v)}
            aria-expanded={showResolution}
            className="flex items-center gap-1.5 text-xs font-medium text-primary"
          >
            {showResolution ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <Eye className="h-3.5 w-3.5" />
            {showResolution ? "Hide how it turned out" : "Show how it turned out"}
          </button>
          {showResolution ? (
            <div className="mt-2 space-y-1.5">
              <p className="text-sm text-foreground">
                {data.resolution.outcome}
                {data.resolution.step !== null ? (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    (confirmed at step {data.resolution.step})
                  </span>
                ) : null}
              </p>
              {data.resolution.excerpt ? (
                <blockquote className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                  “{data.resolution.excerpt}”
                </blockquote>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default SerialObservationTimelineBlock;
