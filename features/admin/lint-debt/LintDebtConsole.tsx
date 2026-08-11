"use client";

/**
 * ESLint debt scoreboard — the admin view of `pnpm check:lint-debt`.
 *
 * The repo carries a large repo-wide ESLint backlog. As one number it was
 * actively misleading: feature branches "failed their lint gate" for debt that
 * predated them, and the headline count mixed genuine rendering bugs in with
 * React Compiler style notes, so nobody could tell whether it mattered. This
 * page makes the backlog visible AND classified, so it can be worked down
 * worst-first instead of stared at.
 *
 * It obeys the doctrine it reports on. Every row is a door:
 *   file          → the exact source line on main (new tab)
 *   route         → the offending surface itself, in-app and in a new tab
 *   class/rule/   → a count is a door; clicking any bucket filters the findings
 *   feature/file
 *   every finding → a one-click, paste-ready repair brief carrying the two
 *                   bans that matter (no mass eslint-disable, no compiler-off)
 *
 * THE FRAGMENTATION LAW: ONE statically-imported client component behind the
 * server page. No `next/dynamic`, no per-tab split.
 *
 * Data: the committed `scripts/lint-debt/report.json` — the same snapshot
 * pattern as the dead-ends scoreboard and the shape doctor. A live ESLint run
 * over this repo takes minutes; it is not a page load. Refresh with
 * `pnpm check:lint-debt:write` and commit — the page says so, with the age.
 */

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { commitHref, pathHref, sourceHref } from "@/features/admin/reporting/source-links";
import {
  CLASS_DOCTRINE,
  CLASS_TITLES,
  LINT_DEBT_CLASSES,
  classOf,
  isReal,
  type LintDebtBucket,
  type LintDebtClass,
  type LintDebtFinding,
  type LintDebtHistoryPoint,
  type LintDebtReport,
} from "@/scripts/lint-debt/types";
import { fixPromptForBucket, fixPromptForFinding } from "./fix-prompt";

/** A scan older than this is stale enough that the page must say so. */
const STALE_AFTER_DAYS = 7;

/** The one-click fix that ships with the staleness complaint. */
const REFRESH_COMMAND = "pnpm check:lint-debt:write";

const HANDOFF_PATH = "docs/handoffs/eslint-debt-campaign.md";

/**
 * A finding in `app/(core)/tasks/[id]/page.tsx` reports the route PATTERN
 * `/tasks/[id]`, which is not a URL — the App Router throws "Dynamic href
 * found in <Link>" on it. Patterns render as text; only concrete routes get a
 * door. (Same gate as the dead-ends console; the trap is identical.)
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

function classTone(klass: LintDebtClass): string {
  switch (klass) {
    case "bug":
      return "text-red-600 dark:text-red-400";
    case "correctness":
      return "text-amber-600 dark:text-amber-400";
    case "doctrine":
      return "text-violet-600 dark:text-violet-400";
    default:
      return "text-muted-foreground";
  }
}

type BucketFilter =
  | { kind: "none" }
  | { kind: "file"; value: string }
  | { kind: "feature"; value: string }
  | { kind: "rule"; value: string }
  | { kind: "class"; value: LintDebtClass };

interface LintDebtConsoleProps {
  report: LintDebtReport;
  history: LintDebtHistoryPoint[];
  /**
   * Ways the snapshot's headline numbers disagree with its own findings list,
   * plus any rule that arrived with no classification. Shown, never thrown —
   * the rows are still worth reading.
   */
  problems: string[];
}

