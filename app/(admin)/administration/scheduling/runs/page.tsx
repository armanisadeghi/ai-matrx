// app/(authenticated)/(admin-auth)/administration/scheduling/runs/page.tsx

"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/features/scheduling/components/shared/StatusPill";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import { fetchAllRunsAdmin } from "@/lib/services/scheduling-admin-service";
import type { RunStatus, SchRunRow, Surface } from "@/features/scheduling/types";
import { SURFACE_VALUES } from "@/features/scheduling/constants/surfaces";

const STATUSES: RunStatus[] = [
  "queued",
  "claimed",
  "running",
  "success",
  "failed",
  "cancelled",
  "skipped",
];

export default function AdminRunsPage() {
  const [rows, setRows] = useState<SchRunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"any" | RunStatus>("any");
  const [surface, setSurface] = useState<"any" | Surface>("any");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllRunsAdmin({
        status: status === "any" ? null : status,
        surface: surface === "any" ? null : surface,
        limit: 200,
      });
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">All runs</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          disabled={loading}
        >
          <RefreshCw
            className={loading ? "h-3.5 w-3.5 mr-1.5 animate-spin" : "h-3.5 w-3.5 mr-1.5"}
          />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as "any" | RunStatus)}
        >
          <SelectTrigger className="w-40 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={surface}
          onValueChange={(v) => setSurface(v as "any" | Surface)}
        >
          <SelectTrigger className="w-44 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any surface</SelectItem>
            {SURFACE_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => load()}>
          Apply
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!rows ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No runs match.
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Task</th>
                <th className="text-left px-3 py-2">Surface</th>
                <th className="text-left px-3 py-2">Started</th>
                <th className="text-left px-3 py-2">Finished</th>
                <th className="text-left px-3 py-2">Summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-accent/20"
                >
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {r.task_id.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2 text-xs">{r.surface ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {humanizeRelative(
                      r.started_at ?? r.claimed_at ?? r.created_at,
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {humanizeRelative(r.finished_at)}
                  </td>
                  <td className="px-3 py-2 text-xs truncate max-w-[20rem]">
                    {r.result_summary ?? r.error_message ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
