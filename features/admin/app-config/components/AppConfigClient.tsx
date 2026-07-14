"use client";

// features/admin/app-config/components/AppConfigClient.tsx
//
// /administration/app-config — remote runtime configuration for shipped
// desktop clients (one public.app_config row per app; anon-readable,
// super-admin-writable via the admin_update_app_config RPC).
// Landing = list of all rows; row click / "New app" opens the editor.
// Cross-repo system-of-record: common-docs/app-config/FEATURE.md

import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { MonitorCog, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";
import { AppConfigEditor } from "@/features/admin/app-config/components/AppConfigEditor";
import type { AppConfigRow } from "@/features/admin/app-config/types";

interface AppConfigClientProps {
  initialRows: AppConfigRow[];
}

type View = { mode: "list" } | { mode: "edit"; app: string } | { mode: "new" };

export function AppConfigClient({ initialRows }: AppConfigClientProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AppConfigRow[]>(initialRows);
  const [view, setView] = useState<View>({ mode: "list" });

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

  if (view.mode !== "list") {
    const row =
      view.mode === "edit"
        ? (rows.find((r) => r.app === view.app) ?? null)
        : null;
    return (
      <div className="mx-auto w-full max-w-5xl p-4">
        <AppConfigEditor
          key={view.mode === "edit" ? view.app : "new"}
          row={row}
          onBack={() => setView({ mode: "list" })}
          onSaved={handleSaved}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MonitorCog className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-base font-semibold">App Config</h1>
            <p className="text-xs text-muted-foreground">
              Remote runtime configuration for shipped clients — one row per
              app, read by every installed copy in the field.
            </p>
          </div>
        </div>
        <Button type="button" size="sm" onClick={() => setView({ mode: "new" })}>
          <Plus className="mr-1.5 h-4 w-4" /> New app
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">App</th>
              <th className="px-3 py-2 font-medium">Schema</th>
              <th className="px-3 py-2 font-medium">Min app version</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2 font-medium">Updated by</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No app config rows yet — create one with New app.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.app}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-accent/50"
                  onClick={() => setView({ mode: "edit", app: row.app })}
                >
                  <td className="px-3 py-2">
                    <code className="font-medium">{row.app}</code>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">v{row.schema_version}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.min_supported_app_version}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-foreground">
                      {formatDistanceToNow(new Date(row.updated_at), {
                        addSuffix: true,
                      })}
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(row.updated_at), "yyyy-MM-dd HH:mm")}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.updated_by ? (
                      <code
                        className="text-xs text-muted-foreground"
                        title={row.updated_by}
                      >
                        {row.updated_by.slice(0, 8)}
                      </code>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
