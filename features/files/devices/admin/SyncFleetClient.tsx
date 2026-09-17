/**
 * features/files/devices/admin/SyncFleetClient.tsx
 *
 * Folder-sync fleet health for admins: who is over quota, whose sync is
 * stopped, and which devices have gone quiet. States and counts only — never a
 * path, because the view that feeds this has none (SPEC-SERVER §6.2 S22).
 *
 * The rows are already gated at the database: the view is
 * `security_invoker = false` and its own WHERE clause requires
 * `is_platform_admin()` or admin/owner membership of the row's organization.
 * The route gate is convenience; the view is the authorization.
 */

"use client";

import { AlertTriangle, CircleSlash, HardDrive, Wifi } from "lucide-react";
import { Badge } from "@ai-matrx/design-system";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { cn } from "@/lib/utils";
import { formatFileSize } from "@/features/files/utils/format";

import { describeMappingState, DEVICE_SILENT_AFTER_MS } from "../honest-states";
import { useNow } from "../useNow";
import {
  DEGRADED_STATES,
  OVER_QUOTA_STATES,
  STALLED_STATES,
  type SyncAdminRow,
} from "./types";

function shortId(id: string): string {
  return id.slice(0, 8);
}

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warning" | "danger";
  icon: typeof HardDrive;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-3 py-2",
        tone === "danger"
          ? "border-destructive/40"
          : tone === "warning"
            ? "border-amber-500/40"
            : "border-border",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4",
          tone === "danger"
            ? "text-destructive"
            : tone === "warning"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Table({
  title,
  rows,
  empty,
  now,
}: {
  title: string;
  rows: SyncAdminRow[];
  empty: string;
  now: number;
}) {
  const columns: MatrxColumnDef<SyncAdminRow>[] = [
    {
      id: "account",
      header: "Account",
      accessorFn: (row) => shortId(row.user_id),
      cell: (row) => (
        <span className="font-mono text-[11px]">{shortId(row.user_id)}</span>
      ),
    },
    {
      id: "organization",
      header: "Organization",
      accessorFn: (row) => shortId(row.organization_id),
      cell: (row) => (
        <span className="font-mono text-[11px]">
          {shortId(row.organization_id)}
        </span>
      ),
      mobileHidden: true,
    },
    {
      id: "device",
      header: "Device",
      accessorFn: (row) => shortId(row.device_id),
      cell: (row) => (
        <span className="font-mono text-[11px]">{shortId(row.device_id)}</span>
      ),
      mobileHidden: true,
    },
    {
      id: "state",
      header: "State",
      accessorFn: (row) => describeMappingState(row.state).title,
      cell: (row) => {
        const state = describeMappingState(row.state);
        return (
          <>
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              {state.title}
            </Badge>
            {row.desired_state !== "active" ? (
              <span className="ml-1 text-[11px] text-muted-foreground">
                (user wants: {row.desired_state})
              </span>
            ) : null}
          </>
        );
      },
    },
    {
      id: "since",
      header: "Since",
      accessorFn: (row) => row.state_changed_at ?? "",
      cell: (row) => (
        <span className="text-muted-foreground">
          {ago(row.state_changed_at, now)}
        </span>
      ),
      mobileHidden: true,
    },
    {
      id: "items",
      header: "Items",
      accessorFn: (row) => row.items_total ?? -1,
      cell: (row) => (
        <span className="tabular-nums">
          {row.items_total?.toLocaleString() ?? "—"}
        </span>
      ),
      align: "right",
      mobileHidden: true,
    },
    {
      id: "size",
      header: "Size",
      accessorFn: (row) => row.bytes_total ?? -1,
      cell: (row) => (
        <span className="tabular-nums">
          {row.bytes_total !== null ? formatFileSize(row.bytes_total) : "—"}
        </span>
      ),
      align: "right",
      mobileHidden: true,
    },
    {
      id: "last_synced",
      header: "Last synced",
      accessorFn: (row) => row.last_synced_at ?? "",
      cell: (row) => (
        <span className="text-muted-foreground">
          {ago(row.last_synced_at, now)}
        </span>
      ),
      mobileHidden: true,
    },
  ];
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h2 className="text-xs font-semibold text-foreground">{title}</h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {rows.length}
        </span>
      </header>
      <MatrxDataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        density="condensed"
        pageSize={0}
        hidePagination
        emptyState={{ title: empty }}
        toolbar={{
          search: true,
          searchPlaceholder: "Search this fleet segment…",
        }}
      />
    </section>
  );
}

export function SyncFleetClient({ rows }: { rows: SyncAdminRow[] }) {
  const now = useNow();
  const overQuota = rows.filter((r) =>
    (OVER_QUOTA_STATES as readonly string[]).includes(r.state),
  );
  const stalled = rows.filter((r) =>
    (STALLED_STATES as readonly string[]).includes(r.state),
  );
  const degraded = rows.filter((r) =>
    (DEGRADED_STATES as readonly string[]).includes(r.state),
  );
  const behind = rows.filter((r) => {
    if (r.desired_state !== "active") return false;
    const seen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
    return !seen || now - seen > DEVICE_SILENT_AFTER_MS;
  });

  const accountsOverQuota = new Set(overQuota.map((r) => r.user_id)).size;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="accounts over quota"
          value={accountsOverQuota}
          tone={accountsOverQuota > 0 ? "danger" : "neutral"}
          icon={HardDrive}
        />
        <Stat
          label="mappings stopped"
          value={stalled.length}
          tone={stalled.length > 0 ? "danger" : "neutral"}
          icon={CircleSlash}
        />
        <Stat
          label="mappings degraded"
          value={degraded.length}
          tone={degraded.length > 0 ? "warning" : "neutral"}
          icon={AlertTriangle}
        />
        <Stat
          label="devices behind"
          value={behind.length}
          tone={behind.length > 0 ? "warning" : "neutral"}
          icon={Wifi}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground">
          No sync mapping is registered in any organization you administer yet.
          Rows appear here the moment a device registers one — this page reads
          the path-free admin view, so it will never show anybody&rsquo;s local
          folder.
        </div>
      ) : null}

      <Table
        title="Over quota"
        rows={overQuota}
        empty="No account is over its storage limit."
        now={now}
      />
      <Table
        title="Sync stopped — needs the person at that machine"
        rows={stalled}
        empty="Nothing is stopped."
        now={now}
      />
      <Table
        title="Degraded but moving"
        rows={degraded}
        empty="Nothing is degraded."
        now={now}
      />
      <Table
        title="Devices behind — active mappings whose device stopped checking in"
        rows={behind}
        empty="Every active mapping has a device that checked in recently."
        now={now}
      />

      {/* A gap, named rather than hidden (law 4). */}
      <section className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
        <p className="font-semibold text-amber-700 dark:text-amber-300">
          Per-account storage ledger health is not readable here yet
        </p>
        <p className="mt-1 text-muted-foreground">
          &ldquo;Failed or absent ledger rows&rdquo; cannot be shown from the
          browser: <code>files.user_storage_usage</code> is owner-only (
          <code>personal</code> RLS) and <code>get_usage_status</code> refuses
          any caller but the account itself, so no admin read path exists. The
          over-quota column above is the part that IS visible — it comes from
          the sync engine&rsquo;s own <code>over_quota</code> state. Rebuilding
          and re-graining the ledger to the organization belongs to FS-L6; an
          admin-side ledger view needs a gated RPC from that lane.
        </p>
      </section>
    </div>
  );
}
