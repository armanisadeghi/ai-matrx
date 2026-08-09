"use client";

// features/admin/applications/config/components/AppConfigClient.tsx
//
// /administration/app-config — remote runtime configuration for shipped
// desktop clients (one public.app_config row per app; anon-readable,
// super-admin-writable via the admin_update_app_config RPC).
// Landing = list of all rows; row click / "New app" opens the editor.
// Cross-repo system-of-record: common-docs/systems/app-config/FEATURE.md

import { useCallback, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { MonitorCog, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { createClient } from "@/utils/supabase/client";
import { AppConfigEditor } from "@/features/admin/applications/config/components/AppConfigEditor";
import { APPLICATIONS_ADMIN_LOCATION } from "@/features/admin/applications/constants";
import { useAdminEmails } from "@/features/admin/shared/useAdminEmails";
import type { AppConfigRow } from "@/features/admin/applications/config/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_APPLICATIONS_SURFACE_NAME,
  createAdminApplicationsScope,
} from "@/features/surfaces/manifests/admin-applications.manifest";

interface AppConfigClientProps {
  initialRows: AppConfigRow[];
  initialApp?: string;
  initialCredentialId?: string;
}

type View = { mode: "list" } | { mode: "edit"; app: string } | { mode: "new" };

export function AppConfigClient({
  initialRows,
  initialApp,
  initialCredentialId,
}: AppConfigClientProps) {
  const { toast } = useToast();
  const adminEmails = useAdminEmails();
  const [rows, setRows] = useState<AppConfigRow[]>(initialRows);
  const [view, setView] = useState<View>(() =>
    initialApp && initialRows.some((row) => row.app === initialApp)
      ? { mode: "edit", app: initialApp }
      : { mode: "list" },
  );

  const refreshRows = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("*")
      .order("app");
    if (error) {
      toast({
        title: "Failed to refresh app configs",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setRows(data ?? []);
  };

  const handleSaved = (saved: AppConfigRow) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.app !== saved.app);
      next.push(saved);
      next.sort((a, b) => a.app.localeCompare(b.app));
      return next;
    });
    setView({ mode: "edit", app: saved.app });
    // Re-select from the table so the list reflects exactly what's live.
    void refreshRows();
  };

  const columns = useMemo((): MatrxColumnDef<AppConfigRow>[] => {
    return [
      {
        id: "app",
        accessorKey: "app",
        header: "Application",
        cell: (row) => <code className="text-sm font-medium">{row.app}</code>,
        width: 180,
      },
      {
        id: "schema_version",
        accessorKey: "schema_version",
        header: "Schema",
        filter: "select",
        cell: (row) => <Badge variant="outline">v{row.schema_version}</Badge>,
        width: 100,
      },
      {
        id: "min_supported_app_version",
        accessorKey: "min_supported_app_version",
        header: "Min app version",
        filter: "select",
        cell: (row) => (
          <code className="font-mono text-xs">
            {row.min_supported_app_version}
          </code>
        ),
        width: 140,
      },
      {
        id: "updated_at",
        accessorKey: "updated_at",
        header: "Updated",
        cell: (row) => (
          <span
            className="whitespace-nowrap text-xs"
            title={format(new Date(row.updated_at), "yyyy-MM-dd HH:mm:ss")}
          >
            {formatDistanceToNow(new Date(row.updated_at), {
              addSuffix: true,
            })}
          </span>
        ),
        width: 150,
      },
      {
        id: "updated_by",
        header: "Updated by",
        accessorFn: (row) =>
          row.updated_by ? (adminEmails[row.updated_by] ?? row.updated_by) : "",
        filter: "select",
        cell: (row) =>
          row.updated_by ? (
            <span
              className="text-xs text-muted-foreground"
              title={row.updated_by}
            >
              {adminEmails[row.updated_by] ?? row.updated_by.slice(0, 8)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
        width: 220,
      },
    ];
  }, [adminEmails]);

  // Nested provider — out-depths the layout's base provider while this tab is
  // mounted, so Run scope carries the tab's live rows and editor state.
  const getSurfaceScope = () =>
    createAdminApplicationsScope({
      active_tab: "configuration",
      config_row_count: rows.length,
      config_rows_summary: rows.map((r) => ({
        app: r.app,
        schema_version: r.schema_version,
        min_supported_app_version: r.min_supported_app_version,
        updated_at: r.updated_at,
        updated_by: r.updated_by,
      })),
      config_editor_view: view.mode,
      config_editor_app: view.mode === "edit" ? view.app : "",
    });

  if (view.mode !== "list") {
    const row =
      view.mode === "edit"
        ? (rows.find((r) => r.app === view.app) ?? null)
        : null;
    return (
      <SurfaceRuntimeProvider
        surfaceName={ADMIN_APPLICATIONS_SURFACE_NAME}
        getScope={getSurfaceScope}
      >
      <div className="h-full overflow-y-auto p-4">
        <AppConfigEditor
          key={view.mode === "edit" ? view.app : "new"}
          row={row}
          onBack={() => setView({ mode: "list" })}
          onSaved={handleSaved}
          focusCredentialId={
            view.mode === "edit" && view.app === initialApp
              ? initialCredentialId
              : undefined
          }
        />
      </div>
      </SurfaceRuntimeProvider>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_APPLICATIONS_SURFACE_NAME}
      getScope={getSurfaceScope}
    >
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonitorCog className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-base font-semibold">Configuration</h1>
          <p className="text-xs text-muted-foreground">
            Remote runtime configuration for shipped clients — one row per
            application, read by every installed copy in the field.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(row) => row.app}
          pageSize={25}
          emptyState={{
            icon: <MonitorCog className="h-5 w-5" />,
            title: "No configuration rows",
            description:
              "Create one with New application — clients fall back to built-in defaults until then.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search application, version…",
            actions: (
              <Button
                type="button"
                size="sm"
                onClick={() => setView({ mode: "new" })}
              >
                <Plus className="mr-1.5 h-4 w-4" /> New application
              </Button>
            ),
          }}
          onRowOpen={(row) => setView({ mode: "edit", app: row.app })}
          detail={{ enabled: false }}
          copy={{
            label: "Application configuration",
            listLabel: "Application configurations (this view)",
            location: `${APPLICATIONS_ADMIN_LOCATION}/configuration`,
            rowKind: "app_config",
            listKind: "app_configs",
            rowDescription:
              "One remote runtime configuration row for a shipped client.",
            listDescription:
              "Filtered/sorted application configuration rows currently visible.",
            humanRow: (row) =>
              [
                `${row.app} (schema v${row.schema_version})`,
                `min_supported_app_version=${row.min_supported_app_version}`,
                `updated=${row.updated_at} by=${row.updated_by ?? "?"}`,
                JSON.stringify(row.config, null, 2),
              ].join("\n"),
            rowAttributes: (row) => ({
              app: row.app,
              schema_version: row.schema_version,
              min_supported_app_version: row.min_supported_app_version,
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
