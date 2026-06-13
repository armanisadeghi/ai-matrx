"use client";

// app/(admin)/administration/data-integrity/page.tsx
//
// Super-admin data-integrity dashboard. Runs the registry of integrity checks
// (lib/integrity) on demand and surfaces findings grouped by severity/category.
// Read-only — checks never mutate data. The /administration layout already
// gates the whole tree to super admins.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type Severity = "error" | "warning" | "info";

interface CheckMeta {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: Severity;
  kind: "sql" | "probe";
  remediation: string | null;
}

interface CheckResult {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: Severity;
  remediation?: string;
  count: number;
  sample: Record<string, unknown>[];
  ok: boolean;
  error?: string;
  skipped?: boolean;
  durationMs: number;
}

interface Report {
  generatedAt: string;
  results: CheckResult[];
  totals: {
    checks: number;
    withFindings: number;
    failed: number;
    skipped: number;
    errorFindings: number;
    warningFindings: number;
    infoFindings: number;
  };
}

const SEVERITY_STYLES: Record<Severity, string> = {
  error: "bg-destructive/10 text-destructive border-destructive/30",
  warning:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
};

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "error")
    return <ShieldAlert className="h-4 w-4 text-destructive" />;
  if (severity === "warning")
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <Info className="h-4 w-4 text-blue-500" />;
}

function FindingsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c} className="text-left px-2 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {columns.map((c) => (
                <td
                  key={c}
                  className="px-2 py-1 font-mono text-[11px] whitespace-nowrap max-w-[28rem] truncate"
                  title={fmt(r[c])}
                >
                  {fmt(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ResultRow({
  result,
  running,
  onRun,
}: {
  result: CheckResult;
  running: boolean;
  onRun: (id: string) => void;
}) {
  const [open, setOpen] = useState(result.count > 0 || !!result.error);

  const statusBadge = result.skipped ? (
    <Badge variant="outline" className="text-muted-foreground">
      Skipped
    </Badge>
  ) : result.error ? (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      Check failed
    </Badge>
  ) : result.count > 0 ? (
    <Badge variant="outline" className={SEVERITY_STYLES[result.severity]}>
      {result.count} {result.count === 1 ? "issue" : "issues"}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    >
      Clean
    </Badge>
  );

  const expandable = result.count > 0 || !!result.error;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => expandable && setOpen((o) => !o)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          disabled={!expandable}
        >
          {expandable ? (
            open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )
          ) : result.count === 0 && !result.skipped ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <SeverityIcon severity={result.severity} />
          )}
          <span className="font-medium text-sm truncate">{result.title}</span>
          <code className="text-[10px] text-muted-foreground/70 truncate hidden sm:inline">
            {result.id}
          </code>
        </button>
        {statusBadge}
        <span className="text-[10px] text-muted-foreground tabular-nums w-12 text-right">
          {result.durationMs}ms
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onRun(result.id)}
          disabled={running}
          title="Re-run this check"
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {open && expandable && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
          <p className="text-xs text-muted-foreground">{result.description}</p>
          {result.error && (
            <Alert variant="destructive" className="py-2">
              <AlertDescription className="text-xs font-mono">
                {result.error}
              </AlertDescription>
            </Alert>
          )}
          {result.remediation && result.count > 0 && (
            <div className="text-xs">
              <span className="font-medium text-foreground">Fix: </span>
              <span className="text-muted-foreground">
                {result.remediation}
              </span>
            </div>
          )}
          {result.sample.length > 0 && (
            <>
              <FindingsTable rows={result.sample} />
              {result.count > result.sample.length && (
                <p className="text-[11px] text-muted-foreground">
                  Showing {result.sample.length} of {result.count} — re-run the
                  CLI (`pnpm check:data-integrity`) for the full set.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function DataIntegrityPage() {
  const [checks, setChecks] = useState<CheckMeta[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const loadChecks = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/integrity");
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      const data = await res.json();
      setChecks(data.checks as CheckMeta[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadChecks();
  }, [loadChecks]);

  const run = useCallback(
    async (body: { checkIds?: string[]; includeProbe?: boolean }) => {
      setError(null);
      try {
        const res = await fetch("/api/admin/integrity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok)
          throw new Error((await res.json()).error ?? res.statusText);
        const data = await res.json();
        return data.report as Report;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        toast.error(msg);
        return null;
      }
    },
    [],
  );

  const runAll = useCallback(
    async (includeProbe: boolean) => {
      setRunningAll(true);
      const r = await run({ includeProbe });
      if (r) {
        setReport(r);
        const issues = r.totals.errorFindings + r.totals.warningFindings;
        if (issues === 0) toast.success("All checks clean");
        else toast.warning(`${issues} integrity issue(s) found`);
      }
      setRunningAll(false);
    },
    [run],
  );

  const runOne = useCallback(
    async (id: string) => {
      setRunningId(id);
      const meta = checks?.find((c) => c.id === id);
      const r = await run({
        checkIds: [id],
        includeProbe: meta?.kind === "probe",
      });
      if (r && r.results[0]) {
        const fresh = r.results[0];
        setReport((prev) => {
          if (!prev) return r;
          const exists = prev.results.some((x) => x.id === id);
          const results = exists
            ? prev.results.map((x) => (x.id === id ? fresh : x))
            : [...prev.results, fresh];
          return { ...prev, results, generatedAt: r.generatedAt };
        });
      }
      setRunningId(null);
    },
    [run, checks],
  );

  const copyReport = useCallback(() => {
    if (!report) return;
    void navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast.success("Report copied as JSON");
  }, [report]);

  const grouped = useMemo(() => {
    if (!report) return null;
    const byCat = new Map<string, CheckResult[]>();
    for (const r of report.results) {
      const arr = byCat.get(r.category) ?? [];
      arr.push(r);
      byCat.set(r.category, arr);
    }
    return Array.from(byCat.entries());
  }, [report]);

  const t = report?.totals;

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Data Integrity
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            On-demand referential + storage integrity audit for the file system
            and PDF document bridge. Read-only — nothing here mutates data.
            Checks live in <code>lib/integrity</code>; the same set runs in CI
            via <code>pnpm check:data-integrity</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <Button variant="outline" size="sm" onClick={copyReport}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy report
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => runAll(true)}
            disabled={runningAll || !checks}
            title="Includes the live S3 byte probe (slower, accessible files only)"
          >
            {runningAll ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            Run all + probe
          </Button>
          <Button
            size="sm"
            onClick={() => runAll(false)}
            disabled={runningAll || !checks}
          >
            {runningAll ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            Run all checks
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {t && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <SummaryChip
            label="Errors"
            value={t.errorFindings}
            tone={t.errorFindings > 0 ? "error" : "ok"}
          />
          <SummaryChip
            label="Warnings"
            value={t.warningFindings}
            tone={t.warningFindings > 0 ? "warning" : "ok"}
          />
          <SummaryChip label="Checks run" value={t.checks} tone="neutral" />
          {t.failed > 0 && (
            <SummaryChip label="Check errors" value={t.failed} tone="error" />
          )}
          {t.skipped > 0 && (
            <SummaryChip label="Skipped" value={t.skipped} tone="neutral" />
          )}
          <span className="text-muted-foreground ml-1">
            {new Date(report!.generatedAt).toLocaleString()}
          </span>
        </div>
      )}

      {!checks ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : !report ? (
        <EmptyState checks={checks} />
      ) : (
        <div className="space-y-5">
          {grouped!.map(([category, results]) => (
            <section key={category} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <div className="space-y-2">
                {results.map((r) => (
                  <ResultRow
                    key={r.id}
                    result={r}
                    running={runningId === r.id || runningAll}
                    onRun={runOne}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "error" | "warning" | "ok" | "neutral";
}) {
  const styles = {
    error: "border-destructive/30 bg-destructive/10 text-destructive",
    warning:
      "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    neutral: "border-border bg-muted text-muted-foreground",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${styles}`}
    >
      <span className="tabular-nums">{value}</span>
      {label}
    </span>
  );
}

function EmptyState({ checks }: { checks: CheckMeta[] }) {
  const byCat = new Map<string, CheckMeta[]>();
  for (const c of checks) {
    const arr = byCat.get(c.category) ?? [];
    arr.push(c);
    byCat.set(c.category, arr);
  }
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center space-y-3">
      <p className="text-sm text-muted-foreground">
        {checks.length} checks registered across {byCat.size} categories. Run
        them to see the current state.
      </p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {Array.from(byCat.entries()).map(([cat, items]) => (
          <Badge key={cat} variant="outline" className="text-muted-foreground">
            {cat} · {items.length}
          </Badge>
        ))}
      </div>
    </div>
  );
}
