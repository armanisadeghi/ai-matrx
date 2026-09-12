"use client";

/**
 * `flow_step_result` — the ONE renderer for the workflow CONTROL-FLOW kinds:
 * `branch_result`, `dispatch_result`, `map_result`, `loop_iteration_result`,
 * `work_queue_wave_result`, `work_seed_result`, `bulk_result`.
 *
 * THE READER'S QUESTION: *where did the run go, and how much went with it?*
 * A control step's own payload is almost never the point — the point is the
 * DIRECTION it chose and the COUNTERS it moved. So the direction (or the wave
 * / iteration) is the headline, the counters are chips coloured by what they
 * mean (succeeded green, failed red, duplicates muted), and the carried value
 * sits underneath as a normal payload.
 *
 * These are also the highest-frequency kinds in real run history — measured
 * live 2026-08-23 in `workflow.node_outcome`: `branch_result` 102 rows,
 * `map_result` 46, `gather_result` 37. Every one of them rendered as an
 * unranked field grid before this component existed.
 *
 * See `result-kind-shared.tsx` for the route contract and the Inventory Law
 * survey this component is bound by.
 */

import React from "react";
import { CircleCheck, CircleX, GitBranch, RefreshCw, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import {
  ChipRow,
  CountChip,
  LeftoverFields,
  MetaStrip,
  RawRegion,
  Section,
  StateChip,
  StillArriving,
  isRecord,
  kindLabel,
  readBool,
  readKindValue,
  readNumber,
  readText,
  type ResultKindBlockProps,
} from "./result-kind-shared";

/**
 * Counters in reading order, with the tone that tells a scanner what the
 * number MEANS. Order is deliberate: what succeeded before what failed before
 * what was merely seen.
 */
const COUNTERS: ReadonlyArray<{
  key: string;
  label: string;
  tone: "neutral" | "good" | "bad" | "accent";
}> = [
  { key: "succeeded", label: "succeeded", tone: "good" },
  { key: "failed", label: "failed", tone: "bad" },
  { key: "dispatched", label: "dispatched", tone: "accent" },
  { key: "added", label: "added", tone: "accent" },
  { key: "discovered", label: "discovered", tone: "neutral" },
  { key: "total_discovered", label: "discovered", tone: "neutral" },
  { key: "duplicates", label: "duplicates", tone: "neutral" },
];

/** Payload fields, in the order a family would carry one. */
const PAYLOAD_KEYS = ["items", "value", "accumulator"] as const;

const FlowStepResultBlock: React.FC<ResultKindBlockProps> = ({
  content,
  metadata,
  className,
}) => {
  const { value, recovered, kind, streaming } = readKindValue(content, metadata);
  if (!recovered || !isRecord(value)) {
    return <RawRegion content={content} className={className} />;
  }

  const direction = readText(value.direction);
  const wave = readNumber(value.wave);
  const iteration = readNumber(value.iteration);
  const done = readBool(value.done);
  const archetype = readText(value.archetype);

  const counters = COUNTERS.map((counter) => ({
    ...counter,
    count: readNumber(value[counter.key]),
  })).filter((counter) => counter.count !== null);

  const payloadKey = PAYLOAD_KEYS.find(
    (key) => value[key] !== undefined && value[key] !== null,
  );

  const shown = [
    "direction",
    "wave",
    "iteration",
    "done",
    "archetype",
    ...COUNTERS.map((counter) => counter.key),
    ...(payloadKey ? [payloadKey] : []),
  ];

  // The headline: a branch names its direction, a wave/iteration names its
  // number, and everything else falls back to the kind's own name.
  const label = kindLabel(kind);
  const stepName =
    wave !== null
      ? `Wave ${wave.toLocaleString()}`
      : iteration !== null
        ? `Iteration ${iteration.toLocaleString()}`
        : label;

  return (
    <div className={cn("my-2 min-w-0 space-y-3", className)}>
      {streaming ? <StillArriving /> : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {direction ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <GitBranch className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">
              {label || "Branch"}
              {" → "}
            </span>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-primary">
              {direction}
            </span>
          </span>
        ) : stepName ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            {wave !== null || iteration !== null ? (
              <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <Send className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            {stepName}
          </span>
        ) : null}

        {done !== null ? (
          <StateChip
            label={done ? "complete" : "more to come"}
            tone={done ? "good" : "accent"}
            icon={
              done ? (
                <CircleCheck className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
              )
            }
          />
        ) : null}
        {archetype ? <StateChip label={archetype} /> : null}
      </div>

      {counters.length > 0 ? (
        <ChipRow>
          {counters.map((counter) => (
            <CountChip
              key={counter.key}
              value={counter.count as number}
              label={counter.label}
              tone={counter.tone}
              icon={
                counter.key === "succeeded" ? (
                  <CircleCheck className="h-3.5 w-3.5 shrink-0" />
                ) : counter.key === "failed" ? (
                  <CircleX className="h-3.5 w-3.5 shrink-0" />
                ) : undefined
              }
            />
          ))}
        </ChipRow>
      ) : null}

      {payloadKey ? (
        <Section
          label={
            payloadKey === "items"
              ? "Items"
              : payloadKey === "accumulator"
                ? "Accumulated so far"
                : "Value carried forward"
          }
        >
          <ResultValue value={value[payloadKey]} density="full" />
        </Section>
      ) : null}

      {/* Anything the family did not promote still reaches the reader —
          HIDE NOTHING is the result-field library's contract and it is this
          component's contract too. */}
      <MetaStrip value={value} omit={shown} />
      <LeftoverFields value={value} omit={shown} />
    </div>
  );
};

export default FlowStepResultBlock;
