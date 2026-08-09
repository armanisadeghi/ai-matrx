"use client";

// app/(admin)/administration/database/data-integrity/page.tsx
//
// Super-admin data-integrity dashboard on the canonical MatrxDataTable. Runs
// the registry of integrity checks (lib/integrity) on demand; every registered
// check is a row (category/severity/kind/status all sort + filter), the
// per-row action runs one check, and row click opens the side-panel detail
// with the findings sample. Read-only — checks never mutate data. The
// /administration layout already gates the whole tree to super admins.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Info,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import {
  isUuidValue,
  tokenFromColumnName,
} from "@/components/official/entity-ref/doors";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";

type Severity = "error" | "warning" | "info";

type CheckKind = "sql" | "probe" | "script";

interface CheckMeta {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: Severity;
  kind: CheckKind;
  remediation: string | null;
}

interface CheckResult {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: Severity;
  kind: CheckKind;
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

/** One table row per registered check, with its latest result when run. */
interface IntegrityRow extends CheckMeta {
  result: CheckResult | null;
}

type RowStatus =
  | "not run"
  | "on-demand"
  | "skipped"
  | "check failed"
  | "issues"
  | "clean";

function rowStatus(row: IntegrityRow): RowStatus {
  const r = row.result;
  if (!r) return row.kind === "script" ? "on-demand" : "not run";
  // A skipped script gate is not a problem — it's an on-demand run affordance.
  if (r.skipped && r.kind === "script") return "on-demand";
  if (r.skipped) return "skipped";
  if (r.error) return "check failed";
  if (r.count > 0) return "issues";
  return "clean";
}

const SEVERITY_STYLES: Record<Severity, string> = {
  error: "bg-destructive/10 text-destructive border-destructive/30",
  warning:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
};

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "error")
    return <ShieldAlert className="h-3.5 w-3.5 text-destructive" />;
  if (severity === "warning")
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  return <Info className="h-3.5 w-3.5 text-blue-500" />;
}

