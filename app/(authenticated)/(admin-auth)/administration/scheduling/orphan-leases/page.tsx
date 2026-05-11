// app/(authenticated)/(admin-auth)/administration/scheduling/orphan-leases/page.tsx

"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import { StatusPill } from "@/features/scheduling/components/shared/StatusPill";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import {
  fetchOrphanLeases,
  markRunFailedAdmin,
} from "@/lib/services/scheduling-admin-service";
import type { SchRunRow } from "@/features/scheduling/types";

export default function OrphanLeasesPage() {
  const [rows, setRows] = useState<SchRunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const data = await fetchOrphanLeases();
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleKill = async (run: SchRunRow) => {
    const ok = await confirm({
      title: "Mark run as failed",
      description: `Force-fail run ${run.id.slice(0, 8)}… for task ${run.task_id.slice(0, 8)}…? The scanner will re-enqueue on the next tick for recurring triggers.`,
      confirmLabel: "Mark failed",
      variant: "destructive",
    });
    if (!ok) return;
    setBusyId(run.id);
    try {
      await markRunFailedAdmin(run.id, "Marked failed by admin (orphan lease)");
      toast.success("Run marked failed");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Orphan leases
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Runs in <code>claimed</code> or <code>running</code> state whose
            <code> claim_expires_at</code> is in the past. The scanner
            normally re-claims these on the next tick — if a row stays here
            for more than a few minutes, something's wrong upstream.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!rows ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No orphan leases. System is healthy.
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Task</th>
                <th className="text-left px-3 py-2">Surface</th>
                <th className="text-left px-3 py-2">Claimed</th>
                <th className="text-left px-3 py-2">Expired</th>
                <th className="text-right px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {r.task_id.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2 text-xs">{r.surface ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {humanizeRelative(r.claimed_at)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {humanizeRelative(r.claim_expires_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleKill(r)}
                      disabled={busyId === r.id}
                      className="text-destructive"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" /> Mark failed
                    </Button>
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
