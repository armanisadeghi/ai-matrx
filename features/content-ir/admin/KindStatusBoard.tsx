/**
 * KindStatusBoard — the LIVE twin of the generated SHAPES_STATUS.md matrix
 * (SHAPE_SYSTEM.md R10), rendered as the "Board" tab of
 * /administration/utilities/kind-registry.
 *
 * Pure presentational component: the page's Server Component runs the shape
 * doctor once (buildKindStatusBoard in shape-doctor-server.ts) and passes the
 * serializable model here, so the Catalog table and this board share ONE
 * doctor run. Red findings render as red rows, snapshot drift amber
 * (FeatureAdminMap visual language). Every kind links to its
 * /administration/utilities/kind-registry/<kind> page.
 */

import Link from "next/link";
import {
  Activity,
  Check,
  CircleAlert,
  Minus,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  ASSET_COLUMNS,
  type AssetColumn,
  type AssetStatus,
} from "@/features/content-ir/registry/shape-doctor";
import type {
  KindBoardRow,
  KindStatusBoardModel,
} from "@/features/content-ir/admin/kind-detail-types";

export const COLUMN_HEADING: Record<AssetColumn, string> = {
  definition: "Definition",
  example: "Example",
  gate_structural: "Gate",
  component: "Component",
  skill: "Skill",
  content_block: "Block",
  surface: "Surface",
};

export function StatusIcon({ status }: { status: AssetStatus }) {
  switch (status) {
    case "ok":
      return <Check className="mx-auto h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
    case "warn":
      return <TriangleAlert className="mx-auto h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
    case "missing":
      return <X className="mx-auto h-3.5 w-3.5 text-red-500/80" />;
    case "n/a":
      // Structurally inapplicable — deliberately the quietest mark on the board.
      return <Minus className="mx-auto h-3.5 w-3.5 text-muted-foreground/40" />;
  }
}

function rowTone(row: KindBoardRow): string {
  if (row.redCodes.length > 0) {
    return "bg-red-500/5 hover:bg-red-500/10";
  }
  if (row.presence !== "both" || row.driftedCells.length > 0 || row.activeDrift) {
    return "bg-amber-500/5 hover:bg-amber-500/10";
  }
  return "hover:bg-accent/30";
}

export default function KindStatusBoard({
  board,
}: {
  board: KindStatusBoardModel;
}) {
  const drifted = board.driftedRowCount > 0;

  return (
    <section className="border-b border-border bg-card">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 pr-14">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4 text-sky-500" />
          Shape System status board
        </h2>
        <span className="text-xs text-muted-foreground">
          {board.totals.kinds} kinds · cells {board.totals.cells.ok} ok /{" "}
          {board.totals.cells.warn} warn / {board.totals.cells.missing} missing
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            board.redFindings.length > 0
              ? "bg-red-500/10 text-red-700 dark:text-red-300"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {board.redFindings.length} red
        </span>
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {board.yellowFindingCount} yellow
        </span>
        {drifted && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            {board.driftedRowCount} row(s) drifted from snapshot
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          snapshot {board.snapshotStamp} · live @{" "}
          {board.generatedAt.slice(11, 19)}Z
        </span>
      </div>

      {/* Degradation warnings (loud, never silent) */}
      {board.warnings.map((warning) => (
        <div
          key={warning}
          className="flex items-center gap-2 border-t border-amber-500/30 bg-amber-500/5 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200"
        >
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {warning}
        </div>
      ))}

      {/* Drift banner */}
      {drifted && (
        <div className="flex items-center gap-2 border-t border-amber-500/30 bg-amber-500/5 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          Live system differs from the committed snapshot
          {board.excludedFromDrift.length > 0 && (
            <span>
              (columns excluded from diff:{" "}
              {board.excludedFromDrift.map((c) => COLUMN_HEADING[c]).join(", ")})
            </span>
          )}
          <span>
            — run <code className="rounded bg-muted px-1 font-mono">pnpm check:shapes:refresh</code>{" "}
            and commit.
          </span>
        </div>
      )}

      {/* Red findings — red rows, never buried */}
      {board.redFindings.length > 0 && (
        <div className="border-t border-red-500/30">
          {board.redFindings.map((f) => (
            <div
              key={`${f.code}-${f.kind ?? ""}-${f.message}`}
              className="flex items-start gap-2 bg-red-500/5 px-4 py-1.5 text-xs text-red-700 dark:text-red-300"
            >
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-mono font-semibold">[{f.code}]</span>{" "}
                {f.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Matrix */}
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-1.5 font-medium">Kind</th>
              <th className="px-2 py-1.5 text-center font-medium">Active</th>
              {ASSET_COLUMNS.map((col) => (
                <th key={col} className="px-2 py-1.5 text-center font-medium">
                  {COLUMN_HEADING[col]}
                </th>
              ))}
              <th className="px-2 py-1.5 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr
                key={row.kind}
                className={`border-b border-border/60 last:border-0 ${rowTone(row)}`}
              >
                <td className="px-4 py-1">
                  <Link
                    href={`/administration/utilities/kind-registry/${row.kind}`}
                    className="font-mono text-xs text-foreground underline-offset-2 hover:text-primary hover:underline"
                    title={row.label}
                  >
                    {row.kind}
                  </Link>
                </td>
                <td className="px-2 py-1 text-center">
                  <span
                    className={`text-[11px] font-medium ${
                      row.isActive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                    title={
                      row.activeDrift
                        ? "is_active flipped vs the committed snapshot"
                        : undefined
                    }
                  >
                    {row.isActive ? "on" : "off"}
                    {row.activeDrift ? " *" : ""}
                  </span>
                </td>
                {ASSET_COLUMNS.map((col) => {
                  const cell = row.cells[col];
                  const cellDrifted = row.driftedCells.includes(col);
                  return (
                    <td
                      key={col}
                      className={`px-2 py-1 text-center ${
                        cellDrifted ? "bg-amber-500/15" : ""
                      }`}
                      title={[
                        `${COLUMN_HEADING[col]}: ${cell.status}`,
                        cell.detail,
                        cellDrifted ? "DRIFTED vs committed snapshot" : undefined,
                      ]
                        .filter(Boolean)
                        .join(" — ")}
                    >
                      <StatusIcon status={cell.status} />
                    </td>
                  );
                })}
                <td className="px-2 py-1">
                  <div className="flex flex-wrap gap-1">
                    {row.redCodes.map((code) => (
                      <span
                        key={code}
                        className="rounded bg-red-500/10 px-1 py-px font-mono text-[10px] text-red-700 dark:text-red-300"
                      >
                        {code}
                      </span>
                    ))}
                    {row.presence === "live-only" && (
                      <span className="rounded bg-amber-500/10 px-1 py-px text-[10px] text-amber-700 dark:text-amber-300">
                        not in snapshot
                      </span>
                    )}
                    {row.presence === "snapshot-only" && (
                      <span className="rounded bg-red-500/10 px-1 py-px text-[10px] text-red-700 dark:text-red-300">
                        gone from live DB
                      </span>
                    )}
                    {row.driftedCells.length > 0 && (
                      <span
                        className="rounded bg-amber-500/10 px-1 py-px text-[10px] text-amber-700 dark:text-amber-300"
                        title={`Drifted cells: ${row.driftedCells
                          .map((c) => COLUMN_HEADING[c])
                          .join(", ")}`}
                      >
                        drift: {row.driftedCells.map((c) => COLUMN_HEADING[c]).join(", ")}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
