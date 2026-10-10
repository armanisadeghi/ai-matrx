"use client";

// features/marketing/reports/saved/SavedSeoReportsTable.tsx — the saved SEO
// reports list: title, kind, period, template, version, updated, made by.
// Metadata only; the title opens the existing artifact viewer. "Versions"
// expands one job's version history in place, each version opening in the
// same viewer by its canvas item id.

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, History } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import { Badge, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { extractErrorMessage } from "@/utils/errors";
import { useSeoReportVersions } from "./hooks";
import type { SavedSeoReportSummary, SeoReportVersion } from "./types";
import { NO_RAW_ROW_WINDOW } from "@/features/marketing/social/row-open";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export function artifactViewerHref(id: string): string {
  return `/artifacts/${id}`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function templateLabel(row: SavedSeoReportSummary): string {
  if (!row.template?.name) return "—";
  return row.template.version ? `${row.template.name} v${row.template.version}` : row.template.name;
}

function kindLabel(kind: string | null): string {
  return kind ? humanizeIdentifier(kind) || kind : "—";
}

export function SeoReportVersions({ report }: { report: SavedSeoReportSummary }) {
  const versions = useSeoReportVersions(report.source_id);
  if (!report.source_id) return <p className="px-3 py-2 text-xs text-muted-foreground">No version record</p>;
  if (versions.isLoading) return <RegionSkeleton shape="rows" count={2} aria-label="Loading versions" />;
  if (versions.error) {
    return <p className="px-3 py-2 text-xs text-destructive">{extractErrorMessage(versions.error)}<ErrorAlchemyMenu /></p>;
  }
  const rows: SeoReportVersion[] = versions.data ?? [];
  return (
    <ol className="divide-y divide-border" aria-label="Versions">
      {rows.map((version) => (
        <li key={version.id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
          <Badge tone={version.id === report.canvas_item_id ? "primary" : "neutral"}>
            v{version.version ?? "?"}
          </Badge>
          <Link
            href={artifactViewerHref(version.id === report.canvas_item_id ? report.id : version.id)}
            className="min-w-0 flex-1 truncate text-foreground hover:underline"
          >
            {version.title || "Untitled"}
          </Link>
          <span className="shrink-0 text-muted-foreground">{formatWhen(version.created_at)}</span>
          <MatrxUuidCell value={version.created_by} token="user" label="Made by" />
        </li>
      ))}
    </ol>
  );
}

export function SavedSeoReportsTable({
  rows,
  isLoading,
  location,
}: {
  rows: SavedSeoReportSummary[];
  isLoading: boolean;
  /** Where the list is shown, for copy payloads. */
  location: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const columns = useMemo<MatrxColumnDef<SavedSeoReportSummary>[]>(
    () => [
      {
        id: "title",
        header: "Title",
        accessorFn: (row) => row.title ?? "",
        cell: (row) => row.title || "Untitled report",
        href: (row) => artifactViewerHref(row.id),
        entityToken: "artifact",
        entityId: (row) => row.id,
        width: 320,
      },
      { id: "kind", header: "Kind", accessorFn: (row) => kindLabel(row.report_kind), width: 140 },
      { id: "period", header: "Period", accessorFn: (row) => row.period ?? "—", width: 180 },
      { id: "template", header: "Template", accessorFn: templateLabel, width: 160 },
      {
        id: "version",
        header: "Version",
        accessorFn: (row) => row.version ?? 1,
        cell: (row) => `v${row.version ?? 1}`,
        width: 90,
        align: "right",
      },
      {
        id: "updated",
        header: "Updated",
        accessorFn: (row) => row.updated_at,
        cell: (row) => formatWhen(row.updated_at),
        width: 180,
      },
      {
        id: "made_by",
        header: "Made by",
        accessorFn: (row) => (row.agent_id ? "agent" : (row.created_by ?? "")),
        cell: (row) => (
          <span className="flex items-center gap-1">
            {row.agent_id ? <Badge tone="info">Agent</Badge> : null}
            <MatrxUuidCell value={row.created_by} token="user" label="Made by" />
          </span>
        ),
        width: 170,
      },
    ],
    [],
  );
  if (isLoading) return <RegionSkeleton shape="rows" count={4} aria-label="Loading saved reports" />;
  return (
    <MatrxDataTable {...NO_RAW_ROW_WINDOW}
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      pageSize={10}
      toolbar={{ searchPlaceholder: "Search saved reports…" }}
      rowActions={(row) => [
        {
          id: "versions",
          icon: History,
          label: expandedId === row.id ? "Hide versions" : "Versions",
          onClick: () => setExpandedId((open) => (open === row.id ? null : row.id)),
        },
      ]}
      expandedDetail={{
        expandedId,
        onExpandedIdChange: setExpandedId,
        render: (row) => <SeoReportVersions report={row} />,
      }}
      copy={{
        label: "Saved SEO report",
        listLabel: "Saved SEO reports",
        location: webLocation(location),
        rowKind: "web-saved-seo-report",
        listKind: "web-saved-seo-reports",
        humanRow: (row) =>
          humanLines([
            ["Title", row.title],
            ["Kind", kindLabel(row.report_kind)],
            ["Period", row.period],
            ["Template", templateLabel(row)],
            ["Version", `v${row.version ?? 1}`],
            ["Updated", formatWhen(row.updated_at)],
          ]),
      }}
      emptyState={{
        icon: <FileText className="h-8 w-8 text-muted-foreground" />,
        title: "No saved reports yet",
        description: "Ask an agent for a report, or generate one here.",
      }}
    />
  );
}