export function LintDebtConsole({ report, history, problems }: LintDebtConsoleProps) {
  const [bucket, setBucket] = useState<BucketFilter>({ kind: "none" });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  /**
   * Snapshot age in days. The wall clock is an external system, so it is read
   * through `useSyncExternalStore` rather than during render — `Date.now()` in
   * a render body is impure (react-hooks/purity, one of the very rules this
   * page reports) and a setState-in-effect would cascade.
   */
  const scanAgeDays = useSyncExternalStore(
    subscribeToNothing,
    () => ageInDays(report.generatedAt),
    () => null,
  );

  // No useMemo anywhere in this file — the React Compiler is on and CLAUDE.md
  // bans manual memoization.
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

  const columns: MatrxColumnDef<LintDebtFinding>[] = [
    {
      id: "klass",
      accessorFn: (f) => classOf(f.rule),
      header: "Class",
      filter: "select",
      width: 110,
      cell: (f) => {
        const klass = classOf(f.rule);
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBucket({ kind: "class", value: klass });
            }}
            title={CLASS_DOCTRINE[klass]}
            className={`block w-full truncate text-left text-[11px] font-medium uppercase underline-offset-2 hover:underline ${classTone(klass)}`}
          >
            {klass}
          </button>
        );
      },
    },
    {
      id: "rule",
      accessorKey: "rule",
      header: "Rule",
      filter: "select",
      width: 240,
      cell: (f) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setBucket({ kind: "rule", value: f.rule });
          }}
          title={`Show only ${f.rule}`}
          className="block w-full truncate text-left font-mono text-xs text-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          {f.rule}
        </button>
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
      id: "message",
      accessorKey: "message",
      header: "What ESLint says",
      width: 420,
      cell: (f) => (
        <span className="block w-full truncate text-xs text-muted-foreground" title={f.message}>
          {f.message}
        </span>
      ),
    },
    {
      id: "route",
      accessorKey: "route",
      header: "Surface",
      width: 240,
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
      width: 70,
      align: "center",
      cell: (f) => {
        const key = `${f.file}:${f.line}:${f.column}:${f.rule}`;
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
            {copiedKey === key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        );
      },
    },
  ];

  /**
   * The delta's baseline is "the newest history point that is NOT this report",
   * matched on the scan's own identity — never `history.length - 2`.
   *
   * `report.json` and `history.json` are written together but committed as two
   * files: a partial commit lands one without the other, and index arithmetic
   * then prints a confident number that is simply false. This trap is inherited
   * verbatim from the dead-ends console, where it was found the hard way.
   */
  const currentInHistory = history.findIndex(
    (p) => p.generatedAt === report.generatedAt && p.commit === report.commit,
  );
  const previous = currentInHistory > 0 ? history[currentInHistory - 1] : null;
  const delta = currentInHistory >= 0 && previous ? report.totals.errors - previous.errors : null;
  const historyDrift =
    history.length > 0 && currentInHistory < 0
      ? `history.json does not contain this report's scan (${report.generatedAt}` +
        `${report.commit ? ` @ ${report.commit.slice(0, 7)}` : ""}), so the trend ` +
        `ends at a different scan than the totals above`
      : null;

  const realTotal = report.totals.byClass.bug + report.totals.byClass.correctness;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <Header
        report={report}
        scanAgeDays={scanAgeDays}
        delta={delta}
        problems={problems}
        historyDrift={historyDrift}
        onCopyRefresh={() => void copy("refresh", REFRESH_COMMAND, "Refresh command")}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ClassCard
          report={report}
          realTotal={realTotal}
          delta={delta}
          active={bucket.kind === "class" ? bucket.value : null}
          onPick={(value) => setBucket({ kind: "class", value })}
          onCopy={(value) =>
            void copy(
              `class:${value}`,
              fixPromptForBucket(
                CLASS_TITLES[value],
                report.findings.filter((f) => classOf(f.rule) === value),
                "repository",
                null,
              ),
              "Sweep brief",
            )
          }
        />
        <BucketCard
          title="Worst features"
          buckets={report.worstFeatures.slice(0, 8)}
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
        onCopy={(rule) =>
          void copy(
            `rule:${rule}`,
            fixPromptForBucket(
              rule,
              report.findings.filter((f) => f.rule === rule),
              "rule",
              null,
            ),
            "Sweep brief",
          )
        }
      />

      {bucket.kind !== "none" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Filtered to</span>
          <code className="font-mono">
            {bucket.kind === "class" ? CLASS_TITLES[bucket.value] : bucket.value}
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
            icon: <ShieldCheck className="h-8 w-8 text-muted-foreground" />,
            title:
              report.totals.errors === 0
                ? "No error-severity lint findings"
                : "No findings match this filter",
            description:
              report.totals.errors === 0
                ? "The tree is clean at error severity. Promote check:lint-debt into the strict release gates."
                : "Clear the bucket filter to see the full report.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search file, rule, message…",
          }}
          copy={{
            label: "Lint finding",
            listLabel: "Lint findings (this view)",
            location: "/administration/reporting/lint-debt",
            rowKind: "lint-finding",
            listKind: "lint-findings",
            humanRow: (f) => `${f.file}:${f.line} [${f.rule}] ${f.message}`,
            rowAttributes: (f) => ({
              file: f.file,
              line: f.line,
              rule: f.rule,
              class: classOf(f.rule),
              route: f.route,
            }),
          }}
          detail={{
            title: (f) => (
              <span className="font-mono text-sm">
                {f.file.split("/").pop()}:{f.line}
              </span>
            ),
            description: (f) => f.rule,
            defaultWidth: 560,
            render: (f) => (
              <FindingDetail
                finding={f}
                onCopyFix={() =>
                  void copy(`detail:${f.file}:${f.line}`, fixPromptForFinding(f), "Repair brief")
                }
              />
            ),
          }}
        />
      </div>
    </div>
  );
}

