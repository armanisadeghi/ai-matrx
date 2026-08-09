"use client";

// features/admin/applications/history/components/ApplicationsHistoryClient.tsx
//
// History tab of the Applications hub — ONE audit timeline across remote
// configuration and remote catalogs, newest first. Read-only: restore stays
// on the per-record history panels (Configuration / Catalogs) where the write
// path and its conflict handling live. This surface answers "what changed
// across our shipped applications, and who did it".
//
// Each row's diff compares the snapshot against the PRIOR snapshot of the same
// record, so the diff reads as the change that happened at that moment.
// Source / application / operation are ordinary select column filters —
// MatrxDataTable owns all filtering.

import { useCallback, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { History, LibraryBig, MonitorCog } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useToast } from "@/components/ui/use-toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { createClient } from "@/utils/supabase/client";
import { APPLICATIONS_ADMIN_LOCATION } from "@/features/admin/applications/constants";
import { useAdminEmails } from "@/features/admin/shared/useAdminEmails";
import { buildApplicationsTimeline } from "@/features/admin/applications/history/buildTimeline";
import type { ApplicationsHistoryEntry } from "@/features/admin/applications/history/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_APPLICATIONS_SURFACE_NAME,
  createAdminApplicationsScope,
} from "@/features/surfaces/manifests/admin-applications.manifest";

interface ApplicationsHistoryClientProps {
  initialEntries: ApplicationsHistoryEntry[];
  /** Rows fetched per source — surfaced so the cap is never silently hidden. */
  limit: number;
}

function sourceBadge(source: ApplicationsHistoryEntry["source"]) {
  return source === "configuration" ? (
    <Badge variant="outline" className="gap-1">
      <MonitorCog className="h-3 w-3" /> Configuration
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1">
      <LibraryBig className="h-3 w-3" /> Catalog
    </Badge>
  );
}

