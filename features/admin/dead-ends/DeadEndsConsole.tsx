"use client";

/**
 * No Dead Ends scoreboard — the admin view of `pnpm check:dead-ends`.
 *
 * Documentation was necessary and not sufficient; a check nobody looks at is
 * the same. This page is the part every previous "we added a check" skipped:
 * the standing, ranked, openable scoreboard for the Door Law campaign.
 *
 * It obeys the doctrine it enforces. Every row is a door:
 *   file          → the exact source line at the scanned commit (new tab)
 *   route         → the offending surface itself, in-app and in a new tab
 *   feature/file  → a count is a door; clicking a bucket filters the findings
 *   every finding → a one-click, paste-ready repair brief (the fix ships with
 *                   the complaint — corollary 2)
 *
 * THE FRAGMENTATION LAW: this is ONE statically-imported client component
 * behind the server page. No `next/dynamic`, no per-tab split — the whole
 * surface is a table plus some cards.
 *
 * Data: the committed `scripts/dead-ends/report.json`, the same snapshot
 * pattern the shape doctor uses. Refresh with `pnpm check:dead-ends:write`
 * and commit — the page says so, loudly, with the scan's age.
 */

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  DoorOpen,
  ExternalLink,
  ShieldOff,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { describeFinding, isRegistryToken } from "@/scripts/dead-ends/describe";
import {
  RULE_DOCTRINE,
  RULE_TITLES,
  type DeadEndFinding,
  type DeadEndHistoryPoint,
  type DeadEndReport,
  type DeadEndRuleId,
  type DeadEndSeverity,
} from "@/scripts/dead-ends/types";
import { fixPromptForBucket, fixPromptForFinding } from "./fix-prompt";
import {
  ENTITY_REGISTRY_PATH,
  commitHref,
  pathHref,
  sourceHref,
} from "./source-links";

const DOCTRINE_HREF =
  "https://github.com/armanisadeghi/ai-matrx/blob/main/.claude/skills/no-dead-ends/SKILL.md";

/** A scan older than this is stale enough that the page must say so. */
const STALE_AFTER_DAYS = 7;

/** The one-click fix that ships with the staleness complaint. */
const REFRESH_COMMAND = "pnpm check:dead-ends:write";

/**
 * A finding in `app/(core)/tasks/[id]/page.tsx` reports the route pattern
 * `/tasks/[id]`, which is NOT a URL — the App Router throws
 * "Dynamic href found in <Link>" on it. Patterns render as text; only concrete
 * routes get a door.
 */
function isConcreteRoute(route: string | null): route is string {
  return route !== null && !route.includes("[");
}

/** The clock never notifies us; the age only needs to be right on mount. */
const subscribeToNothing = () => () => {};

function ageInDays(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : 0;
}

interface DeadEndsConsoleProps {
  report: DeadEndReport;
  history: DeadEndHistoryPoint[];
  /**
   * Ways the snapshot's headline numbers disagree with its own findings list
   * (`reconcileReport`). Empty on every machine-written report; non-empty means
   * the file was hand-edited or half-committed, and the page must say so
   * instead of printing a total it cannot support.
   */
  problems: string[];
}

type BucketFilter =
  | { kind: "none" }
  | { kind: "file"; value: string }
  | { kind: "feature"; value: string }
  | { kind: "rule"; value: DeadEndRuleId }
  | { kind: "severity"; value: DeadEndSeverity };