function filterFindings(findings: LintDebtFinding[], bucket: BucketFilter): LintDebtFinding[] {
  switch (bucket.kind) {
    case "file":
      return findings.filter((f) => f.file === bucket.value);
    case "feature":
      return findings.filter((f) => f.feature === bucket.value);
    case "rule":
      return findings.filter((f) => f.rule === bucket.value);
    case "class":
      return findings.filter((f) => classOf(f.rule) === bucket.value);
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
  onCopyRefresh,
}: {
  report: LintDebtReport;
  /** `null` until the client has read the clock. */
  scanAgeDays: number | null;
  delta: number | null;
  problems: string[];
  historyDrift: string | null;
  onCopyRefresh: () => void;
}) {
  const stale = scanAgeDays !== null && scanAgeDays > STALE_AFTER_DAYS;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold text-foreground">ESLint debt</h1>
        <p className="text-xs text-muted-foreground">
          Every error-severity finding from the repo&apos;s real ESLint config, classified by
          whether it is a bug or a style note. Advisory — this never blocks a build or a commit.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          Scanned {report.totals.filesScanned.toLocaleString()} files
          {scanAgeDays === null
            ? ""
            : scanAgeDays === 0
              ? " · today"
              : ` · ${scanAgeDays} day${scanAgeDays === 1 ? "" : "s"} ago`}
        </span>
        {report.commit && (
          <Link
            href={commitHref(report.commit)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono underline-offset-2 hover:text-foreground hover:underline"
            title="The commit this scan ran against"
          >
            {report.commit.slice(0, 7)}
          </Link>
        )}
        <Link
          href={pathHref(HANDOFF_PATH)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          Campaign handoff
        </Link>
        <Link
          href={pathHref("scripts/lint-debt/FEATURE.md")}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          How this is classified
        </Link>
        {delta !== null && delta !== 0 && (
          <span
            className={`inline-flex items-center gap-1 ${delta < 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            title="Change since the previous committed scan"
          >
            {delta < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <TrendingUp className="h-3 w-3" />
            )}
            {delta > 0 ? "+" : ""}
            {delta} since last scan
          </span>
        )}
      </div>

      {stale && (
        <Alert
          tone="warn"
          text={`This snapshot is ${scanAgeDays} days old — the line numbers below have almost certainly drifted.`}
          action={{ label: `Copy \`${REFRESH_COMMAND}\``, onClick: onCopyRefresh }}
        />
      )}
      {historyDrift && <Alert tone="warn" text={historyDrift} />}
      {problems.map((problem) => (
        <Alert key={problem} tone="error" text={problem} />
      ))}
    </div>
  );
}

