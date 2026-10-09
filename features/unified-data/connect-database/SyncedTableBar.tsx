"use client";

// features/unified-data/connect-database/SyncedTableBar.tsx — LANE VISION-REACH, wave 3.
//
// On the table page's header, for a Table synced from an outside database: the Synced chip and
// Refresh. The table refreshes itself once when it is opened (unless it refreshed in the last
// minute) and again on Refresh. A person who may only view the table is told nothing on the
// automatic refresh — the store refuses it for them, and the chip still says when it last synced;
// pressing Refresh shows the store's own sentence.

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { tableShapeChanged, useTable } from "@ai-matrx/records/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { OUTSIDE_DATABASE_PROVIDER, refreshSyncedTable } from "./service";
import { SyncedBadge } from "./SyncedBadge";
import { formatRelativeTime } from "@ai-matrx/kit/format";

/** A table refreshed this recently is not refreshed again just for being opened. */
const OPEN_REFRESH_AFTER_MS = 60_000;

interface SyncSource {
  provider?: string;
  synced_at?: string | null;
}

function syncSourceOf(table: unknown): SyncSource | null {
  const source = (table as { sync_source?: unknown } | null)?.sync_source;
  return source && typeof source === "object" ? (source as SyncSource) : null;
}

function agoText(iso: string | null | undefined): string {
  if (!iso) return "Never refreshed";
  if (!Number.isFinite(new Date(iso).getTime())) return "Never refreshed";
  return `Refreshed ${formatRelativeTime(iso, { style: "intl" })}`;
}

export function SyncedTableBar({ tableId, organizationId }: { tableId: string; organizationId: string | null }) {
  const table = useTable(tableId);
  const source = syncSourceOf(table.data);
  const orgId = organizationId ?? (table.data as { organization_id?: string } | null)?.organization_id ?? null;
  const [busy, setBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const opened = useRef(false);
  const isOutside = source?.provider === OUTSIDE_DATABASE_PROVIDER;
  const lastSynced = syncedAt ?? source?.synced_at ?? null;

  const refresh = useCallback(
    async (quiet: boolean) => {
      if (!orgId) return;
      setBusy(true);
      try {
        const answer = await refreshSyncedTable(orgId, tableId);
        setSyncedAt(answer.synced_at);
        tableShapeChanged(tableId);
      } catch (err) {
        if (!quiet) toast.error(extractErrorMessage(err));
        else console.warn("[synced table] refresh on open did not run:", extractErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [orgId, tableId],
  );

  useEffect(() => {
    if (!isOutside || opened.current || !orgId) return;
    opened.current = true;
    const last = source?.synced_at ? new Date(source.synced_at).getTime() : 0;
    if (Date.now() - last > OPEN_REFRESH_AFTER_MS) void refresh(true);
  }, [isOutside, orgId, source?.synced_at, refresh]);

  if (!source?.provider) return null;
  return (
    <div className="flex shrink-0 items-center gap-1" data-synced-table-bar={source.provider}>
      <SyncedBadge provider={source.provider} />
      {isOutside ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Refresh"
              disabled={busy}
              onClick={() => void refresh(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
              data-synced-table-refresh=""
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>{busy ? "Refreshing" : agoText(lastSynced)}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