export function DeadEndsConsole({ report, history, problems }: DeadEndsConsoleProps) {
  const [bucket, setBucket] = useState<BucketFilter>({ kind: "none" });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  /**
   * Snapshot age in days. The wall clock is an external system, so it is read
   * through `useSyncExternalStore` rather than during render — `Date.now()` in
   * a render body is impure and a setState-in-effect would cascade. The
   * snapshot is a whole number of days, so it is stable across re-renders and
   * React's Object.is check never loops. `null` on the server.
   */
  const scanAgeDays = useSyncExternalStore(
    subscribeToNothing,
    () => ageInDays(report.generatedAt),
    () => null,
  );

  // No useMemo anywhere in this file — the React Compiler is on
  // (next.config.js `reactCompiler: true`) and CLAUDE.md bans manual memoization.
  const findings = filterFindings(report.findings, bucket);

  const copy = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
      toast.success(`${label} copied`);
    } catch {
      // Never swallow: the operator needs to know the click did nothing.
      toast.error("Clipboard unavailable — select the text manually.");
    }
  };

  const columns: MatrxColumnDef<DeadEndFinding>[] = [
      {
        id: "severity",
        accessorKey: "severity",
        header: "Sev",
        filter: "select",
        width: 84,
        cell: (f) => (
          <Badge
            variant={f.severity === "high" ? "destructive" : "secondary"}
            className="text-[10px] uppercase"
          >
            {f.severity}
          </Badge>
        ),
      },
      {
        id: "rule",
        accessorKey: "rule",
        header: "Rule",
        filter: "select",
        width: 190,
        cell: (f) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBucket({ kind: "rule", value: f.rule });
            }}
            title={`Show only ${RULE_TITLES[f.rule]}`}
            className="block w-full truncate text-left text-xs text-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            {RULE_TITLES[f.rule]}
          </button>
        ),
      },
      {
        id: "entity",
        accessorKey: "entity",
        header: "Entity",
        filter: "select",
        width: 150,
        cell: (f) => (
          <span className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 truncate font-mono text-xs">{f.entity}</span>
            {f.entityHasRoute ? (
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                route
              </Badge>
            ) : isRegistryToken(f.entity) ? (
              <Link
                href={sourceHref(ENTITY_REGISTRY_PATH, 1)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="No hrefFor for this token — open the entity registry to add one"
                className="text-[9px] text-amber-600 underline underline-offset-2 dark:text-amber-500"
              >
                no route
              </Link>
            ) : null}
          </span>
        ),
      },
      {
        id: "file",
        accessorKey: "file",
        header: "Source",
        width: 420,
        cell: (f) => (
          <span className="flex min-w-0 max-w-full items-center gap-1">
            <Link
              href={sourceHref(f.file, f.line)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Open ${f.file}:${f.line} on main (line is from the scan — see the snapshot age)`}
              className="min-w-0 truncate font-mono text-xs text-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              {f.file}:{f.line}
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBucket({ kind: "file", value: f.file });
              }}
              title="Show only this file's findings"
              className="shrink-0 rounded px-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              only
            </button>
          </span>
        ),
      },
      {
        id: "expression",
        accessorKey: "expression",
        header: "Renders",
        width: 220,
        cell: (f) => (
          <code
            className="block w-full truncate text-xs text-muted-foreground"
            title={f.expression}
          >
            {f.expression}
          </code>
        ),
      },
      {
        id: "route",
        accessorKey: "route",
        header: "Surface",
        width: 260,
        cell: (f) =>
          isConcreteRoute(f.route) ? (
            <span className="flex min-w-0 items-center gap-1">
              <Link
                href={f.route}
                onClick={(e) => e.stopPropagation()}
                title={`Open ${f.route}`}
                className="min-w-0 truncate text-xs underline-offset-2 hover:text-primary hover:underline"
              >
                {f.route}
              </Link>
              <Link
                href={f.route}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Open ${f.route} in a new tab`}
                aria-label={`Open ${f.route} in a new tab`}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </Link>
            </span>
          ) : f.route ? (
            <span
              className="truncate text-xs text-muted-foreground"
              title="Dynamic route pattern — needs a record id to open"
            >
              {f.route}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">component</span>
          ),
      },
      {
        id: "fix",
        header: "Fix",
        filter: false,
        sortable: false,
        width: 76,
        align: "center",
        cell: (f) => {
          const key = `${f.file}:${f.line}:${f.column}`;
          return (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              title="Copy a paste-ready repair brief for an agent"
              aria-label={`Copy a repair brief for ${f.file}:${f.line}`}
              onClick={(e) => {
                e.stopPropagation();
                void copy(key, fixPromptForFinding(f), "Repair brief");
              }}
            >
              {copiedKey === key ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          );
        },
      },
  ];

  // The delta's baseline is "the newest history point that is NOT this report",
  // matched on the scan's own identity — never blindly `history.length - 2`.
  //
  // `report.json` and `history.json` are written together by `--write`, but they
  // are two committed files: a partial commit (or a hand-edit) lands one without
  // the other. Index arithmetic then silently compares the current totals against
  // the wrong prior point and prints a confident number that is simply false —
  // "-40 since last scan" while the trend's last bar still shows the old total.
  // A scoreboard whose headline stat can lie is worse than one with no stat.
  const currentInHistory = history.findIndex(
    (p) => p.generatedAt === report.generatedAt && p.commit === report.commit,
  );
  const priorPoints =
    currentInHistory >= 0 ? history.slice(0, currentInHistory) : [];
  const previous = priorPoints.length > 0 ? priorPoints[priorPoints.length - 1] : null;
  // No match means the two files disagree about which scan is current. Say
  // nothing rather than compute against a point that is not the predecessor.
  const delta =
    currentInHistory >= 0 && previous
      ? report.totals.findings - previous.findings
      : null;

  /**
   * The loaded report is not in the history at all — the two committed files
   * describe different scans.
   *
   * Withholding the delta (above) was necessary but NOT sufficient: the trend
   * below still plots history alone, so the hero would read "142 findings"
   * while the last bar showed some other total, and nothing on the page said
   * why. A silent inconsistency on a scoreboard is the failure this whole
   * surface exists to prevent, so it joins the same loud alert the internal
   * reconcile uses — shown, never thrown.
   */
  const currentIsPlotted = currentInHistory >= 0;
  const historyDrift =
    history.length > 0 && !currentIsPlotted
      ? `history.json does not contain this report's scan (${report.generatedAt}` +
        `${report.commit ? ` @ ${report.commit.slice(0, 7)}` : ""}), so the ` +
        `trend below ends at a different scan than the totals above`
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <Header
        report={report}
        scanAgeDays={scanAgeDays}
        delta={delta}
        problems={problems}
        historyDrift={historyDrift}
        onCopyRefresh={() =>
          void copy("refresh", REFRESH_COMMAND, "Refresh command")
        }
        onCopyAll={() =>
          void copy(
            "all",
            fixPromptForBucket(
              "the whole repository",
              report.findings,
              "repository",
              null,
            ),
            "Campaign brief",
          )
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <TotalsCard
          report={report}
          delta={delta}
          history={history}
          endsAtCurrentScan={currentIsPlotted}
          onPickSeverity={(severity) => setBucket({ kind: "severity", value: severity })}
        />
        <BucketCard
          title="Worst features"
          buckets={report.worstFeatures.slice(0, 8)}
          commit={report.commit}
          active={bucket.kind === "feature" ? bucket.value : null}
          onPick={(value) => setBucket({ kind: "feature", value })}
          onCopy={(value) =>
            void copy(
              `feature:${value}`,
              fixPromptForBucket(
                value,
                report.findings.filter((f) => f.feature === value),
                "feature",
              ),
              "Sweep brief",
            )
          }
        />
        <BucketCard
          title="Worst files"
          buckets={report.worstFiles.slice(0, 8)}
          commit={report.commit}
          active={bucket.kind === "file" ? bucket.value : null}
          onPick={(value) => setBucket({ kind: "file", value })}
          onCopy={(value) =>
            void copy(
              `file:${value}`,
              fixPromptForBucket(
                value,
                report.findings.filter((f) => f.file === value),
                "file",
              ),
              "Sweep brief",
            )
          }
        />
      </div>

      <RuleLegend
        report={report}
        active={bucket.kind === "rule" ? bucket.value : null}
        onPick={(rule) => setBucket({ kind: "rule", value: rule })}
      />

      {bucket.kind !== "none" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Filtered to</span>
          <code className="font-mono">
            {bucket.kind === "rule"
              ? RULE_TITLES[bucket.value]
              : bucket.kind === "severity"
                ? `${bucket.value} severity`
                : bucket.value}
          </code>
          <Badge variant="secondary">{findings.length}</Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => setBucket({ kind: "none" })}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={findings}
          columns={columns}
          getRowId={(f) => `${f.file}:${f.line}:${f.column}:${f.rule}`}
          pageSize={50}
          emptyState={{
            icon: <DoorOpen className="h-8 w-8 text-muted-foreground" />,
            title:
              report.totals.findings === 0
                ? "No dead ends detected"
                : "No findings match this filter",
            description:
              report.totals.findings === 0
                ? "Every named record the detector can see has a door. Keep it that way."
                : "Clear the bucket filter to see the full report.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search file, entity, expression…",
          }}
          copy={{
            label: "Dead-end finding",
            listLabel: "Dead-end findings (this view)",
            location: "/administration/reporting/dead-ends",
            rowKind: "dead-end-finding",
            listKind: "dead-end-findings",
            humanRow: (f) =>
              `${f.file}:${f.line} [${f.rule}/${f.severity}] ${f.entity} — ${describeFinding(f)}`,
            rowAttributes: (f) => ({
              file: f.file,
              line: f.line,
              rule: f.rule,
              severity: f.severity,
              entity: f.entity,
              entity_has_route: f.entityHasRoute,
              route: f.route,
            }),
          }}
          detail={{
            title: (f) => (
              <span className="font-mono text-sm">
                {f.file.split("/").pop()}:{f.line}
              </span>
            ),
            description: (f) => RULE_TITLES[f.rule],
            defaultWidth: 560,
            render: (f) => (
              <FindingDetail
                finding={f}
                commit={report.commit}
                onCopyFix={() =>
                  void copy(
                    `detail:${f.file}:${f.line}`,
                    fixPromptForFinding(f),
                    "Repair brief",
                  )
                }
              />
            ),
          }}
        />
      </div>

      <AllowlistPanel report={report} />
    </div>
  );
}

