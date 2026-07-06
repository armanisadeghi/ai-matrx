"use client";

import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatRefreshTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleString();
}

/**
 * Slim action bar for a canonicalization page.
 *
 * **Re-fetch** — re-reads the current audit.* snapshot (fast; no DB rebuild).
 * **Refresh audit store** — runs `audit.refresh()` then you should re-fetch;
 *   required after dropping functions / schema changes or rows look stale.
 */
export function CanonicalizationToolbar({
  onReload,
  reloading,
  onRefreshAudit,
  refreshingAudit,
  lastRefreshedAt,
  actions,
}: {
  onReload?: () => void;
  reloading?: boolean;
  onRefreshAudit?: () => void;
  refreshingAudit?: boolean;
  lastRefreshedAt?: string | null;
  actions?: ReactNode;
}) {
  if (!onReload && !onRefreshAudit && !actions) return null;
  const busy = reloading || refreshingAudit;

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
      <p className="text-[10px] text-muted-foreground">
        Snapshot as of{" "}
        <span className="font-medium text-foreground">
          {formatRefreshTime(lastRefreshedAt)}
        </span>
        . Tables read <code className="text-[10px]">audit.*</code> — run{" "}
        <span className="font-medium">Refresh audit store</span> after DB
        changes, then Re-fetch.
      </p>
      <div className="flex items-center gap-2">
        {actions}
        {onRefreshAudit ? (
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs"
            onClick={onRefreshAudit}
            disabled={busy}
            title="Runs audit.refresh() — rebuilds broken_functions, deps, findings, …"
          >
            {refreshingAudit ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3 w-3" />
            )}
            Refresh audit store
          </Button>
        ) : null}
        {onReload ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onReload}
            disabled={busy}
            title="Re-read the current audit snapshot (does not rebuild it)"
          >
            {reloading ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3 w-3" />
            )}
            Re-fetch
          </Button>
        ) : null}
      </div>
    </div>
  );
}
