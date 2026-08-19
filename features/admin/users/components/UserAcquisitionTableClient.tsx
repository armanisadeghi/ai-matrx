"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Cpu, ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { AdminUserRef } from "./AdminUserRef";
import { USERS_ADMIN_LOCATION } from "../constants";
import type {
  AdminUserAcquisitionRow,
  AcquisitionIdentityState,
} from "../types";
import { AdminUserAcquisitionRowSchema } from "../types";

type Timeframe = "7d" | "30d" | "90d" | "all";

const TIMEFRAME_DAYS: Record<Exclude<Timeframe, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const STATE_LABEL: Record<AcquisitionIdentityState, string> = {
  visitor: "Visitor",
  guest: "Guest",
  account: "Account",
  converted: "Converted",
};

function fmtDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function fmtCost(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function stateBadge(state: AcquisitionIdentityState) {
  const colors: Record<AcquisitionIdentityState, string> = {
    visitor: "border-slate-500/40 bg-slate-500/10 text-slate-600",
    guest: "border-amber-500/40 bg-amber-500/10 text-amber-700",
    account: "border-sky-500/40 bg-sky-500/10 text-sky-700",
    converted: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  };
  return (
    <Badge variant="outline" className={colors[state]}>
      {STATE_LABEL[state]}
    </Badge>
  );
}

function campaign(row: AdminUserAcquisitionRow): string {
  return [row.utm_source, row.utm_medium, row.utm_campaign]
    .filter((value): value is string => Boolean(value))
    .join(" / ");
}

export function UserAcquisitionTableClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusUser = searchParams.get("user");
  const [rows, setRows] = useState<AdminUserAcquisitionRow[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (value: Timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (value !== "all") {
        query.set(
          "from",
          new Date(
            Date.now() - TIMEFRAME_DAYS[value] * 86_400_000,
          ).toISOString(),
        );
      }
      const response = await fetch(`/api/admin/users/acquisition?${query}`, {
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Failed to load acquisition data";
        throw new Error(message);
      }
      if (typeof body !== "object" || body === null || !("rows" in body)) {
        throw new Error("Acquisition response did not contain rows");
      }
      const parsed = AdminUserAcquisitionRowSchema.array().safeParse(body.rows);
      if (!parsed.success) {
        throw new Error("Acquisition response contained an invalid row");
      }
      setRows(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(timeframe), 0);
    return () => window.clearTimeout(timer);
  }, [load, timeframe]);

  const focused = useMemo(
    () => (focusUser ? rows.filter((row) => row.user_id === focusUser) : rows),
    [focusUser, rows],
  );

  const totals = useMemo(
    () =>
      focused.reduce(
        (result, row) => {
          result.cost += row.total_cost;
          result[row.identity_state] += 1;
          if (row.traffic_kind === "bot") result.bots += 1;
          return result;
        },
        { visitor: 0, guest: 0, account: 0, converted: 0, bots: 0, cost: 0 },
      ),
    [focused],
  );

  const columns = useMemo(
    (): MatrxColumnDef<AdminUserAcquisitionRow>[] => [
      {
        id: "display_name",
        accessorKey: "display_name",
        header: "Identity",
        width: 220,
        cell: (row) =>
          row.user_id ? (
            <AdminUserRef
              userId={row.user_id}
              name={row.display_name}
              email={row.email}
            />
          ) : (
            <span className="text-sm font-medium">{row.display_name}</span>
          ),
      },
      {
        id: "identity_state",
        accessorKey: "identity_state",
        header: "State",
        filter: "select",
        width: 105,
        cell: (row) => stateBadge(row.identity_state),
      },
      {
        id: "traffic_kind",
        accessorKey: "traffic_kind",
        header: "Traffic",
        filter: "select",
        width: 95,
        cell: (row) =>
          row.traffic_kind === "bot" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
              <Cpu className="h-3.5 w-3.5" /> Bot
            </span>
          ) : (
            <span className="text-xs capitalize text-muted-foreground">
              {row.traffic_kind}
            </span>
          ),
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Created / first seen",
        width: 175,
        cell: (row) => (
          <span className="text-xs">{fmtDate(row.created_at)}</span>
        ),
      },
      {
        id: "landing_path",
        accessorKey: "landing_path",
        header: "First observed page",
        width: 220,
        cell: (row) =>
          row.landing_path ? (
            <Link
              href={row.landing_path}
              target="_blank"
              className="flex items-center gap-1 truncate text-xs text-primary hover:underline"
              title={`${row.landing_host ?? ""}${row.landing_path}`}
            >
              <span className="truncate">{row.landing_path}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">Not captured</span>
          ),
      },
      {
        id: "referrer",
        accessorKey: "referrer",
        header: "Referrer",
        width: 220,
        cell: (row) =>
          row.referrer ? (
            <a
              href={row.referrer}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-primary hover:underline"
              title={row.referrer}
            >
              {row.referrer}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">
              Direct / unknown
            </span>
          ),
      },
      {
        id: "campaign",
        accessorFn: campaign,
        header: "Campaign",
        width: 180,
        cell: (row) => (
          <span className="text-xs" title={campaign(row)}>
            {campaign(row) || "—"}
          </span>
        ),
      },
      {
        id: "first_ai_activity",
        accessorKey: "first_ai_activity",
        header: "First AI activity",
        width: 165,
        cell: (row) => (
          <span className="text-xs">{fmtDate(row.first_ai_activity)}</span>
        ),
      },
      {
        id: "last_ai_activity",
        accessorKey: "last_ai_activity",
        header: "Last AI activity",
        width: 165,
        cell: (row) => (
          <span className="text-xs">{fmtDate(row.last_ai_activity)}</span>
        ),
      },
      {
        id: "total_requests",
        accessorKey: "total_requests",
        header: "Requests",
        filter: "number",
        align: "right",
        width: 100,
        cell: (row) => (
          <span className="tabular-nums">{row.total_requests}</span>
        ),
      },
      {
        id: "total_cost",
        accessorKey: "total_cost",
        header: "Cost",
        filter: "number",
        align: "right",
        width: 100,
        cell: (row) => (
          <span className="font-medium tabular-nums">
            {fmtCost(row.total_cost)}
          </span>
        ),
      },
      {
        id: "ip_address",
        accessorKey: "ip_address",
        header: "IP address",
        width: 145,
        cell: (row) => (
          <span
            className="font-mono text-xs"
            title={row.ip_address ?? undefined}
          >
            {row.ip_address ?? "—"}
          </span>
        ),
      },
      {
        id: "client_description",
        accessorKey: "client_description",
        header: "Browser / client",
        width: 185,
        cell: (row) => (
          <span
            className="block truncate text-xs"
            title={row.user_agent ?? undefined}
          >
            {row.client_description}
          </span>
        ),
      },
      {
        id: "user_id",
        accessorKey: "user_id",
        header: "User ID",
        cellKind: "uuid",
        sortable: false,
        filter: false,
        width: 105,
      },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Guest status comes from Supabase, not the displayed name. “First
        observed page” begins with this acquisition collector; older identities
        correctly show “Not captured.” Costs are stored all-time LLM costs for
        each identity.
      </div>
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {focusUser ? (
        <div className="flex items-center rounded-md border px-3 py-1.5 text-xs">
          Focused on {focused[0]?.display_name ?? focusUser}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 px-2 text-xs"
            onClick={() => router.push("/administration/users/acquisition")}
          >
            <X className="h-3 w-3" /> Clear
          </Button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          ["Identities", focused.length],
          ["Guests", totals.guest],
          ["Accounts", totals.account],
          ["Converted", totals.converted],
          ["Bots", totals.bots],
          ["Cohort cost", fmtCost(totals.cost)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          urlState={{ id: "user-acquisition" }}
          data={focused}
          columns={columns}
          getRowId={(row) => row.row_id}
          isLoading={loading}
          pageSize={50}
          emptyState={{
            title: "No acquired identities",
            description:
              "No visitors, guests, or accounts were first seen in this timeframe.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search identity, page, referrer, campaign…",
            facets: [
              {
                type: "button-group",
                id: "acquisition-timeframe",
                value: timeframe,
                defaultValue: "30d",
                options: [
                  { value: "7d", label: "7d" },
                  { value: "30d", label: "30d" },
                  { value: "90d", label: "90d" },
                  { value: "all", label: "All" },
                ],
                onChange: (value) => setTimeframe(value as Timeframe),
              },
            ],
          }}
          copy={{
            label: "User acquisition",
            listLabel: "Acquisition identities (this view)",
            location: USERS_ADMIN_LOCATION,
            rowKind: "user-acquisition",
            listKind: "user-acquisition",
            rowDescription:
              "One visitor, guest, account, or converted identity.",
            listDescription:
              "The filtered acquisition cohort currently visible.",
            humanRow: (row) =>
              `${row.display_name}: ${STATE_LABEL[row.identity_state]}, ${row.total_requests} requests, ${fmtCost(row.total_cost)}, first page ${row.landing_path ?? "not captured"}`,
            rowAttributes: (row) => ({
              user_id: row.user_id,
              state: row.identity_state,
              landing_page: row.landing_path,
              referrer: row.referrer,
              cost: row.total_cost,
            }),
            listAttributes: (visible) => ({
              identities: visible.length,
              timeframe,
            }),
          }}
        />
      </div>
    </div>
  );
}
