"use client";

/**
 * KindCatalogTable — the "Catalog" tab of /administration/utilities/kind-registry.
 *
 * ONE canonical MatrxDataTable over the live shape-doctor rows (the same
 * doctor run that feeds the Board tab): per-column sort/filter, sticky
 * header, toolbar facets (active / issues), Copy-for-AI, and row click →
 * the per-kind detail page (/administration/utilities/kind-registry/<kind>).
 * No side panel, no second viewer — the detail page is the single detail
 * surface.
 */

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import type { AssetColumn } from "@/features/content-ir/registry/shape-doctor";
import type { KindBoardRow } from "@/features/content-ir/admin/kind-detail-types";
import {
  kindDetailHref,
  kindTabHref,
} from "@/features/content-ir/admin/kind-registry-routes";
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

function CountDoor({
  href,
  children,
  title,
}: {
  href: string | undefined;
  children: string;
  title: string;
}) {
  if (!href) {
    return <span className="text-[10px] text-muted-foreground">{children}</span>;
  }
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      title={title}
      className="text-[10px] text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
    >
      {children}
    </Link>
  );
}

function statusColumn(
  col: AssetColumn,
  extra?: (row: KindBoardRow) => ReactNode,
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
          {detail}
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
    const href = kindDetailHref(row);
    if (!href) return; // gone from the live DB — the detail route 404s.
    setNavigatingKind(row.kind);
    startTransition(() => {
      router.push(href);
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
        // THE DOOR LAW: the kind name is a real `next/link`, so the record is
        // reachable by keyboard, cmd/middle-click and the context menu — not
        // only by a JS row click. `onRowOpen` stays as the mouse convenience.
        href: kindDetailHref,
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
        row.exampleCount > 0 ? (
          <CountDoor
            href={kindTabHref(row, "examples")}
            title={`Open the ${row.exampleCount} example row${row.exampleCount === 1 ? "" : "s"} for ${row.kind}`}
          >
            {`${row.exampleCount}${row.hasCanonicalExample ? "" : "!"}`}
          </CountDoor>
        ) : null,
      ),
      statusColumn("gate_structural"),
      statusColumn("component", (row) =>
        row.componentCount > 0 ? (
          <CountDoor
            href={kindTabHref(row, "assets")}
            title={`Open the ${row.componentCount} kind_component row${row.componentCount === 1 ? "" : "s"} for ${row.kind}`}
          >
            {String(row.componentCount)}
          </CountDoor>
        ) : null,
      ),
      statusColumn("skill"),
      statusColumn("content_block"),
      statusColumn("surface", (row) =>
        row.surfaceCount > 0 ? (
          <CountDoor
            href={kindTabHref(row, "assets")}
            title={`Open the ${row.surfaceCount} kind_surface row${row.surfaceCount === 1 ? "" : "s"} for ${row.kind}`}
          >
            {String(row.surfaceCount)}
          </CountDoor>
        ) : null,
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
      rowActions={(row) => {
        const href = kindDetailHref(row);
        // A row that is gone from the live DB gets no new-tab control: the
        // detail route would 404. The "gone from live DB" flag says why.
        if (!href) return null;
        return (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title={`Open ${row.kind} in a new tab`}
          >
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Open ${row.kind} in a new tab`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        );
      }}
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
        location: "/administration/utilities/kind-registry",
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
