"use client";

/**
 * KindCatalogTable — the "Catalog" tab of /administration/kind-registry.
 *
 * ONE canonical MatrxDataTable over the live shape-doctor rows (the same
 * doctor run that feeds the Board tab): per-column sort/filter, sticky
 * header, toolbar facets (active / issues), Copy-for-AI, and row click →
 * the per-kind detail page (/administration/kind-registry/<kind>).
 * No side panel, no second viewer — the detail page is the single detail
 * surface.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import type { AssetColumn } from "@/features/content-ir/registry/shape-doctor";
import type { KindBoardRow } from "@/features/content-ir/admin/kind-detail-types";
import {
  COLUMN_HEADING,
  StatusIcon,
} from "@/features/content-ir/admin/KindStatusBoard";

const STATUS_FILTER_OPTIONS = [
  { value: "ok", label: "ok" },
  { value: "warn", label: "warn" },
  { value: "missing", label: "missing" },
  { value: "n/a", label: "n/a" },
];

function statusColumn(
  col: AssetColumn,
  extra?: (row: KindBoardRow) => string | null,
): MatrxColumnDef<KindBoardRow> {
  return {
    id: col,
    header: COLUMN_HEADING[col],
    accessorFn: (row) => row.cells[col].status,
    filter: "select",
    filterOptions: STATUS_FILTER_OPTIONS,
    align: "center",
    width: 84,
    cell: (row) => {
      const cell = row.cells[col];
      const detail = extra?.(row);
      return (
        <span
          className="inline-flex items-center justify-center gap-1"
          title={[`${COLUMN_HEADING[col]}: ${cell.status}`, cell.detail]
            .filter(Boolean)
            .join(" — ")}
        >
          <StatusIcon status={cell.status} />
          {detail ? (
            <span className="text-[10px] text-muted-foreground">{detail}</span>
          ) : null}
        </span>
      );
    },
  };
}

export default function KindCatalogTable({ rows }: { rows: KindBoardRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigatingKind, setNavigatingKind] = useState<string | null>(null);
  const [activeFacet, setActiveFacet] = useState("all");
  const [issueFacet, setIssueFacet] = useState("all");

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (activeFacet === "on" && !row.isActive) return false;
      if (activeFacet === "off" && row.isActive) return false;
      if (issueFacet === "red" && row.redCodes.length === 0) return false;
      if (
        issueFacet === "drift" &&
        row.presence === "both" &&
        row.driftedCells.length === 0 &&
        !row.activeDrift
      ) {
        return false;
      }
      return true;
    });
  }, [rows, activeFacet, issueFacet]);

  const familyOptions = useMemo(() => {
    const families = [...new Set(rows.map((r) => r.family).filter(Boolean))] as string[];
    families.sort();
    return families.map((f) => ({ value: f, label: f }));
  }, [rows]);

  const openKind = (row: KindBoardRow) => {
    setNavigatingKind(row.kind);
    startTransition(() => {
      router.push(`/administration/kind-registry/${row.kind}`);
    });
  };

  const columns = useMemo((): MatrxColumnDef<KindBoardRow>[] => {
    return [
      {
        accessorKey: "kind",
        header: "Kind",
        filter: "text",
        cellKind: "text",
        width: 320,
        cell: (row) => (
          <span className="inline-flex max-w-full items-center gap-1.5">
            <span
              className="truncate font-mono text-xs text-foreground"
              title={row.kind}
            >
              {row.kind}
            </span>
            {navigatingKind === row.kind && isPending ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "label",
        header: "Label",
        filter: "text",
        cell: (row) => (
          <span className="text-xs text-foreground">{row.label}</span>
        ),
      },
      {
        accessorKey: "family",
        header: "Family",
        filter: "select",
        filterOptions: familyOptions,
        width: 110,
        cell: (row) =>
          row.family ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {row.family}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "isActive",
        header: "Active",
        filter: "boolean",
        align: "center",
        width: 70,
        cell: (row) => (
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
        ),
      },
      {
        accessorKey: "version",
        header: "Ver",
        filter: false,
        align: "center",
        width: 52,
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {row.version ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "visibility",
        header: "Visibility",
        filter: "select",
        width: 90,
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {row.visibility ?? "—"}
          </span>
        ),
      },
      statusColumn("definition"),
      statusColumn("example", (row) =>
        row.exampleCount > 0
          ? `${row.exampleCount}${row.hasCanonicalExample ? "" : "!"}`
          : null,
      ),
      statusColumn("gate_structural"),
      statusColumn("component", (row) =>
        row.componentCount > 0 ? String(row.componentCount) : null,
      ),
      statusColumn("skill"),
      statusColumn("content_block"),
      statusColumn("surface", (row) =>
        row.surfaceCount > 0 ? String(row.surfaceCount) : null,
      ),
      {
        id: "flags",
        header: "Flags",
        accessorFn: (row) =>
          [
            ...row.redCodes,
            row.presence !== "both" ? row.presence : null,
            row.driftedCells.length > 0 || row.activeDrift ? "drift" : null,
          ]
            .filter(Boolean)
            .join(" "),
        filter: "text",
        sortable: false,
        cell: (row) => (
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
                drift
              </span>
            )}
          </div>
        ),
      },
    ];
  }, [familyOptions, navigatingKind, isPending]);

  return (
    <MatrxDataTable<KindBoardRow>
      data={filteredRows}
      columns={columns}
      getRowId={(row) => row.kind}
      detail={{ enabled: false }}
      onRowOpen={openKind}
      rowActions={(row) => (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={`Open ${row.kind} in a new tab`}
          onClick={(e) => {
            e.stopPropagation();
            window.open(
              `/administration/kind-registry/${row.kind}`,
              "_blank",
              "noopener",
            );
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      )}
      toolbar={{
        searchPlaceholder: "Search kinds…",
        facets: [
          {
            type: "button-group",
            id: "active",
            label: "Active",
            value: activeFacet,
            options: [
              { value: "all", label: "All" },
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ],
            onChange: setActiveFacet,
          },
          {
            type: "button-group",
            id: "issues",
            label: "Issues",
            value: issueFacet,
            options: [
              { value: "all", label: "All" },
              { value: "red", label: "Red" },
              { value: "drift", label: "Drifted" },
            ],
            onChange: setIssueFacet,
          },
        ],
      }}
      copy={{
        label: "Kind",
        listLabel: "Kind catalog view",
        location: "/administration/kind-registry",
        rowKind: "content-ir-kind",
        listKind: "content-ir-kind-catalog",
        humanRow: (row) =>
          `${row.kind} (${row.label}) — active: ${row.isActive ? "yes" : "no"}, family: ${row.family ?? "none"}, components: ${row.componentCount}, surfaces: ${row.surfaceCount}, examples: ${row.exampleCount}`,
      }}
      pageSize={100}
      pageSizeOptions={[50, 100, 250, 500]}
      zebra
      emptyState={{
        title: "No kinds match",
        description: "Clear filters or facets to see the full registry.",
      }}
    />
  );
}
