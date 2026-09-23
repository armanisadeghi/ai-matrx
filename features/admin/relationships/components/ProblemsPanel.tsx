"use client";

// features/admin/relationships/components/ProblemsPanel.tsx
//
// The single unified drift report — every problem the admin must resolve,
// from admin_relationship_problems(). Rendered on the hub Overview tab.
// Presentational: the parent owns the mutations ("Register as known" runs
// inline; "Register as shareable" / "Open rule" navigate to the Sharing /
// Rules tabs with a consume-once query param).

import { ShieldAlert, ShieldCheck } from "lucide-react";

import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { PROBLEM_TITLES, problemHuman, RELATIONSHIPS_LOCATION } from "../utils";
import type { RelationshipProblem } from "../types";

interface Props {
  problems: RelationshipProblem[];
  errorCount: number;
  warningCount: number;
  busy: boolean;
  onRegister: (source: string, target: string, label: string | null) => void;
  onRegisterShareable: (token: string) => void;
  onEdit: (source: string, target: string, label: string | null) => void;
}

type ProblemTableRow = RelationshipProblem & {
  /**
   * The RPC can report the same natural relationship key more than once when
   * separate diagnostics apply. The original keyed those rows by their source
   * order; retain that identity for the canonical table's row controls.
   */
  tableRowId: string;
};

const problemColumns: MatrxColumnDef<ProblemTableRow>[] = [
  {
    id: "severity",
    accessorKey: "severity",
    header: "Severity",
    filter: "select",
    filterOptions: [
      { value: "error", label: "Error" },
      { value: "warning", label: "Warning" },
    ],
    cell: (row) => (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span
          className={`block h-2 w-2 rounded-full ${row.severity === "error" ? "bg-destructive" : "bg-amber-500"}`}
          aria-hidden="true"
        />
        <span>{row.severity}</span>
      </span>
    ),
    width: 104,
  },
  {
    id: "kind",
    accessorKey: "kind",
    header: "Problem",
    accessorFn: (row) => PROBLEM_TITLES[row.kind] ?? row.kind,
    cell: (row) => (
      <span className="whitespace-nowrap text-xs font-medium">
        {PROBLEM_TITLES[row.kind] ?? row.kind}
      </span>
    ),
    width: 184,
  },
  {
    id: "source_type",
    accessorKey: "source_type",
    header: "Source",
    cell: (row) => <EntityTypeChip token={row.source_type} />,
    width: 160,
  },
  {
    id: "target_type",
    accessorKey: "target_type",
    header: "Target",
    cell: (row) => <EntityTypeChip token={row.target_type} />,
    width: 160,
  },
  {
    id: "label",
    accessorKey: "label",
    header: "Label",
    cell: (row) =>
      row.label ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          {row.label}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    width: 128,
    mobileHidden: true,
  },
  {
    id: "detail",
    accessorKey: "detail",
    header: "Detail",
    cell: (row) => (
      <span className="block max-w-md text-xs text-muted-foreground">
        {row.detail}
      </span>
    ),
    width: 384,
    mobileHidden: true,
  },
  {
    id: "edge_count",
    accessorKey: "edge_count",
    header: "Edges",
    filter: "number",
    cell: (row) => (
      <span className="text-xs tabular-nums text-muted-foreground">
        {row.edge_count > 0 ? `${row.edge_count} edges` : "—"}
      </span>
    ),
    align: "right",
    width: 88,
    mobileHidden: true,
  },
];

export function ProblemsPanel({
  problems,
  errorCount,
  warningCount,
  busy,
  onRegister,
  onRegisterShareable,
  onEdit,
}: Props) {
  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-4 w-4" />
        No drift detected — every association shape is registered, directions
        are clean, and every conveying container is shareable.
      </div>
    );
  }

  const rows: ProblemTableRow[] = problems.map((problem, index) => ({
    ...problem,
    tableRowId: `${problem.kind}:${problem.source_type}:${problem.target_type}:${problem.label ?? ""}:${index}`,
  }));

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <MatrxDataTable
        urlState={{ id: "relationship-problems", selectedRow: false }}
        data={rows}
        columns={problemColumns}
        getRowId={(row) => row.tableRowId}
        density="condensed"
        viewTabs={false}
        pageSize={0}
        zebra
        detail={{ enabled: false }}
        emptyState={{
          title: "No drift detected",
          description:
            "Every association shape is registered, directions are clean, and every conveying container is shareable.",
        }}
        toolbar={{
          title: "Drift & problems",
          titleCount: { value: problems.length, label: "problems" },
          search: true,
          searchPlaceholder: "Search relationship problems…",
          actions: (
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
              {errorCount > 0 ? (
                <Badge variant="destructive">
                  {errorCount} error{errorCount === 1 ? "" : "s"}
                </Badge>
              ) : null}
              {warningCount > 0 ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 text-amber-600 dark:text-amber-500"
                >
                  {warningCount} warning{warningCount === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>
          ),
        }}
        copy={{
          label: "Relationship problem",
          listLabel: "Drift & problems",
          location: RELATIONSHIPS_LOCATION,
          rowKind: "relationship-problem",
          listKind: "relationship-problems",
          rowDescription:
            "One drift/problem row from the Relationship Manager.",
          listDescription:
            "Unified drift report from admin_relationship_problems().",
          humanRow: problemHuman,
          agentRow: ({ tableRowId: _tableRowId, ...problem }) => problem,
          rowAttributes: (row) => ({
            kind: row.kind,
            severity: row.severity,
            source: row.source_type,
            target: row.target_type,
            label: row.label,
          }),
          listAttributes: (visible) => ({
            count: visible.length,
            errors: visible.filter((row) => row.severity === "error").length,
            warnings: visible.filter((row) => row.severity === "warning").length,
          }),
        }}
        rowActions={(row) =>
          row.kind === "unregistered_pair" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                onRegister(row.source_type, row.target_type, row.label)
              }
            >
              Register as known
            </Button>
          ) : row.kind === "conveying_container_not_shareable" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onRegisterShareable(
                  row.container_side === "target"
                    ? row.target_type
                    : row.source_type,
                )
              }
            >
              Register as shareable
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onEdit(row.source_type, row.target_type, row.label)
              }
            >
              Open rule
            </Button>
          )
        }
      />
    </section>
  );
}
