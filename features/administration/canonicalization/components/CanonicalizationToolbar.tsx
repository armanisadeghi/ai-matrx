"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A snapshot older than this is shown as stale — the numbers may no longer be true. */
const STALE_SNAPSHOT_MS = 2 * 60 * 60 * 1000;

function formatRefreshTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleString();
}

function snapshotAge(
  iso: string | null | undefined,
  now: number,
): { label: string; stale: boolean } | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const minutes = Math.max(0, Math.round(ms / 60000));
  const label =
    minutes < 60
      ? `${minutes} min old`
      : minutes < 48 * 60
        ? `${Math.round(minutes / 60)} h old`
        : `${Math.round(minutes / 1440)} days old`;
  return { label, stale: ms > STALE_SNAPSHOT_MS };
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
  // Re-evaluated every minute so an open page turns stale without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!onReload && !onRefreshAudit && !actions) return null;
  const busy = reloading || refreshingAudit;
  const age = snapshotAge(lastRefreshedAt, now);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
      <p className="text-[10px] text-muted-foreground">
        Snapshot as of{" "}
        <span className="font-medium text-foreground">
          {formatRefreshTime(lastRefreshedAt)}
        </span>
        {age ? (
          <span
            className={
              age.stale
                ? "ml-1 font-medium text-amber-600 dark:text-amber-400"
                : "ml-1"
            }
          >
            ({age.stale ? `stale — ${age.label}` : age.label})
          </span>
        ) : null}
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
