"use client";

/**
 * CalibrationView — is "85% confident" right 85% of the time, per agent
 * version per question? Table first; the selected row's reliability curve
 * and bins beneath it. Numbers come from matrx_ai.evaluators.calibration via
 * /decision-review/agents/{id}/calibration; the floor for scoring agreement
 * and the precision target are org knobs (agents.decision_review).
 */

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SegmentedControl } from "@ai-matrx/design-system/controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { METHOD_LABELS, type DecisionMethod } from "@ai-matrx/agents/presentation/decision-answers";
import {
  loadCalibration,
  loadFacets,
  type DecisionCalibrationReport,
  type GroupCalibration,
  type QueueFacets,
} from "../service";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ReliabilityCurve } from "./ReliabilityCurve";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const ALL = "__all__";
type Signal = "probability" | "confidence";

function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
function dec(v: number | null | undefined, digits = 3): string {
  return v == null ? "—" : v.toFixed(digits);
}

const BAND_LABEL: Record<string, string> = {
  production: "Production",
  usable: "Usable",
  not_usable: "Not usable",
  insufficient_data: "Too few labels",
};

function groupKey(g: GroupCalibration): string {
  return `${g.version}:${g.question}`;
}

function AgreementCell({ group, minLabels }: { group: GroupCalibration; minLabels: number }) {
  const a = group.agreement;
  const cases = a.cases ?? 0;
  if (cases < minLabels) {
    return (
      <span className="text-muted-foreground" title={a.note}>
        {cases} of {minLabels} labels
      </span>
    );
  }
  return (
    <span title={a.note}>
      {dec(a.cohens_kappa, 2)}{" "}
      <span
        className={cn(
          "ml-1 rounded px-1 py-0.5 type-meta",
          a.band === "production" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
          a.band === "usable" && "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
          a.band === "not_usable" && "bg-destructive/10 text-destructive-ink",
        )}
      >
        {(a.band && BAND_LABEL[a.band]) ?? a.band}
      </span>
    </span>
  );
}

function calibrationColumns(
  signal: Signal,
  minLabels: number,
  targetPrecision: number,
): MatrxColumnDef<GroupCalibration>[] {
  const mono = "font-mono";
  return [
    { id: "version", header: "Version", accessorFn: (g) => g.version, filter: "number", width: 90, cell: (g) => <span className={mono}>v{g.version}</span> },
    { id: "question", header: "Question", accessorFn: (g) => g.question, filter: "text", width: 160, cell: (g) => <span className={mono}>{g.question}</span> },
    { id: "labeled", header: "Labeled", accessorFn: (g) => g.labeled ?? 0, filter: "number", width: 100, align: "right", cell: (g) => <span className={mono}>{g.labeled} / {g.items}</span> },
    { id: "right", header: "Right", accessorFn: (g) => g[signal].accuracy ?? null, filter: "number", width: 90, align: "right", cell: (g) => <span className={mono}>{pct(g[signal].accuracy)}</span> },
    { id: "stated", header: "Stated", accessorFn: (g) => g[signal].mean_predicted ?? null, filter: "number", width: 90, align: "right", cell: (g) => <span className={mono}>{pct(g[signal].mean_predicted)}</span> },
    { id: "brier", header: "Brier", accessorFn: (g) => g[signal].brier_score ?? null, filter: "number", width: 90, align: "right", cell: (g) => <span className={mono}>{dec(g[signal].brier_score)}</span> },
    { id: "calibration-error", header: "Calib. error", accessorFn: (g) => g[signal].expected_calibration_error ?? null, filter: "number", width: 110, align: "right", cell: (g) => <span className={mono}>{pct(g[signal].expected_calibration_error)}</span> },
    {
      id: "agreement",
      header: "Agreement (kappa)",
      accessorFn: (g) => ((g.agreement.cases ?? 0) < minLabels ? null : (g.agreement.cohens_kappa ?? null)),
      filter: "number",
      width: 220,
      cell: (g) => <span className={mono}><AgreementCell group={g} minLabels={minLabels} /></span>,
    },
    {
      id: "threshold",
      header: `Threshold for ${pct(targetPrecision)}`,
      accessorFn: (g) => g[signal].recommended_threshold?.threshold ?? null,
      filter: "number",
      width: 300,
      cell: (g) => {
        const rec = g[signal].recommended_threshold;
        return (
          <span className={mono}>
            {rec?.threshold != null ? (
              <span>
                ≥ {pct(rec.threshold)}{" "}
                <span className="text-muted-foreground">
                  ({pct(rec.precision)} right, {pct(rec.coverage)} pass)
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground" title={rec?.note ?? undefined}>
                {(g.labeled ?? 0) === 0 ? "—" : "none reaches it"}
              </span>
            )}
          </span>
        );
      },
    },
  ];
}