function Alert({
  tone,
  text,
  action,
}: {
  tone: "warn" | "error";
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
        tone === "error"
          ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
      }`}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{text}</span>
      {action && (
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────────

function ClassCard({
  report,
  realTotal,
  delta,
  active,
  onPick,
  onCopy,
}: {
  report: LintDebtReport;
  realTotal: number;
  delta: number | null;
  active: LintDebtClass | null;
  onPick: (klass: LintDebtClass) => void;
  onCopy: (klass: LintDebtClass) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">Total</span>
        {delta !== null && (
          <span className="text-[10px] text-muted-foreground">
            {delta > 0 ? "+" : ""}
            {delta} vs last scan
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {report.totals.errors.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">
          errors in {report.totals.filesWithFindings.toLocaleString()} files
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        <span className={realTotal > 0 ? "font-medium text-red-600 dark:text-red-400" : ""}>
          {realTotal.toLocaleString()}
        </span>{" "}
        are real bugs or correctness hazards — the rest is style and doctrine.
      </p>

      <div className="mt-2 flex flex-col gap-0.5">
        {LINT_DEBT_CLASSES.map((klass) => {
          const count = report.totals.byClass[klass];
          return (
            <div key={klass} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPick(klass)}
                title={CLASS_DOCTRINE[klass]}
                className={`flex min-w-0 flex-1 items-center justify-between rounded px-1.5 py-0.5 text-left text-xs hover:bg-accent ${
                  active === klass ? "bg-accent" : ""
                }`}
              >
                <span className={`truncate ${classTone(klass)}`}>{CLASS_TITLES[klass]}</span>
                <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">{count}</span>
              </button>
              {count > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 shrink-0 px-1"
                  title={`Copy a sweep brief for every ${CLASS_TITLES[klass].toLowerCase()} finding`}
                  aria-label={`Copy a sweep brief for ${CLASS_TITLES[klass]}`}
                  onClick={() => onCopy(klass)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BucketCard({
  title,
  buckets,
  active,
  onPick,
  onCopy,
}: {
  title: string;
  buckets: LintDebtBucket[];
  active: string | null;
  onPick: (value: string) => void;
  onCopy: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <span className="text-[10px] text-muted-foreground">ranked by real bugs</span>
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        {buckets.length === 0 && <span className="text-xs text-muted-foreground">None.</span>}
        {buckets.map((b) => (
          <div key={b.key} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPick(b.key)}
              title={`Show only ${b.key}`}
              className={`flex min-w-0 flex-1 items-center justify-between rounded px-1.5 py-0.5 text-left text-xs hover:bg-accent ${
                active === b.key ? "bg-accent" : ""
              }`}
            >
              <span className="min-w-0 truncate font-mono text-foreground">{b.key}</span>
              <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                {b.count}
                {b.real > 0 && (
                  <span className="text-red-600 dark:text-red-400"> · {b.real}</span>
                )}
              </span>
            </button>
            <Link
              href={pathHref(b.key)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${b.key} on main`}
              aria-label={`Open ${b.key} on main`}
              className="shrink-0 px-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 shrink-0 px-1"
              title="Copy a sweep brief for this bucket"
              aria-label={`Copy a sweep brief for ${b.key}`}
              onClick={() => onCopy(b.key)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RuleLegend({
  report,
  active,
  onPick,
  onCopy,
}: {
  report: LintDebtReport;
  active: string | null;
  onPick: (rule: string) => void;
  onCopy: (rule: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {report.byRule.map((b) => (
        <div
          key={b.rule}
          className={`flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs ${
            active === b.rule ? "bg-accent" : "bg-card"
          }`}
        >
          <button
            type="button"
            onClick={() => onPick(b.rule)}
            title={`${CLASS_TITLES[b.klass]} — ${CLASS_DOCTRINE[b.klass]}`}
            className="flex items-center gap-1.5"
          >
            <span className={`font-mono ${isReal(b.klass) ? classTone(b.klass) : "text-muted-foreground"}`}>
              {b.rule}
            </span>
            <span className="tabular-nums text-muted-foreground">{b.count}</span>
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="h-4 px-0.5"
            title={`Copy a sweep brief for every ${b.rule} finding`}
            aria-label={`Copy a sweep brief for ${b.rule}`}
            onClick={() => onCopy(b.rule)}
          >
            <Copy className="h-2.5 w-2.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Detail ─────────────────────────────────────────────────────────────────

function FindingDetail({
  finding,
  onCopyFix,
}: {
  finding: LintDebtFinding;
  onCopyFix: () => void;
}) {
  const klass = classOf(finding.rule);
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div>
        <Badge variant={klass === "bug" ? "destructive" : "secondary"} className="text-[10px] uppercase">
          {CLASS_TITLES[klass]}
        </Badge>
        <p className="mt-1.5 text-xs text-muted-foreground">{CLASS_DOCTRINE[klass]}</p>
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-2">
        <p className="text-xs text-foreground">{finding.message}</p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Rule</dt>
        <dd className="font-mono">{finding.rule}</dd>
        <dt className="text-muted-foreground">File</dt>
        <dd className="min-w-0">
          <Link
            href={sourceHref(finding.file, finding.line)}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-mono underline-offset-2 hover:text-primary hover:underline"
          >
            {finding.file}:{finding.line}:{finding.column}
          </Link>
        </dd>
        <dt className="text-muted-foreground">Feature</dt>
        <dd className="font-mono">{finding.feature}</dd>
        {finding.route && (
          <>
            <dt className="text-muted-foreground">Surface</dt>
            <dd>
              {isConcreteRoute(finding.route) ? (
                <Link
                  href={finding.route}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:text-primary hover:underline"
                >
                  {finding.route}
                </Link>
              ) : (
                <span className="text-muted-foreground">{finding.route}</span>
              )}
            </dd>
          </>
        )}
      </dl>

      <Button size="sm" variant="outline" className="w-full" onClick={onCopyFix}>
        <Copy className="mr-1.5 h-3 w-3" />
        Copy repair brief
      </Button>
    </div>
  );
}
