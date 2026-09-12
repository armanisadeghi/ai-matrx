// features/admin/spend/SpendDashboard.tsx
//
// THE PLATFORM SPEND DASHBOARD — /administration/billing/spend
//
// Arman, 2026-09-11: "a dashboard where I can easily and quickly see where
// money is being spent". Everything here answers that in one screen: what today
// cost, what it is on pace to cost, which organization is spending it, which
// person is driving it, which ledger recorded it — and, honestly, which costs
// nothing in this platform records at all.
//
// THE HONESTY RULE that shapes the whole page: the headline is
// `runtime.global_execution` and NOTHING else. Other ledgers are shown beside
// it, each labelled with the role it plays (primary / overlap / additive / gap
// / unmeasured), and a "not measured" cell is never drawn as $0.00.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  DollarSign,
  Package,
  RefreshCw,
  Users,
} from "lucide-react";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { SpendHeadline } from "./SpendHeadline";
import { fetchSpendOverview, viewerTimezone } from "./service";
import { useSpendPopoverKnobs } from "./useSpendPopoverKnobs";
import {
  count,
  staleness,
  timestamp,
  usd,
  usdPrecise,
  zoneLabel,
} from "./format";
import type {
  SpendDayPoint,
  SpendLedger,
  SpendLedgerRole,
  SpendOrgRow,
  SpendOverview,
  SpendUserRow,
} from "./types";

const ROLE_LABEL: Record<SpendLedgerRole, string> = {
  primary: "Headline",
  overlap: "Same money, other lens",
  additive: "Separate spend",
  gap: "Records nothing",
  unmeasured: "Not measured anywhere",
};

const ROLE_CLASS: Record<SpendLedgerRole, string> = {
  primary: "bg-primary/15 text-primary",
  overlap: "bg-muted text-muted-foreground",
  additive: "bg-secondary text-secondary-foreground",
  gap: "bg-destructive/15 text-destructive",
  unmeasured: "bg-destructive/15 text-destructive",
};

