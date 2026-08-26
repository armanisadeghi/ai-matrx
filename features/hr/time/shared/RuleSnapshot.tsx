"use client";

/**
 * features/hr/time/shared/RuleSnapshot.tsx — the door behind every computed figure.
 *
 * 🚨 SPEC-TIME §0 law 2, restated because it decides whether a surface is finished:
 * *"A figure rendered without a path to `rule_version_ids`, `engine_key`, `engine_version` and
 * `calc` is an unfinished surface."* Every OT, DT and premium number on routes 5, 28 and 29 is
 * therefore a **button**, not a `<span>`, and this module is what it opens.
 *
 * ONE WINDOW, NOT ONE PER FIGURE. A period detail can carry fifty figures; fifty mounted
 * `WindowPanel`s is not a design. The surface mounts `<RuleSnapshotProvider>` once, every figure
 * calls `useRuleSnapshot().open(...)`, and one `DataRowWindow` renders whichever is current.
 *
 * ♻️ It wraps `DataRowWindow` — the canonical window primitive — rather than hand-rolling a panel
 * body (`features/window-panels/FEATURE.md` § A PANEL WRAPS THE CANONICAL COMPONENT).
 */

import { createContext, useContext, useState, type ReactNode } from "react";

import { DataRowWindow } from "@/components/official/matrx-data-table/DataRowWindow";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { cn } from "@/lib/utils";
import { viewerTimeZone } from "../clock/stampedTime";

import type { CalcBlock } from "../api/types";
import { formatStampedDateTimeExact } from "./format";
import { IncompleteFactSentences } from "./MoneyAndFlags";

export interface RuleSnapshotRequest {
  /** What figure is being explained — "Overtime, 5.00 hours". */
  title: string;
  /** The grain it was computed at — "Workweek of Mar 15" / "Tue, Mar 17". */
  subtitle?: string;
  calc: CalcBlock | null;
  /** Anything the caller wants beside the calc inputs (thresholds, the rate breakdown, a rule id). */
  extra?: Record<string, unknown>;
  /** Optional custom body — the multi-rate breakdown renders its own table here. */
  body?: ReactNode;
}

interface RuleSnapshotApi {
  open: (request: RuleSnapshotRequest) => void;
  close: () => void;
}

const RuleSnapshotContext = createContext<RuleSnapshotApi | null>(null);

/**
 * Falling back to a no-op would make a figure look like a door and do nothing when the provider is
 * missing — a dead end that passes review. It throws instead.
 */
export function useRuleSnapshot(): RuleSnapshotApi {
  const api = useContext(RuleSnapshotContext);
  if (!api) {
    throw new Error(
      "useRuleSnapshot() outside <RuleSnapshotProvider>. Every surface rendering an OT, DT or " +
        "premium figure must mount the provider — a figure without a path to its rule snapshot is " +
        "an unfinished surface (SPEC-TIME §0 law 2).",
    );
  }
  return api;
}

export function RuleSnapshotProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<RuleSnapshotRequest | null>(null);

  return (
    <RuleSnapshotContext.Provider
      value={{ open: setRequest, close: () => setRequest(null) }}
    >
      {children}
      <DataRowWindow
        isOpen={request !== null}
        onClose={() => setRequest(null)}
        title={request ? `How this was calculated — ${request.title}` : "How this was calculated"}
        windowId="hr-time-rule-snapshot"
        width={760}
        height={620}
        viewContent={request ? <RuleSnapshotBody request={request} /> : null}
      />
    </RuleSnapshotContext.Provider>
  );
}

function RuleSnapshotBody({ request }: { request: RuleSnapshotRequest }) {
  const { calc, extra, body, subtitle } = request;
  return (
    <div className="space-y-5 p-4 text-sm">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold">{request.title}</h2>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </header>

      {calc ? (
        <>
          <Section title="Which engine produced it">
            <Field label="Engine" value={calc.engineKey ?? "Not recorded"} />
            <Field label="Engine version" value={calc.engineVersion ?? "Not recorded"} />
            <Field
              label="Calculated at"
              value={
                calc.computedAt
                  ? formatStampedDateTimeExact(calc.computedAt, viewerTimeZone())
                  : "Not recorded"
              }
            />
          </Section>

          <Section title="Which rule versions applied">
            {calc.ruleVersionIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No rule version was stamped on this figure. That is itself a finding — tell an HR
                administrator, because a figure without a rule version cannot be defended.
              </p>
            ) : (
              <ul className="space-y-1">
                {calc.ruleVersionIds.map((id) => (
                  <li
                    key={id}
                    className="rounded border border-border bg-muted/40 px-2 py-1 font-mono text-[11px]"
                  >
                    {id}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {calc.autoCloseEstimate ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              This figure comes from an <span className="font-medium">automatically closed punch</span>
              , so the end time is an estimate rather than something the employee recorded.
              Acknowledging an estimate confirms it; it never turns it into a measurement.
              {calc.autoCloseRuleId ? (
                <button
                  type="button"
                  className="mt-1 block text-left text-[11px] font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => void announceComingSoon("hr.time-rule-detail")}
                >
                  Open the auto-close rule
                </button>
              ) : null}
            </div>
          ) : null}

          <IncompleteFactSentences calc={calc} />

          <Section title="The inputs the engine used">
            <KeyValues values={calc.calc} />
          </Section>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          No calculation record was returned with this figure.
        </p>
      )}

      {body}

      {extra && Object.keys(extra).length > 0 ? (
        <Section title="Detail">
          <KeyValues values={extra} />
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

/** The calc bag is free-form by design — the drawer renders it, nothing parses it. */
function KeyValues({ values }: { values: Record<string, unknown> }) {
  const entries = Object.entries(values).filter(([key]) => key !== "incomplete");
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing recorded.</p>;
  }
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
          <dt className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</dt>
          <dd className="text-right text-xs font-medium">
            {typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A computed figure rendered as the door SPEC-TIME §0 law 2 requires.
 *
 * `emphasis` carries the §5.2 rule that an overtime figure has **distinct visual weight**, not just
 * a different word beside it.
 */
export function RuleSnapshotDoor({
  children,
  request,
  emphasis = false,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  request: RuleSnapshotRequest;
  emphasis?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const snapshot = useRuleSnapshot();
  return (
    <button
      type="button"
      onClick={() => snapshot.open(request)}
      aria-label={ariaLabel ?? `How ${request.title} was calculated`}
      className={cn(
        "rounded px-1 tabular-nums underline decoration-dotted underline-offset-4",
        "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        emphasis && "font-semibold text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      {children}
    </button>
  );
}
