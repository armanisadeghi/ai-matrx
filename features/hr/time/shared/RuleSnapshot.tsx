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
import { ErrorBoundaryWithCapture } from "@/lib/error-boundary/ErrorBoundaryWithCapture";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { useAppDispatch } from "@/lib/redux/hooks";
import { revealWindow } from "@/lib/redux/slices/windowManagerSlice";
import { cn } from "@/lib/utils";
import { viewerTimeZone } from "../clock/stampedTime";

import type { CalcBlock } from "../api/types";
import { formatDateTimeInTz } from "./format";
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

const WINDOW_ID = "hr-time-rule-snapshot";

export function RuleSnapshotProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<RuleSnapshotRequest | null>(null);
  const dispatch = useAppDispatch();

  /**
   * 🚨 OPENING IS NOT ENOUGH — THE WINDOW MUST BE REVEALED (G2 T-4).
   *
   * `windowManagerSlice` says this in its own words: *"an open dispatch only updated overlay-slice
   * data; if the window was minimized, dragged off-screen, or suppressed by `windowsHidden`, the
   * user saw nothing."* That is precisely the reported symptom — the click handler fires, no error
   * reaches the console, and no overlay appears — and it is **per-browser session state**, which is
   * why one machine opened the drawer and another did not on the identical build.
   *
   * `revealWindow` is the sanctioned cure: it restores a minimized window, rescues one dragged
   * off-screen, raises it to the top of the z-stack, and clears the global hide-all. It no-ops on a
   * first open, where `registerWindow` already does the right thing. Dispatching it on every open
   * costs nothing and removes the entire silent-failure class from this surface.
   *
   * An evidence drawer that "sometimes doesn't appear" is worse than one that never does: §0 law 2
   * makes this the path from a wage figure to the rule behind it.
   */
  function open(next: RuleSnapshotRequest) {
    setRequest(next);
    if (typeof window !== "undefined") {
      dispatch(
        revealWindow({
          id: WINDOW_ID,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
      );
    }
  }

  return (
    <RuleSnapshotContext.Provider value={{ open, close: () => setRequest(null) }}>
      {children}
      <DataRowWindow
        isOpen={request !== null}
        onClose={() => setRequest(null)}
        title={request ? `How this was calculated — ${request.title}` : "How this was calculated"}
        windowId={WINDOW_ID}
        width={760}
        height={620}
        viewContent={
          request ? (
            <ErrorBoundaryWithCapture
              boundary="HrTimeRuleSnapshot"
              relation={request.title}
              resetKeys={[request]}
              fallback={(error) => <RuleSnapshotFailure error={error} />}
            >
              <RuleSnapshotBody request={request} />
            </ErrorBoundaryWithCapture>
          ) : null
        }
      />
    </RuleSnapshotContext.Provider>
  );
}

/**
 * 🚨 A RECOVERY LAYER THAT SCREAMS (CLAUDE.md § Errors).
 *
 * The second candidate for "the drawer opens nothing" is a throw while preparing this body — an
 * unexpected shape in a `calc` bag, an unreadable timestamp — which React answers by unmounting the
 * subtree, silently. The canonical boundary above captures that failure for the Error Inspector;
 * this fallback makes it visible and quotable to the reader.
 */
function RuleSnapshotFailure({ error }: { error: Error }) {
  return (
    <div className="h-full w-full space-y-2 overflow-y-auto bg-popover p-4 text-sm text-popover-foreground">
      <h2 className="text-sm font-semibold">
        This figure&rsquo;s calculation record could not be displayed
      </h2>
      <p className="text-xs text-muted-foreground">
        The record exists — the panel failed while rendering it. Tell an HR administrator and quote
        this: <span className="font-mono">{error.message}</span>
      </p>
    </div>
  );
}

function RuleSnapshotBody({ request }: { request: RuleSnapshotRequest }) {
  const { calc, extra, body, subtitle } = request;
  return (
    /*
     * 🚨 THE BODY OWNS AN OPAQUE SURFACE AND ITS OWN HEIGHT (G2 round-11, N1).
     *
     * The drawer was mounting with correct content — engine, version, three rule version ids, calc
     * inputs — and a verifier reported that clicking the OT figure opened nothing. The panel is a
     * `position: fixed`, `z-index: 1000` child of `<body>`, so it was never trapped; what it lacked
     * was a body that FILLS and PAINTS. Against the page behind it the content read as unrendered.
     * A drawer that is technically present and practically unreadable is a dead end with extra
     * steps.
     */
    <div className="h-full min-h-0 w-full space-y-5 overflow-y-auto bg-popover p-4 text-sm text-popover-foreground">
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
                  ? formatDateTimeInTz(calc.computedAt, viewerTimeZone())
                  : "Not recorded"
              }
            />
          </Section>

          <RulesSection calc={calc} />

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

/**
 * 🚨 WHICH LAW PRODUCED THE FIGURE — names and thresholds, not bare uuids (§0 law 2).
 *
 * `calc_ref.rules` now serves each rule version's name, jurisdiction, status and NORMALISED
 * thresholds, so a reader can see *"California daily overtime · US-CA · after 8 hours"* instead of
 * `800b1208-1b69-…`. The id stays on screen because it is the evidence a dispute is argued from.
 *
 * 🚨 `status: "superseded"` IS RENDERED, NOT FILTERED. A snapshot cites the rule **as it stood when
 * the figure was computed**, and the server deliberately resolves superseded rows for that reason.
 * Hiding the qualifier would let a reader believe they are looking at today's law — which is
 * exactly the wrong conclusion to draw in a wage dispute about a period months old.
 *
 * Older snapshots carry only `rule_version_ids`; those still render as ids, because inventing a
 * name for a rule nobody resolved would be worse than showing the id it was stamped with.
 */
/*
 * ⚠️ CAMELCASE KEYS ON PURPOSE. The server normalises these as `daily_ot_at` / `weekly_ot_at` /
 * `dt_at`, and the RPC door camelizes every response key on the way in — so by the time a threshold
 * reaches this map it is `dailyOtAt`. Writing the snake spelling here silently misses every label
 * and prints the raw key at a reader (seen live before this comment existed).
 */
const THRESHOLD_LABELS: Record<string, string> = {
  dailyOtAt: "Daily overtime after",
  weeklyOtAt: "Weekly overtime after",
  dtAt: "Double time after",
  multiplier: "Multiplier",
  seventhDayBeyondHours: "Seventh consecutive day, beyond",
  seventhDayFirstHours: "Seventh consecutive day, first",
};

/** Hours-valued thresholds read as bare numbers otherwise — "8" is not "after 8 hours". */
const HOUR_THRESHOLDS = new Set([
  "dailyOtAt",
  "weeklyOtAt",
  "dtAt",
  "seventhDayBeyondHours",
  "seventhDayFirstHours",
]);

function RulesSection({ calc }: { calc: CalcBlock }) {
  const rules = calc.rules ?? [];

  if (rules.length === 0) {
    return (
      <Section title="Which rule versions applied">
        {calc.ruleVersionIds.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No rule version was stamped on this figure. That is itself a finding — tell an HR
            administrator, because a figure without a rule version cannot be defended.
          </p>
        ) : (
          <>
            <p className="mb-1.5 text-xs text-muted-foreground">
              This snapshot predates named rule evidence, so it carries version identifiers only.
            </p>
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
          </>
        )}
      </Section>
    );
  }

  return (
    <Section title="Which rules applied">
      <ul className="space-y-2">
        {rules.map((rule) => {
          const thresholds = Object.entries(rule.thresholds ?? {}).filter(
            ([, v]) => v !== null && v !== undefined,
          );
          return (
            <li key={rule.id} className="rounded-md border border-border bg-muted/30 px-2.5 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-xs font-medium">{rule.name ?? "Unnamed rule"}</span>
                <span className="text-[11px] text-muted-foreground">{rule.jurisdictionKey}</span>
              </div>

              {/* The qualifier. Present only when the server says so. */}
              {rule.status && rule.status !== "active" ? (
                <p className="mt-1 rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[11px]">
                  This rule is <span className="font-medium">{rule.status}</span> today. It is shown
                  because it is the version that was in force when this figure was calculated — not
                  the rule that would apply now.
                </p>
              ) : null}

              {thresholds.length > 0 ? (
                <dl className="mt-1.5 space-y-0.5">
                  {thresholds.map(([key, value]) => (
                    <div key={key} className="flex items-baseline justify-between gap-3">
                      <dt className="text-[11px] text-muted-foreground">
                        {THRESHOLD_LABELS[key] ?? key.replace(/_/g, " ")}
                      </dt>
                      <dd className="text-[11px] font-medium">
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : HOUR_THRESHOLDS.has(key)
                            ? `${String(value)} hours`
                            : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{rule.id}</p>
            </li>
          );
        })}
      </ul>
    </Section>
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
