"use client";

// features/masterwork/prediction/CalibrationReadout.tsx
//
// "How close are you?" — what the Expert SAID would happen, against what
// actually did, for every call she has recorded an outcome on.
//
// ## The honest empty state is the point
//
// A prediction ledger spends its first weeks with everything open and nothing
// resolved. A chart drawn over zero outcomes is a screen that lies: an empty
// plot reads as "you are calibrated at nothing" rather than "we do not know
// yet". So with zero resolved entries this renders NO chart and NO score —
// it says how many calls are waiting and when the first one can be answered,
// which is the true state and also the next action. Guarded by
// `__tests__/zeroResolved.test.tsx`.
//
// No jargon reaches the screen. "Brier score" is the arithmetic's name, not a
// sentence anyone reads; what renders is "how far off you are, on average".

import {
  CartesianGrid,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  calibrationBuckets,
  isoDay,
  overallBrier,
  tally,
  type PredictionEntry,
} from "./scoring";

const CHART_CONFIG = {
  buckets: { label: "Your calls", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** A long date the way a person says it, e.g. "1 October 2026". */
function longDate(iso: string): string {
  if (!iso) return "";
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * How far off, on average — the Brier score turned into a sentence. 0.25 is
 * what you get by saying "a coin flip" every single time, so it is the line
 * worth being on the right side of.
 */
export function describeAccuracy(brier: number): string {
  if (brier <= 0.1) return "Your calls land very close to what happens.";
  if (brier <= 0.2) return "Your calls land close to what happens.";
  if (brier <= 0.25)
    return "Your calls are a little better than guessing at random.";
  return "Your calls are, so far, no better than guessing at random — which is worth knowing, and is exactly what the reasons behind the wrong ones are for.";
}

export function CalibrationReadout({
  entries,
  className,
  today = isoDay(new Date()),
}: {
  entries: PredictionEntry[];
  className?: string;
  /** Injected so a test can assert an overdue count without the wall clock. */
  today?: string;
}) {
  const counts = tally(entries, today);
  if (counts.total === 0) return null;

  // ─── The honest waiting state ───────────────────────────────────────────
  if (counts.resolved === 0) {
    return (
      <section
        className={className}
        data-surface-value="prediction_calibration"
        data-state="waiting-on-outcomes"
      >
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-foreground">
            How close are you?
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing to show yet — none of your calls have an outcome recorded.
            You have {counts.open}{" "}
            {counts.open === 1 ? "call" : "calls"} waiting
            {counts.earliestOpenDue
              ? `, and the first one should be known by ${longDate(counts.earliestOpenDue)}`
              : ""}
            . Once you tell us how they turned out, this shows how close your
            calls land to what actually happens.
          </p>
        </div>
      </section>
    );
  }

  const buckets = calibrationBuckets(entries);
  const brier = overallBrier(entries);
  const points = buckets.map((b) => ({
    x: Math.round(b.predicted * 100),
    y: Math.round(b.realized * 100),
    count: b.count,
    label: b.label,
  }));

  return (
    <section
      className={className}
      data-surface-value="prediction_calibration"
      data-state="scored"
    >
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h3 className="text-sm font-medium text-foreground">
            How close are you?
          </h3>
          <p className="text-xs text-muted-foreground">
            {counts.wellCalibrated} of {counts.resolved} called right
            {counts.open > 0 ? ` · ${counts.open} still waiting` : ""}
          </p>
        </div>
        {brier !== null ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {describeAccuracy(brier)}
          </p>
        ) : null}

        <ChartContainer
          config={CHART_CONFIG}
          className="mt-3 aspect-square max-h-72 w-full sm:aspect-video"
        >
          <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              name="How sure you were"
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              name="How often it happened"
            />
            <ZAxis type="number" dataKey="count" range={[60, 260]} />
            {/* The perfect line: every point ON it means "when you said 80%,
                it happened 80% of the time". Above it you are too careful,
                below it you are too confident. */}
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: 100, y: 100 },
              ]}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(_value, _name, item) => {
                    const p = item?.payload as
                      | { x: number; y: number; count: number }
                      | undefined;
                    if (!p) return null;
                    return (
                      <span className="text-xs">
                        You were about {p.x}% sure on {p.count}{" "}
                        {p.count === 1 ? "call" : "calls"} — {p.y}% of them
                        came true.
                      </span>
                    );
                  }}
                />
              }
            />
            <Scatter data={points} fill="var(--color-buckets)" />
          </ScatterChart>
        </ChartContainer>

        <p className="mt-2 text-xs text-muted-foreground">
          Across the bottom: how sure you were. Up the side: how often it
          actually happened. The dotted line is dead-on — a dot above it means
          you were more right than you gave yourself credit for, below it means
          you were surer than the facts turned out to be.
        </p>
      </div>
    </section>
  );
}