export function CalibrationView({ agentId }: { agentId: string }) {
  const dispatch = useAppDispatch();
  const [signal, setSignal] = useState<Signal>("probability");
  const [model, setModel] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [report, setReport] = useState<DecisionCalibrationReport | null>(null);
  const [facets, setFacets] = useState<QueueFacets | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The agent's own organization scopes its calibration (the page used to die
  // on "Choose the organization you're working in" with no way to choose).
  const agentOrganizationId = useAppSelector(
    (state) => selectAgentById(state, agentId)?.organizationId ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError(null);
    Promise.all([loadCalibration(dispatch, agentId, { model, method }, agentOrganizationId), loadFacets({ agentId })])
      .then(([r, f]) => {
        if (cancelled) return;
        setReport(r);
        setFacets(f);
        const groups = r.groups ?? [];
        const first = groups.find((g) => (g.labeled ?? 0) > 0) ?? groups[0];
        setSelectedKey((k) =>
          k && groups.some((g) => groupKey(g) === k) ? k : first ? groupKey(first) : null,
        );
      })
      .catch((err: unknown) => {
        console.error("[decision-review] calibration load failed", err);
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Calibration could not be computed.");
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, agentId, model, method, agentOrganizationId]);

  const selected = report?.groups?.find((g) => groupKey(g) === selectedKey) ?? null;
  const measure = selected ? selected[signal] : null;
  const threshold = measure?.recommended_threshold ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col pt-[var(--shell-header-h)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <SegmentedControl aria-label="Signal"
          value={signal}
          onValueChange={(v) => setSignal(v as Signal)}
          data={[
            { value: "probability", label: "Answer probability" },
            { value: "confidence", label: "Model confidence" },
          ]}
        />
        <Select value={model ?? ALL} onValueChange={(v) => setModel(v === ALL ? null : v)}>
          <SelectTrigger className="h-7 w-auto min-w-[7rem] text-xs" aria-label="Model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All models</SelectItem>
            {(facets?.models ?? []).map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={method ?? ALL} onValueChange={(v) => setMethod(v === ALL ? null : v)}>
          <SelectTrigger className="h-7 w-auto min-w-[7rem] text-xs" aria-label="Method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All methods</SelectItem>
            {(facets?.methods ?? []).map((m) => (
              <SelectItem key={m} value={m}>
                {METHOD_LABELS[m as DecisionMethod] ?? m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {report && (
          <span className="ml-auto font-mono type-meta text-muted-foreground">
            target precision {pct(report.target_precision)} · agreement scored from {report.min_labels} labels
          </span>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 type-secondary text-destructive-ink">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
          <ErrorAlchemyMenu className="ml-auto" error={error} />
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {report == null && !error ? (
          <Skeleton className="h-40 w-full" />
        ) : report && (report.groups ?? []).length === 0 ? (
          <p className="type-secondary text-muted-foreground">This agent has no recorded decision answers yet.</p>
        ) : report ? (
          <>
            <MatrxDataTable<GroupCalibration>
              tableId="agents/decision-review/calibration"
              data={report.groups ?? []}
              columns={calibrationColumns(signal, report.min_labels, report.target_precision)}
              getRowId={groupKey}
              selectedId={selectedKey}
              onSelectedIdChange={setSelectedKey}
              onRowOpen={(g) => setSelectedKey(groupKey(g))}
              detail={{ enabled: false }}
              pageSize={0}
              toolbar={{ title: "Calibration by version and question" }}
              emptyState={{ title: "No calibration groups" }}
            />

            {selected && measure && (
              <div className="mt-4 flex flex-wrap items-start gap-6 border-t border-border pt-4">
                <div>
                  <div className="mb-1 type-secondary font-medium">
                    v{selected.version} · {selected.question}
                  </div>
                  {(measure.bins ?? []).length === 0 ? (
                    <p className="type-secondary text-muted-foreground">No labeled answers yet.</p>
                  ) : (
                    <ReliabilityCurve bins={measure.bins ?? []} threshold={threshold?.threshold ?? null} />
                  )}
                </div>
                <table className="border-collapse self-start type-secondary">
                  <thead>
                    <tr className="text-left type-meta uppercase tracking-wide text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">Stated</th>
                      <th className="py-1 pr-3 text-right font-medium">Labels</th>
                      <th className="py-1 pr-3 text-right font-medium">Mean stated</th>
                      <th className="py-1 pr-3 text-right font-medium">Right</th>
                      <th className="py-1 text-right font-medium">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(measure.bins ?? []).map((b) => (
                      <tr key={b.lower} className="border-t border-border/60 font-mono">
                        <td className="py-1 pr-3">
                          {pct(b.lower)}–{pct(b.upper)}
                        </td>
                        <td className="py-1 pr-3 text-right">{b.count}</td>
                        <td className="py-1 pr-3 text-right">{pct(b.mean_predicted)}</td>
                        <td className="py-1 pr-3 text-right">{pct(b.observed_accuracy)}</td>
                        <td
                          className={cn(
                            "py-1 text-right",
                            b.gap < -0.1 && "text-destructive",
                          )}
                        >
                          {b.gap > 0 ? "+" : ""}
                          {Math.round(b.gap * 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