function RoleBadge({ role }: { role: SpendLedgerRole }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_CLASS[role]}`}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof DollarSign;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex min-w-0 items-baseline gap-2">
        <Icon className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

/** A 30-day bar strip. Deliberately not a chart library — it is one number a day. */
function DaySparkline({ days }: { days: SpendDayPoint[] }) {
  const peak = days.reduce((max, d) => Math.max(max, d.cost), 0);
  if (peak <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No spend recorded in the last 30 days.
      </p>
    );
  }
  return (
    <div className="flex h-24 items-end gap-[3px] overflow-x-auto rounded-md border border-border bg-card p-2">
      {days.map((d) => (
        <div
          key={d.day}
          className="flex min-w-[10px] flex-1 flex-col justify-end"
          title={`${d.day} — ${usd(d.cost)} over ${count(d.runs)} runs`}
        >
          <div
            className="w-full rounded-sm bg-primary/70"
            style={{ height: `${Math.max(2, (d.cost / peak) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function SpendDashboard() {
  const [timezone] = useState(() => viewerTimezone());
  const [data, setData] = useState<SpendOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const knobsState = useSpendPopoverKnobs();
  const scareThresholdUsd = knobsState.knobs?.scareThresholdUsd ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchSpendOverview(timezone);
      setData(next);
      setRefreshedAt(new Date());
    } catch (cause) {
      setData(null);
      setError(
        cause instanceof Error
          ? cause
          : new Error("The spend read failed for an unknown reason."),
      );
    } finally {
      setLoading(false);
    }
  }, [timezone]);

  useEffect(() => {
    void load();
  }, [load]);

  const ledgerColumns: MatrxColumnDef<SpendLedger>[] = [
    {
      id: "label",
      header: "Cost source",
      accessorFn: (r) => r.label,
      width: 230,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{r.label}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {r.tableRef ?? "no table anywhere"}
          </div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      accessorFn: (r) => ROLE_LABEL[r.role],
      filter: "select",
      width: 180,
      cell: (r) => <RoleBadge role={r.role} />,
    },
    {
      id: "total_today",
      header: "Today",
      accessorFn: (r) => r.totalToday ?? -1,
      width: 110,
      cell: (r) => (
        <span className="tabular-nums">{usdPrecise(r.totalToday)}</span>
      ),
    },
    {
      id: "total_30d",
      header: "Last 30 days",
      accessorFn: (r) => r.total30d ?? -1,
      width: 130,
      cell: (r) => <span className="tabular-nums">{usdPrecise(r.total30d)}</span>,
    },
    {
      id: "total_all",
      header: "All time",
      accessorFn: (r) => r.totalAll ?? -1,
      width: 130,
      cell: (r) => <span className="tabular-nums">{usdPrecise(r.totalAll)}</span>,
    },
    {
      id: "rows",
      header: "Rows",
      accessorFn: (r) => r.rows ?? -1,
      width: 100,
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {r.rows === null ? "—" : count(r.rows)}
        </span>
      ),
    },
    {
      id: "last_write",
      header: "Last write",
      accessorFn: (r) => r.lastWrite ?? "",
      filter: "select",
      width: 140,
      cell: (r) => (
        <span
          className={
            r.role === "gap" || r.role === "unmeasured"
              ? "text-destructive"
              : "text-muted-foreground"
          }
        >
          {staleness(r.lastWrite)}
        </span>
      ),
    },
    {
      id: "note",
      header: "What it means",
      accessorFn: (r) => r.note,
      width: 420,
      cell: (r) => (
        <span className="text-muted-foreground">{r.note}</span>
      ),
    },
  ];

  const orgColumns: MatrxColumnDef<SpendOrgRow>[] = [
    {
      id: "name",
      header: "Organization",
      accessorFn: (r) => r.name,
      width: 240,
      cell: (r) =>
        r.organizationId ? (
          <Link
            href={`/organizations/${r.organizationId}`}
            className="truncate font-medium text-primary underline-offset-2 hover:underline"
          >
            {r.name}
          </Link>
        ) : (
          <span className="truncate text-muted-foreground">
            Unattributed (no organization on the row)
          </span>
        ),
    },
    {
      id: "cost_today",
      header: "Today",
      accessorFn: (r) => r.costToday,
      width: 120,
      cell: (r) => <span className="tabular-nums font-medium">{usd(r.costToday)}</span>,
    },
    {
      id: "cost_7d",
      header: "Last 7 days",
      accessorFn: (r) => r.cost7d,
      width: 130,
      cell: (r) => <span className="tabular-nums">{usd(r.cost7d)}</span>,
    },
    {
      id: "cost_30d",
      header: "Last 30 days",
      accessorFn: (r) => r.cost30d,
      width: 130,
      cell: (r) => <span className="tabular-nums">{usd(r.cost30d)}</span>,
    },
    {
      id: "runs_30d",
      header: "Runs (30d)",
      accessorFn: (r) => r.runs30d,
      width: 120,
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">{count(r.runs30d)}</span>
      ),
    },
    {
      id: "organization_id",
      accessorKey: "organizationId",
      header: "Organization ID",
      cellKind: "uuid",
      width: 110,
    },
  ];

  const userColumns: MatrxColumnDef<SpendUserRow>[] = [
    {
      id: "email",
      header: "Person",
      accessorFn: (r) => r.email ?? r.userId,
      width: 260,
      cell: (r) => (
        <Link
          href={`/administration/users?focus=${r.userId}`}
          className="truncate text-primary underline-offset-2 hover:underline"
        >
          {r.email ?? r.userId}
        </Link>
      ),
    },
    {
      id: "cost_24h",
      header: "Rolling 24h",
      accessorFn: (r) => r.cost24h,
      width: 130,
      cell: (r) => <span className="tabular-nums font-medium">{usdPrecise(r.cost24h)}</span>,
    },
    {
      id: "cost_6h",
      header: "Rolling 6h",
      accessorFn: (r) => r.cost6h,
      width: 120,
      cell: (r) => <span className="tabular-nums">{usdPrecise(r.cost6h)}</span>,
    },
    {
      id: "requests_24h",
      header: "Requests (24h)",
      accessorFn: (r) => r.requests24h,
      width: 140,
      cell: (r) => <span className="tabular-nums text-muted-foreground">{count(r.requests24h)}</span>,
    },
    {
      id: "tokens_24h",
      header: "Tokens (24h)",
      accessorFn: (r) => r.tokens24h,
      width: 140,
      cell: (r) => <span className="tabular-nums text-muted-foreground">{count(r.tokens24h)}</span>,
    },
    {
      id: "auth_type",
      header: "Auth",
      accessorFn: (r) => r.authType ?? "unknown",
      filter: "select",
      width: 120,
    },
    {
      id: "blocked",
      header: "Throttled",
      accessorFn: (r) => (r.blocked ? "Throttled" : "No"),
      filter: "select",
      width: 120,
      cell: (r) =>
        r.blocked ? (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
            Throttled
          </span>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    {
      id: "last_request_at",
      header: "Last request",
      accessorFn: (r) => r.lastRequestAt ?? "",
      width: 170,
      cell: (r) => (
        <span className="text-muted-foreground">{timestamp(r.lastRequestAt)}</span>
      ),
    },
    {
      id: "user_id",
      accessorKey: "userId",
      header: "User ID",
      cellKind: "uuid",
      width: 110,
    },
  ];

  const dayColumns: MatrxColumnDef<SpendDayPoint>[] = [
    { id: "day", header: "Day", accessorFn: (r) => r.day, filter: "select", width: 160 },
    {
      id: "cost",
      header: "Spend",
      accessorFn: (r) => r.cost,
      width: 140,
      cell: (r) => <span className="tabular-nums font-medium">{usd(r.cost)}</span>,
    },
    {
      id: "runs",
      header: "Runs",
      accessorFn: (r) => r.runs,
      width: 120,
      cell: (r) => <span className="tabular-nums text-muted-foreground">{count(r.runs)}</span>,
    },
  ];

  const gaps = data?.ledgers.filter((l) => l.role === "gap" || l.role === "unmeasured") ?? [];

  return (
    <div className="flex w-full flex-col gap-5 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden />
            Platform spend
          </h1>
          <p className="text-xs text-muted-foreground">
            Where the money went, across every organization. Day boundaries are
            local midnight in {zoneLabel(timezone)}
            {data && data.timezone !== timezone
              ? ` — the database did not recognise that zone and used ${zoneLabel(data.timezone)} instead`
              : ""}
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {refreshedAt
              ? `Refreshed ${refreshedAt.toLocaleTimeString()}`
              : "Not loaded yet"}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
            {loading ? "Reading…" : "Refresh"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="font-medium">The spend read failed — no numbers are shown.</div>
          <div className="mt-1 text-xs">
            {error.message}
            {" · "}
            This page needs a Super Admin account; the read is refused at the
            database, not hidden in the UI. Use Refresh to try again.
          </div>
        </div>
      ) : null}

      {knobsState.error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          The alarm threshold setting could not be read
          ({knobsState.error.message}), so the headline below will not change
          colour no matter how high today runs. Seed
          <span className="font-mono"> platform.spend_popover.scare_threshold_usd </span>
          to restore it.
        </div>
      ) : null}

      {data && scareThresholdUsd !== null ? (
        <SpendHeadline
          today={data.headline.today}
          todayRuns={data.headline.todayRuns}
          yesterday={data.headline.yesterday}
          last7d={data.headline.last7d}
          last30d={data.headline.last30d}
          monthToDate={data.headline.monthToDate}
          monthProjection={data.headline.monthProjection}
          scareThresholdUsd={scareThresholdUsd}
          timezone={data.timezone}
          density="full"
        />
      ) : null}

      {data ? (
        <>
          <Section
            icon={AlertTriangle}
            title="Known gaps"
            subtitle={`${gaps.length} cost sources measure nothing — the headline above is a lower bound`}
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {gaps.map((gap) => (
                <div
                  key={gap.ledgerKey}
                  className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {gap.label}
                    </span>
                    <span className="shrink-0 text-[11px] text-destructive">
                      {gap.tableRef ? staleness(gap.lastWrite) : "no ledger"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{gap.note}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section
            icon={DollarSign}
            title="Every cost source"
            subtitle="What each ledger holds, and the role it plays in the number above"
          >
            <MatrxDataTable
              urlState={{ id: "spend-ledgers" }}
              data={data.ledgers}
              columns={ledgerColumns}
              getRowId={(r) => r.ledgerKey}
              pageSize={25}
              emptyState={{ title: "No cost sources registered." }}
              toolbar={{ search: true, searchPlaceholder: "Search cost sources…" }}
            />
          </Section>

          <Section
            icon={Building2}
            title="By organization"
            subtitle="Last 30 days on the primary ledger · click a name to open the organization"
          >
            <MatrxDataTable
              urlState={{ id: "spend-orgs" }}
              data={data.byOrg}
              columns={orgColumns}
              getRowId={(r) => r.organizationId ?? "unattributed"}
              pageSize={25}
              emptyState={{ title: "No spend attributed to any organization in 30 days." }}
              toolbar={{ search: true, searchPlaceholder: "Search organizations…" }}
            />
          </Section>

          <Section
            icon={Users}
            title="By person"
            subtitle="A DIFFERENT SCOPE — the rolling throttling window, not today"
          >
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              These figures come from the per-user throttling counters, which
              track a rolling 24-hour and 6-hour window per person and cover only
              chat-originated requests. They do not add up to the headline above
              and are not "today" — on 2026-09-12 they totalled $35.07 against
              $144.85 on the primary ledger for a nominally similar window. Use
              them to see who is driving spend, never as a platform total.
            </p>
            <MatrxDataTable
              urlState={{ id: "spend-users" }}
              data={data.byUser}
              columns={userColumns}
              getRowId={(r) => r.userId}
              pageSize={25}
              emptyState={{ title: "No per-user usage recorded in the rolling window." }}
              toolbar={{ search: true, searchPlaceholder: "Search people…" }}
            />
          </Section>

          <Section
            icon={DollarSign}
            title="By day"
            subtitle={`Last 30 local days in ${zoneLabel(data.timezone)}`}
          >
            <DaySparkline days={data.byDay} />
            <MatrxDataTable
              urlState={{ id: "spend-days" }}
              data={[...data.byDay].reverse()}
              columns={dayColumns}
              getRowId={(r) => r.day}
              pageSize={31}
              emptyState={{ title: "No daily series available." }}
              toolbar={{ search: true, searchPlaceholder: "Search days…" }}
            />
          </Section>

          <Section
            icon={Package}
            title="Print orders"
            subtitle="Revenue customers paid us, against what Lulu charged us — not part of the spend headline"
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Revenue (paid)
                </div>
                <div className="text-lg font-semibold tabular-nums text-foreground">
                  {usd(data.printOrders.revenueUsd)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {count(data.printOrders.paidOrders)} of {count(data.printOrders.orders)} orders
                </div>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Refunded
                </div>
                <div className="text-lg font-semibold tabular-nums text-foreground">
                  {usd(data.printOrders.refundedUsd)}
                </div>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Our Lulu cost
                </div>
                <div className="text-lg font-semibold tabular-nums text-foreground">
                  {usd(data.printOrders.luluCostUsd)}
                </div>
              </div>
              <div
                className={`rounded-md border px-3 py-2 ${
                  data.printOrders.marginUsd < 0
                    ? "border-destructive/50 bg-destructive/10"
                    : "border-border bg-card"
                }`}
              >
                <div
                  className={`text-[11px] uppercase tracking-wide ${
                    data.printOrders.marginUsd < 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  Margin
                </div>
                <div
                  className={`text-lg font-semibold tabular-nums ${
                    data.printOrders.marginUsd < 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {usd(data.printOrders.marginUsd)}
                </div>
                <div
                  className={`text-[11px] ${
                    data.printOrders.marginUsd < 0 ? "text-destructive/80" : "text-muted-foreground"
                  }`}
                >
                  revenue − refunds − Lulu cost
                </div>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Last order
                </div>
                <div className="text-sm font-medium text-foreground">
                  {timestamp(data.printOrders.lastOrderAt)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Lulu cost is captured per order at quote time
                </div>
              </div>
            </div>
          </Section>
        </>
      ) : null}
    </div>
  );
}