function StatusBadge({ row }: { row: IntegrityRow }) {
  const status = rowStatus(row);
  if (status === "on-demand" || status === "skipped" || status === "not run")
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {status === "on-demand" ? "On-demand" : status === "skipped" ? "Skipped" : "Not run"}
      </Badge>
    );
  if (status === "check failed")
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        Check failed
      </Badge>
    );
  if (status === "issues") {
    const count = row.result?.count ?? 0;
    return (
      <Badge variant="outline" className={SEVERITY_STYLES[row.severity]}>
        {count} {count === 1 ? "issue" : "issues"}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    >
      Clean
    </Badge>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * THE DOOR LAW on a generic column dump: a finding that names an offending
 * record must let the admin OPEN it, not just read a truncated uuid.
 *
 * `tokenFromColumnName` is opt-IN elsewhere because an unchecked guess can send
 * the user to a DIFFERENT record. It is opted into here after auditing every
 * `<x>_id` column the registered checks actually select (lib/integrity/checks.ts):
 *   organization_id → iam.organizations   ✓ correct FK, `/organizations/<id>`
 *   source_id · owner_id · user_id · parent_id · parent_folder_id ·
 *   duplicate_of_file_id · canonical_processed_document_id · target_id ·
 *   member_id · account_id                → no registered token, so no door
 * The strict `<token>_id` exact match is what makes that safe.
 *
 * ADDING A CHECK: if its sample selects a `<token>_id` column, confirm the FK
 * really points at that entity AND that the row actually exists — a check that
 * finds DANGLING references must alias the column away from its token, or every
 * finding ships a link to the record it just proved is missing. That is why the
 * phantom-conversation check selects `a.source_id as phantom_conversation_id`
 * and not `as conversation_id`. Every uuid that resolves to no token still gets
 * short-form + copy, never a bare truncated cell.
 */
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
              {columns.map((c) => {
                const value = r[c];
                return (
                  <td
                    key={c}
                    className="px-2 py-1 font-mono text-[11px] whitespace-nowrap max-w-[28rem] truncate"
                    title={isUuidValue(value) ? undefined : fmt(value)}
                  >
                    {isUuidValue(value) ? (
                      <MatrxUuidCell
                        value={value}
                        label={c}
                        token={tokenFromColumnName(c)}
                      />
                    ) : (
                      fmt(value)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CheckDetail({ row }: { row: IntegrityRow }) {
  const r = row.result;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">{row.description}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={SEVERITY_STYLES[row.severity]}>
          {row.severity}
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          {row.category}
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          {row.kind}
        </Badge>
        <StatusBadge row={row} />
        {r && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {r.durationMs}ms
          </span>
        )}
      </div>
      {!r && (
        <p className="text-xs italic text-muted-foreground">
          Not run yet — use the row&apos;s run button or “Run all checks”.
        </p>
      )}
      {r?.error && r.skipped ? (
        <p className="text-xs italic text-muted-foreground">{r.error}</p>
      ) : r?.error ? (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs font-mono">{r.error}</AlertDescription>
        </Alert>
      ) : null}
      {row.remediation && (r?.count ?? 0) > 0 && (
        <div className="text-xs">
          <span className="font-medium text-foreground">Fix: </span>
          <span className="text-muted-foreground">{row.remediation}</span>
        </div>
      )}
      {r && r.sample.length > 0 && (
        <>
          <FindingsTable rows={r.sample} />
          {r.count > r.sample.length && (
            <p className="text-[11px] text-muted-foreground">
              Showing {r.sample.length} of {r.count} — re-run the CLI
              (`pnpm check:data-integrity`) for the full set.
            </p>
          )}
        </>
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
  // Controlled so the Findings count can open its own check's panel.
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const rows = useMemo((): IntegrityRow[] => {
    if (!checks) return [];
    const byId = new Map(report?.results.map((r) => [r.id, r]) ?? []);
    return checks.map((c) => ({ ...c, result: byId.get(c.id) ?? null }));
  }, [checks, report]);

  const columns = useMemo((): MatrxColumnDef<IntegrityRow>[] => {
    return [
      {
        id: "title",
        accessorKey: "title",
        header: "Check",
        cell: (r) => <span className="text-sm font-medium">{r.title}</span>,
      },
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        cellKind: "text",
        width: 180,
        cell: (r) => (
          <code className="text-[11px] text-muted-foreground">{r.id}</code>
        ),
      },
      {
        id: "category",
        accessorKey: "category",
        header: "Category",
        filter: "select",
        width: 140,
      },
      {
        id: "severity",
        accessorKey: "severity",
        header: "Severity",
        filter: "select",
        width: 110,
        cell: (r) => (
          <span className="flex items-center gap-1.5 text-xs">
            <SeverityIcon severity={r.severity} />
            {r.severity}
          </span>
        ),
      },
      {
        id: "kind",
        accessorKey: "kind",
        header: "Kind",
        filter: "select",
        width: 90,
        cell: (r) => <span className="text-xs">{r.kind}</span>,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => rowStatus(r),
        filter: "select",
        width: 130,
        cell: (r) => <StatusBadge row={r} />,
      },
      {
        id: "count",
        header: "Findings",
        accessorFn: (r) => r.result?.count,
        filter: "number",
        width: 90,
        align: "right",
        // A COUNT IS A DOOR: the offending rows exist (the check sampled them),
        // so the number reaches them — it opens this check's panel, where the
        // findings sample is listed with a door on every record it names.
        cell: (r) => {
          const count = r.result?.count;
          if (count === undefined) {
            return <span className="text-xs tabular-nums">—</span>;
          }
          if (count === 0 || (r.result?.sample.length ?? 0) === 0) {
            return <span className="text-xs tabular-nums">{count}</span>;
          }
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(r.id);
              }}
              title={`Show the ${r.result?.sample.length} sampled ${r.title} findings`}
              className="text-xs tabular-nums text-primary underline-offset-2 hover:underline"
            >
              {count}
            </button>
          );
        },
      },
      {
        id: "duration",
        header: "Duration",
        accessorFn: (r) => r.result?.durationMs,
        filter: "number",
        width: 90,
        align: "right",
        cell: (r) => (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {r.result ? `${r.result.durationMs}ms` : "—"}
          </span>
        ),
      },
    ];
  }, []);

  const t = report?.totals;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Data Integrity
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            On-demand integrity audit: referential/storage checks, security
            guards, and the repo&apos;s <code>check:*</code> gates. Read-only —
            nothing here mutates data. Checks live in{" "}
            <code>lib/integrity</code>; the SQL set also runs via{" "}
            <code>pnpm check:data-integrity</code>. Repo gates are strictly
            on-demand — use the per-row run button.
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

      {report && t && (
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
            {new Date(report.generatedAt).toLocaleString()}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          selectedId={selectedId}
          onSelectedIdChange={setSelectedId}
          isLoading={!checks && !error}
          isFetching={runningAll}
          pageSize={50}
          emptyState={{
            title: "No integrity checks registered",
            description: "Checks live in lib/integrity.",
          }}
          toolbar={{ search: true, searchPlaceholder: "Search checks…" }}
          rowActions={(r) => {
            const running = runningId === r.id || runningAll;
            const onDemand = rowStatus(r) === "on-demand";
            return (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void runOne(r.id)}
                disabled={running}
                title={onDemand ? "Run this gate now" : "Re-run this check"}
              >
                {running ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : onDemand ? (
                  <Play className="h-3.5 w-3.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            );
          }}
          copy={{
            label: "Integrity check",
            listLabel: "Integrity checks (this view)",
            location: "/administration/database/data-integrity",
            rowKind: "integrity-check",
            listKind: "integrity-checks",
            humanRow: (r) =>
              [
                `Check: ${r.title} (${r.id})`,
                `Category: ${r.category} · Severity: ${r.severity} · Kind: ${r.kind}`,
                `Status: ${rowStatus(r)}`,
                r.result
                  ? `Findings: ${r.result.count} · Duration: ${r.result.durationMs}ms`
                  : "Findings: not run",
                r.result?.error ? `Error: ${r.result.error}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            rowAttributes: (r) => ({
              id: r.id,
              severity: r.severity,
              status: rowStatus(r),
              count: r.result?.count ?? null,
            }),
            listAttributes: (visible, all) => ({
              visible: visible.length,
              total: all.length,
              generatedAt: report?.generatedAt ?? null,
            }),
          }}
          detail={{
            title: (r) => r.title,
            description: (r) => <code className="text-[11px]">{r.id}</code>,
            render: (r) => <CheckDetail row={r} />,
          }}
        />
      </div>
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