export function ApplicationsHistoryClient({
  initialEntries,
  limit,
}: ApplicationsHistoryClientProps) {
  const { toast } = useToast();
  const adminEmails = useAdminEmails();
  const [entries, setEntries] =
    useState<ApplicationsHistoryEntry[]>(initialEntries);
  const [fetchLimit, setFetchLimit] = useState(limit);
  const [loadingMore, setLoadingMore] = useState(false);

  // "Load more" widens the per-source cap and rebuilds the merged timeline —
  // the prior-snapshot pairing must be recomputed over the wider window.
  const loadMore = useCallback(async () => {
    const nextLimit = fetchLimit + limit;
    setLoadingMore(true);
    const supabase = createClient();
    const [configResult, catalogResult] = await Promise.all([
      supabase
        .from("app_config_history")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(nextLimit),
      supabase
        .from("catalog_entries_history")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(nextLimit),
    ]);
    setLoadingMore(false);
    const error = configResult.error ?? catalogResult.error;
    if (error) {
      toast({
        title: "Failed to load more history",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setEntries(
      buildApplicationsTimeline(
        configResult.data ?? [],
        catalogResult.data ?? [],
      ),
    );
    setFetchLimit(nextLimit);
  }, [fetchLimit, limit, toast]);

  const whoLabel = useCallback(
    (changedBy: string | null): string => {
      if (!changedBy) return "—";
      return adminEmails[changedBy] ?? changedBy.slice(0, 8);
    },
    [adminEmails],
  );

  const columns = useMemo((): MatrxColumnDef<ApplicationsHistoryEntry>[] => {
    return [
      {
        id: "source",
        accessorKey: "source",
        header: "Source",
        filter: "select",
        cell: (row) => sourceBadge(row.source),
        width: 150,
      },
      {
        id: "app",
        accessorKey: "app",
        header: "Application",
        filter: "select",
        cell: (row) => <code className="text-xs">{row.app}</code>,
        width: 130,
      },
      {
        id: "target",
        accessorKey: "target",
        header: "Record",
        cell: (row) => (
          <span className="block max-w-80 truncate text-sm" title={row.target}>
            {row.target}
          </span>
        ),
        width: 300,
      },
      {
        id: "op",
        accessorKey: "op",
        header: "Operation",
        filter: "select",
        cell: (row) => (
          <Badge
            variant="outline"
            className={
              row.op === "delete"
                ? "border-destructive/40 text-destructive"
                : "text-muted-foreground"
            }
          >
            {row.op}
          </Badge>
        ),
        width: 110,
      },
      {
        id: "changedBy",
        header: "Changed by",
        accessorFn: (row) => whoLabel(row.changedBy),
        filter: "select",
        cell: (row) => (
          <span
            className="text-xs text-muted-foreground"
            title={row.changedBy ?? undefined}
          >
            {whoLabel(row.changedBy)}
          </span>
        ),
        width: 200,
      },
      {
        id: "changedAt",
        accessorKey: "changedAt",
        header: "When",
        cell: (row) => (
          <span
            className="whitespace-nowrap text-xs"
            title={format(new Date(row.changedAt), "yyyy-MM-dd HH:mm:ss")}
          >
            {formatDistanceToNow(new Date(row.changedAt), { addSuffix: true })}
          </span>
        ),
        width: 150,
      },
    ];
  }, [whoLabel]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_APPLICATIONS_SURFACE_NAME}
      getScope={() =>
        createAdminApplicationsScope({
          active_tab: "history",
          history_entry_count: entries.length,
          history_fetch_limit: fetchLimit,
        })
      }
    >
    <div className="flex h-full flex-col gap-3 p-4">
      <p className="text-xs text-muted-foreground">
        Merged audit timeline over remote configuration and remote catalogs —{" "}
        {entries.length} snapshot{entries.length === 1 ? "" : "s"} (newest{" "}
        {fetchLimit} per source). Open a row to diff it against the previous
        snapshot of the same record. Restore lives on the Configuration and
        Catalogs tabs, beside the write path.
      </p>

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={entries}
          columns={columns}
          getRowId={(row) => row.rowId}
          isFetching={loadingMore}
          pageSize={50}
          emptyState={{
            icon: <History className="h-5 w-5" />,
            title: "No history yet",
            description:
              "Snapshots are written on every configuration and catalog save.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search record, application, who…",
            actions: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                Load more
              </Button>
            ),
          }}
          detail={{
            title: (row) => row.target,
            description: (row) =>
              `${row.source === "configuration" ? "Configuration" : "Catalog"} · ${row.op} · ${format(
                new Date(row.changedAt),
                "yyyy-MM-dd HH:mm:ss",
              )} · ${whoLabel(row.changedBy)}`,
            defaultWidth: 720,
            render: (row) => (
              <div className="p-2">
                <DiffViewer
                  original={row.previousJson}
                  modified={row.snapshotJson}
                  engine="light"
                  language="json"
                  view="inline"
                  originalLabel={
                    row.previousJson ? "Previous snapshot" : "(did not exist)"
                  }
                  modifiedLabel="This snapshot"
                />
              </div>
            ),
          }}
          copy={{
            label: "History entry",
            listLabel: "Applications history (this view)",
            location: `${APPLICATIONS_ADMIN_LOCATION}/history`,
            rowKind: "applications_history_entry",
            listKind: "applications_history",
            rowDescription:
              "One audit snapshot from the merged applications history.",
            listDescription:
              "Filtered/sorted applications audit entries currently visible.",
            humanRow: (row) =>
              [
                `${row.source} · ${row.app} · ${row.target}`,
                `op=${row.op} at=${row.changedAt} by=${whoLabel(row.changedBy)}`,
                row.snapshotJson,
              ].join("\n"),
            rowAttributes: (row) => ({
              source: row.source,
              app: row.app,
              op: row.op,
              changed_at: row.changedAt,
            }),
            listAttributes: (visible, all) => ({
              visible: visible.length,
              total: all.length,
            }),
          }}
        />
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}