function filterFindings(
  findings: DeadEndFinding[],
  bucket: BucketFilter,
): DeadEndFinding[] {
  switch (bucket.kind) {
    case "file":
      return findings.filter((f) => f.file === bucket.value);
    case "feature":
      return findings.filter((f) => f.feature === bucket.value);
    case "rule":
      return findings.filter((f) => f.rule === bucket.value);
    case "severity":
      return findings.filter((f) => f.severity === bucket.value);
    default:
      return findings;
  }
}

// ─── Header ─────────────────────────────────────────────────────────────────

function Header({
  report,
  scanAgeDays,
  delta,
  problems,
  historyDrift,
  onCopyAll,
  onCopyRefresh,
}: {
  report: DeadEndReport;
  /** `null` until the client has read the clock (see the console above). */
  scanAgeDays: number | null;
  delta: number | null;
  /** Ways `report.json`'s totals disagree with its OWN findings list. */
  problems: string[];
  /**
   * The way `report.json` and `history.json` disagree about which scan is
   * current, or `null`. Kept SEPARATE from `problems` rather than concatenated:
   * the two are different failures with different repairs, and one headline
   * covering both would state whichever it names as fact — the exact defect
   * this alert exists to prevent.
   */
  historyDrift: string | null;
  onCopyAll: () => void;
  onCopyRefresh: () => void;
}) {
  const stale = scanAgeDays !== null && scanAgeDays >= STALE_AFTER_DAYS;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <DoorOpen className="h-5 w-5 text-primary" />
        <h1 className="text-base font-semibold">No Dead Ends</h1>
        <Badge variant="outline" className="text-[10px]">
          Door Law detector
        </Badge>
      </div>

      <span className="text-xs text-muted-foreground">
        {report.totals.filesScanned.toLocaleString()} files scanned
        {report.commit ? (
          <>
            {" · "}
            <Link
              href={commitHref(report.commit)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono underline-offset-2 hover:text-primary hover:underline"
              title="Open the scanned commit"
            >
              {report.commit.slice(0, 7)}
            </Link>
          </>
        ) : null}
        {scanAgeDays === null
          ? null
          : scanAgeDays === 0
            ? " · scanned today"
            : ` · scanned ${scanAgeDays}d ago`}
      </span>

      {stale && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Snapshot is {scanAgeDays} days old — run{" "}
          <code className="font-mono">pnpm check:dead-ends:write</code> and commit.
          <button
            type="button"
            onClick={onCopyRefresh}
            title="Copy the refresh command"
            aria-label="Copy the refresh command"
            className="rounded p-0.5 hover:bg-amber-500/20"
          >
            <Copy className="h-3 w-3" />
          </button>
        </span>
      )}

      {(problems.length > 0 || historyDrift) && (
        <span
          className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-red-500/50 bg-red-500/10 px-2 py-1 text-[11px] text-red-700 dark:text-red-400"
          role="alert"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <strong className="font-semibold">
            {problems.length > 0 && historyDrift
              ? "Snapshot is inconsistent — the totals disagree with the findings below, and the trend is from a different scan."
              : problems.length > 0
                ? "Snapshot is inconsistent — the totals below do not match its own findings."
                : "Snapshot is inconsistent — the trend below is from a different scan than the totals."}
          </strong>
          <span>
            {[...problems, ...(historyDrift ? [historyDrift] : [])].join("; ")}. Re-run{" "}
            <code className="font-mono">pnpm check:dead-ends:write</code> and commit both
            JSON files together.
          </span>
          <button
            type="button"
            onClick={onCopyRefresh}
            title="Copy the refresh command"
            aria-label="Copy the refresh command"
            className="rounded p-0.5 hover:bg-red-500/20"
          >
            <Copy className="h-3 w-3" />
          </button>
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onCopyAll} className="h-7 text-xs">
          <Copy className="mr-1.5 h-3 w-3" />
          Campaign brief
        </Button>
        <Link
          href={DOCTRINE_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Doctrine
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────────

function TotalsCard({
  report,
  delta,
  history,
  endsAtCurrentScan,
  onPickSeverity,
}: {
  report: DeadEndReport;
  delta: number | null;
  history: DeadEndHistoryPoint[];
  /** False when the loaded report is absent from history — see the console. */
  endsAtCurrentScan: boolean;
  onPickSeverity: (severity: DeadEndSeverity) => void;
}) {
  const { totals } = report;
  const allowlistCount = report.allowlist.length;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold tabular-nums">{totals.findings}</span>
        <span className="text-xs text-muted-foreground">findings</span>
        {delta !== null && delta !== 0 && (
          <span
            className={
              delta < 0
                ? "inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-500"
                : "inline-flex items-center gap-1 text-xs text-destructive"
            }
          >
            {delta < 0 ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5" />
            )}
            {delta > 0 ? `+${delta}` : delta} since last scan
          </span>
        )}
        {delta === 0 && (
          <span className="text-xs text-muted-foreground">unchanged since last scan</span>
        )}
      </div>

      {/* A count is a door — these filter the table, same as the bucket cards. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => onPickSeverity("high")}
          title="Show only high-severity findings"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          <span className="font-medium text-destructive">{totals.high}</span> high
        </button>
        <button
          type="button"
          onClick={() => onPickSeverity("medium")}
          title="Show only medium-severity findings"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          <span className="font-medium text-foreground">{totals.medium}</span> medium
        </button>
        <span>{totals.filesWithFindings} files affected</span>
        {/* `allowlisted` counts findings SUPPRESSED this run, which is 0 when an
            exempted file has nothing to suppress. Saying "0 allowlisted" beside
            a panel headed "2 exemptions" reads as a contradiction, so both
            numbers are named. */}
        <span title="Findings suppressed by the allowlist on this run / exemptions registered">
          {totals.allowlisted} suppressed · {allowlistCount} exemption
          {allowlistCount === 1 ? "" : "s"}
        </span>
      </div>

      <Trend history={history} endsAtCurrentScan={endsAtCurrentScan} />
    </div>
  );
}

/**
 * Inline SVG bars — deliberately not a chart library. This is one number over
 * time on an admin card; pulling a charting dependency into this chunk to draw
 * ten rectangles is exactly the weight the Fragmentation Law exists to avoid.
 */
function Trend({
  history,
  endsAtCurrentScan,
}: {
  history: DeadEndHistoryPoint[];
  /**
   * Whether the last bar IS the scan whose totals the page is showing. When
   * the two committed files disagree it is not, and calling it "now" in the
   * accessible label would state the inconsistency as fact to exactly the
   * users who cannot see the chart. The red alert above carries the why.
   */
  endsAtCurrentScan: boolean;
}) {
  const points = history.slice(-40);
  if (points.length < 2) {
    return (
      <p className="mt-3 text-[11px] text-muted-foreground">
        Trend appears after a second scan — run{" "}
        <code className="font-mono">pnpm check:dead-ends:write</code> and commit.
      </p>
    );
  }
  const max = Math.max(...points.map((p) => p.findings), 1);
  const width = 100;
  const height = 28;
  const barWidth = width / points.length;

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-8 w-full"
        role="img"
        aria-label={`Findings trend over the last ${points.length} scans, ${
          endsAtCurrentScan ? "now" : "last recorded"
        } ${points[points.length - 1]?.findings ?? 0}${
          endsAtCurrentScan
            ? ""
            : " — this does not match the totals above; the snapshot files disagree"
        }`}
      >
        {points.map((p, i) => {
          const total = (p.findings / max) * height;
          const high = (p.high / max) * height;
          return (
            <g key={`${p.generatedAt}-${i}`}>
              <rect
                x={i * barWidth}
                y={height - total}
                width={Math.max(barWidth - 0.6, 0.6)}
                height={total}
                className="fill-muted-foreground/30"
              />
              <rect
                x={i * barWidth}
                y={height - high}
                width={Math.max(barWidth - 0.6, 0.6)}
                height={high}
                className="fill-destructive/70"
              />
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {points.length} scan(s) · bars show total, red shows high severity
      </p>
    </div>
  );
}

function BucketCard({
  title,
  buckets,
  commit,
  active,
  onPick,
  onCopy,
}: {
  title: string;
  buckets: DeadEndReport["worstFiles"];
  commit: string | null;
  active: string | null;
  onPick: (value: string) => void;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      {buckets.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing to show.</p>
      ) : (
        <ul className="space-y-0.5">
          {buckets.map((b) => (
            <li key={b.key} className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => onPick(b.key)}
                title={`Show the ${b.count} finding(s) in ${b.key}`}
                className={
                  "min-w-0 flex-1 truncate text-left font-mono underline-offset-2 hover:text-primary hover:underline" +
                  (active === b.key ? " text-primary" : "")
                }
              >
                {b.key}
              </button>
              <span className="shrink-0 tabular-nums text-muted-foreground">{b.count}</span>
              {b.high > 0 && (
                <Badge variant="destructive" className="h-4 shrink-0 px-1 text-[9px]">
                  {b.high}
                </Badge>
              )}
              <Link
                href={b.key.includes(".") ? sourceHref(b.key, 1) : pathHref(b.key)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open ${b.key} in a new tab`}
                aria-label={`Open ${b.key} in a new tab`}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </Link>
              <button
                type="button"
                onClick={() => onCopy(b.key)}
                title="Copy a sweep brief for this bucket"
                aria-label={`Copy a sweep brief for ${b.key}`}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleLegend({
  report,
  active,
  onPick,
}: {
  report: DeadEndReport;
  active: DeadEndRuleId | null;
  onPick: (rule: DeadEndRuleId) => void;
}) {
  const entries = Object.entries(report.byRule) as [DeadEndRuleId, number][];
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
      {entries.map(([rule, count]) => (
        <button
          key={rule}
          type="button"
          onClick={() => onPick(rule)}
          title={`Show only ${RULE_TITLES[rule]}`}
          className={
            "rounded-lg border p-2 text-left transition-colors hover:bg-accent " +
            (active === rule ? "border-primary bg-accent" : "border-border bg-card")
          }
        >
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums">{count}</span>
            <span className="truncate text-xs font-medium">{RULE_TITLES[rule]}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
            {RULE_DOCTRINE[rule]}
          </p>
        </button>
      ))}
    </div>
  );
}

// ─── Detail panel ───────────────────────────────────────────────────────────

function FindingDetail({
  finding,
  commit,
  onCopyFix,
}: {
  finding: DeadEndFinding;
  commit: string | null;
  onCopyFix: () => void;
}) {
  return (
    <div className="space-y-3 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={finding.severity === "high" ? "destructive" : "secondary"}>
          {finding.severity}
        </Badge>
        <Badge variant="outline">{RULE_TITLES[finding.rule]}</Badge>
        <Badge variant="outline" className="font-mono">
          {finding.entity}
        </Badge>
      </div>

      <p className="text-sm text-foreground">{describeFinding(finding)}</p>

      <p className="rounded border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
        {RULE_DOCTRINE[finding.rule]}
      </p>

      <dl className="space-y-1.5 text-xs">
        <Row label="Renders">
          <code className="font-mono">{finding.expression}</code>
        </Row>
        <Row label="Source">
          <Link
            href={sourceHref(finding.file, finding.line)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono underline-offset-2 hover:text-primary hover:underline"
          >
            {finding.file}:{finding.line}:{finding.column}
          </Link>
        </Row>
        <Row label="Feature">
          <Link
            href={pathHref(finding.feature)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono underline-offset-2 hover:text-primary hover:underline"
          >
            {finding.feature}
          </Link>
        </Row>
        <Row label="Surface">
          {isConcreteRoute(finding.route) ? (
            <Link
              href={finding.route}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-primary hover:underline"
            >
              {finding.route}
            </Link>
          ) : finding.route ? (
            <span className="text-muted-foreground">
              <code className="font-mono">{finding.route}</code> — a dynamic
              route pattern; pick a record to open it.
            </span>
          ) : (
            <span className="text-muted-foreground">
              a component — reachable from whichever route mounts it
            </span>
          )}
        </Row>
        <Row label="Registry">
          {finding.entityHasRoute ? (
            <span className="text-muted-foreground">
              <code className="font-mono">{finding.entity}</code> already has an
              hrefFor — the door is one <code className="font-mono">EntityRef</code> away.
            </span>
          ) : isRegistryToken(finding.entity) ? (
            <Link
              href={sourceHref(ENTITY_REGISTRY_PATH, 1)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-primary hover:underline"
            >
              Add an hrefFor for <code className="font-mono">{finding.entity}</code>
            </Link>
          ) : (
            <span className="text-muted-foreground">
              The detector could not name this entity, so there is no token to
              register — identify the record yourself, then use its token.
            </span>
          )}
        </Row>
      </dl>

      <Button size="sm" variant="outline" onClick={onCopyFix} className="w-full">
        <Copy className="mr-1.5 h-3.5 w-3.5" />
        Copy repair brief for an agent
      </Button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

// ─── Allowlist ──────────────────────────────────────────────────────────────

/**
 * What we deliberately silenced, and why — rendered as prominently as what we
 * found. An exemption nobody can see is how the class comes back.
 */
function AllowlistPanel({ report }: { report: DeadEndReport }) {
  if (report.allowlist.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ShieldOff className="h-3.5 w-3.5" />
        Deliberate exemptions ({report.allowlist.length}) —
        scripts/dead-ends/allowlist.ts
      </p>
      <ul className="space-y-1.5">
        {report.allowlist.map((entry) => (
          <li key={`${entry.file}:${entry.rule ?? "*"}`} className="text-xs">
            <span className="inline-flex flex-wrap items-baseline gap-1.5">
              <Link
                href={sourceHref(entry.file, 1)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono underline-offset-2 hover:text-primary hover:underline"
              >
                {entry.file}
              </Link>
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                {entry.rule ?? "all rules"}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {entry.addedBy} · {entry.addedOn}
              </span>
            </span>
            <p className="text-muted-foreground">{entry.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
