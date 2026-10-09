"use client";

import React, { useMemo } from "react";
import { useExecutions } from "@/features/ai-runs/hooks/useExecutions";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { format } from "date-fns";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef, MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table/types";
import type { ExecutionRecord } from "@/features/ai-runs/types/executionTypes";
import { readOf } from "@ai-matrx/design-system";
import { formatAdminUsd } from "@/components/cost/formatAdminCost";

const PAGE_LOCATION = "AI Matrx Admin — AI Tasks (/administration/ai/ai-tasks)";

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  try {
    return format(new Date(dateString), "MMM dd, yyyy HH:mm");
  } catch {
    return dateString;
  }
}

const executionCopy: MatrxDataTableCopyConfig<ExecutionRecord> = {
  label: "AI run",
  listLabel: "AI runs (loaded view)",
  location: PAGE_LOCATION,
  rowKind: "ai-run",
  listKind: "ai-runs",
  rowDescription: "A single execution record (runtime.global_execution).",
  listDescription: "The most recent window of executions across every account.",
  humanRow: (run) => [
    `ID: ${run.id}`,
    `Type: ${run.type || "—"}`,
    `Source: ${run.link_kind || "—"}`,
    `Status: ${run.status}`,
    `Created: ${formatDate(run.created_at)}`,
    `Ended: ${formatDate(run.ended_at)}`,
  ].join("\n"),
  rowAttributes: (run) => ({ id: run.id, status: run.status }),
};

export default function AiTasksPage() {
  const { executions, isLoading, error, total, refresh } = useExecutions({
    limit: 50,
    order_by: "created_at",
    order_direction: "desc",
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "failed":
        return "destructive";
      case "running":
      case "streaming":
      case "cancelled":
        return "outline";
      default:
        return "secondary";
    }
  };

  const columns = useMemo<MatrxColumnDef<ExecutionRecord>[]>(() => [
    {
      id: "id",
      accessorKey: "id",
      header: "ID",
      filter: false,
      width: 110,
      cell: (run) => <EntityRef token="global_execution" id={run.id} name={run.id} showIcon={false}>{run.id.slice(0, 8)}...</EntityRef>,
    },
    { id: "type", accessorKey: "type", header: "Type", filter: "select", width: 140, cell: (run) => <span className="font-medium">{run.type || "-"}</span> },
    { id: "source", accessorKey: "link_kind", header: "Source", filter: "select", width: 160, mobileHidden: true, cell: (run) => <span className="text-sm text-muted-foreground">{run.link_kind || "-"}</span> },
    { id: "status", accessorKey: "status", header: "Status", filter: "select", width: 130, cell: (run) => <Badge variant={getStatusBadgeVariant(run.status)}>{run.status}</Badge> },
    { id: "cost", accessorKey: "cost", header: "Cost", width: 100, mobileHidden: true, cell: (run) => <span className="tabular-nums">{formatAdminUsd(run.cost)}</span> },
    { id: "created", accessorKey: "created_at", header: "Created at", filter: "date", width: 180, mobileHidden: true, cell: (run) => formatDate(run.created_at) },
    { id: "ended", accessorKey: "ended_at", header: "Ended at", filter: "date", width: 180, mobileHidden: true, cell: (run) => formatDate(run.ended_at) },
  ], []);

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <div className="flex-1 overflow-y-auto pb-safe">
        <div className="p-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error.message || "Failed to load AI runs"}
              </AlertDescription>
            </Alert>
          )}

          <>
              {/* This page intentionally exposes only its first 50-row source window.
                  Keep that behavior rather than adding a loader that the 10-second
                  poll would discard; the table labels this as a loaded local window. */}
              <MatrxDataTable
                data={executions}
                columns={columns}
                getRowId={(run) => run.id}
                isLoading={isLoading && executions.length === 0}
                isFetching={isLoading && executions.length > 0}
                pageSize={0}
                viewTabs={false}
                copy={{ ...executionCopy, listAttributes: (visible) => ({ count: visible.length, total }) }}
                detail={{ enabled: false }}
                window={{ enabled: false }}
                coverage={{ total, cap: 50, answeredBy: "client", noun: "run" }}
                read={readOf({ isLoading, error }, { what: "AI runs", onRetry: () => void refresh() })}
                emptyState={{ title: "No runs found", description: "There are no executions to display." }}
                toolbar={{ title: "AI runs", search: false, refresh: { onRefresh: refresh } }}
              />
          </>
        </div>
      </div>
    </div>
  );
}
