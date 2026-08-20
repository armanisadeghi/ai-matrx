"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Cpu, ExternalLink, Route, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { AdminUserRef } from "./AdminUserRef";
import { USERS_ADMIN_LOCATION } from "../constants";
import type {
  AdminUserAcquisitionRow,
  AcquisitionJourney,
  AcquisitionIdentityState,
} from "../types";
import {
  AcquisitionJourneySchema,
  AdminUserAcquisitionRowSchema,
} from "../types";

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

const VERDICT = {
  no_activity: ["No activity after arrival", "text-slate-700 bg-slate-500/10"],
  blocked: ["Likely blocked by a problem", "text-rose-700 bg-rose-500/10"],
  exploring: ["Exploring the product", "text-amber-700 bg-amber-500/10"],
  engaged: ["Reached runtime-powered work", "text-emerald-700 bg-emerald-500/10"],
  converted: ["Converted", "text-emerald-700 bg-emerald-500/10"],
} as const;

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
  const [selected, setSelected] = useState<AdminUserAcquisitionRow | null>(null);
  const [journey, setJourney] = useState<AcquisitionJourney | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyError, setJourneyError] = useState<string | null>(null);

  const openJourney = useCallback(async (row: AdminUserAcquisitionRow) => {
    setSelected(row);
    setJourney(null);
    setJourneyError(null);
    setJourneyLoading(true);
    try {
      const response = await fetch(
        `/api/admin/users/acquisition/${encodeURIComponent(row.row_id)}`,
        { cache: "no-store" },
      );
      const body: unknown = await response.json();
      if (!response.ok) throw new Error("Failed to load this user journey");
      if (typeof body !== "object" || body === null || !("journey" in body)) {
        throw new Error("Journey response was incomplete");
      }
      const parsed = AcquisitionJourneySchema.safeParse(body.journey);
      if (!parsed.success) throw new Error("Journey response was invalid");
      setJourney(parsed.data);
    } catch (caught) {
      setJourneyError(caught instanceof Error ? caught.message : "Failed to load journey");
    } finally {
      setJourneyLoading(false);
    }
  }, []);

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
        id: "journey",
        header: "Journey",
        sortable: false,
        filter: false,
        width: 110,
        cell: (row) => (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => void openJourney(row)}
          >
            <Route className="h-3.5 w-3.5" /> View
          </Button>
        ),
      },
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
    [openJourney],
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
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b p-5 text-left">
            <SheetTitle>{selected?.display_name ?? "User journey"}</SheetTitle>
            <SheetDescription>
              HTTP activity, runtime work, cost, and captured problems in one chronology.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {journeyLoading ? <p className="text-sm text-muted-foreground">Loading the journey…</p> : null}
            {journeyError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {journeyError}
              </div>
            ) : null}
            {journey ? (
              <div className="space-y-5">
                <div className={`rounded-lg p-4 ${VERDICT[journey.verdict][1]}`}>
                  <div className="text-sm font-semibold">{VERDICT[journey.verdict][0]}</div>
                  <div className="mt-1 text-xs opacity-80">
                    Last observed {fmtDate(journey.last_activity)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["API requests", journey.api_requests],
                    ["Failed", journey.failed_requests],
                    ["Runtime work", journey.runtime_executions],
                    ["Runtime cost", fmtCost(journey.runtime_cost)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border p-3">
                      <div className="text-[11px] text-muted-foreground">{label}</div>
                      <div className="font-semibold tabular-nums">{value}</div>
                    </div>
                  ))}
                </div>
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Features used</h3>
                  {journey.feature_usage.length ? (
                    <div className="space-y-1.5">
                      {journey.feature_usage.map((item) => (
                        <div key={item.feature} className="flex items-center rounded-md border px-3 py-2 text-sm">
                          <span>{item.feature}</span>
                          <span className="ml-auto tabular-nums text-muted-foreground">{item.requests} requests</span>
                          {item.failures ? (
                            <Badge variant="destructive" className="ml-2">{item.failures} failed</Badge>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">No feature requests were captured.</p>}
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Activity timeline</h3>
                  <div className="space-y-2">
                    {journey.events.map((event) => (
                      <details key={event.id} className={`rounded-md border p-3 ${event.is_problem ? "border-rose-500/30 bg-rose-500/5" : ""}`}>
                        <summary className="cursor-pointer list-none">
                          <div className="flex items-start gap-2">
                            {event.is_problem ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /> : <Route className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{event.title}</div>
                              <div className="text-[11px] text-muted-foreground">{fmtDate(event.occurred_at)} · {event.kind}{event.status ? ` · ${event.status}` : ""}</div>
                            </div>
                            {event.cost ? <span className="text-xs font-medium tabular-nums">{fmtCost(event.cost)}</span> : null}
                          </div>
                        </summary>
                        <div className="mt-3 space-y-1 border-t pt-3 font-mono text-xs text-muted-foreground">
                          {event.request_id ? <div>request {event.request_id}</div> : null}
                          {event.route ? <div>route {event.route}</div> : null}
                          {event.detail ? <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words">{event.detail}</pre> : null}
                        </div>
                      </details>
                    ))}
                    {!journey.events.length ? <p className="text-sm text-muted-foreground">No owned activity records were found.</p> : null}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
