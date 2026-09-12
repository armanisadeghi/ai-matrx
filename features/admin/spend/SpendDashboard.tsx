// features/admin/spend/SpendDashboard.tsx
//
// THE PLATFORM SPEND DASHBOARD — /administration/billing/spend
//
// Arman, 2026-09-11: "a dashboard where I can easily and quickly see where
// money is being spent". Arman, 2026-09-12: "the data doesn't really give me
// what I need to see … where the heck is all this money going?"
//
// The page in reading order:
//   1. the headline (today / yesterday / 7d / 30d / month) — the alarm;
//   2. the EXPLORER (SpendExplorer): any window, every dimension, the 80/20
//      view, the "dig here" signals, drill-down by click;
//   3. the honesty tail: every cost ledger and its role, the sources that
//      measure nothing, and print orders (revenue, not spend).
//
// THE HONESTY RULE that shapes the whole page: the headline and every number
// in the explorer are `runtime.global_execution` and NOTHING else. Other
// ledgers are shown beside it, each labelled with the role it plays (primary /
// overlap / additive / gap / unmeasured), and a "not measured" cell is never
// drawn as $0.00.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Package,
  RefreshCw,
} from "lucide-react";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { SpendExplorer } from "./SpendExplorer";
import { SpendHeadline } from "./SpendHeadline";
import { knobNumber } from "@/lib/knobs/featureKnobs";

import { fetchSpendOverview, viewerTimezone } from "./service";
import { useSpendPopoverKnobs } from "./useSpendPopoverKnobs";
import { count, staleness, timestamp, usd, usdPrecise, zoneLabel } from "./format";
import type { SpendLedger, SpendLedgerRole, SpendOverview } from "./types";

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
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_CLASS[role]}`}>
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

/** A section that starts folded: the honesty tail is reference, not the answer. */
function Folded({
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
  const [open, setOpen] = useState(false);
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 items-baseline gap-2 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden />
        )}
        <Icon className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </button>
      {open ? children : null}
    </section>
  );
}

export function SpendDashboard() {
  const [timezone] = useState(() => viewerTimezone());
  const [data, setData] = useState<SpendOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const knobsState = useSpendPopoverKnobs();
  const scareThresholdUsd = knobsState.knobs?.scareThresholdUsd ?? null;

  // The one number no ledger can hold: invoice-billed hosting and plan-billed
  // services, entered by the person who pays them (knob
  // platform.spend.fixed_monthly_usd). Shown beside the measured spend, never
  // added into it; 0 reads as "not entered yet", never as $0.00.
  const [fixedMonthly, setFixedMonthly] = useState<number | null | "missing">(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const v = await knobNumber("platform.spend", "fixed_monthly_usd");
        if (!cancelled) setFixedMonthly(v);
      } catch {
        if (!cancelled) setFixedMonthly("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const next = await fetchSpendOverview(timezone);
        if (cancelled) return;
        setData(next);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setData(null);
        setError(cause instanceof Error ? cause : new Error("The spend read failed for an unknown reason."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timezone, reloadTick]);

  const ledgerColumns: MatrxColumnDef<SpendLedger>[] = [
    {
      id: "label",
      header: "Cost source",
      accessorFn: (r) => r.label,
      width: 230,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{r.label}</div>
          <div className="truncate text-[11px] text-muted-foreground">{r.tableRef ?? "no table anywhere"}</div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      accessorFn: (r) => ROLE_LABEL[r.role],
      filter: "select",
      width: 170,
      cell: (r) => <RoleBadge role={r.role} />,
    },
    {
      id: "total_today",
      header: "Today",
      accessorFn: (r) => r.totalToday ?? -1,
      width: 100,
      align: "right",
      cell: (r) => <span className="tabular-nums">{usdPrecise(r.totalToday)}</span>,
    },
    {
      id: "total_30d",
      header: "Last 30 days",
      accessorFn: (r) => r.total30d ?? -1,
      width: 110,
      align: "right",
      cell: (r) => <span className="tabular-nums">{usdPrecise(r.total30d)}</span>,
    },
    {
      id: "total_all",
      header: "All time",
      accessorFn: (r) => r.totalAll ?? -1,
      width: 110,
      align: "right",
      cell: (r) => <span className="tabular-nums">{usdPrecise(r.totalAll)}</span>,
    },
    {
      id: "rows",
      header: "Rows",
      accessorFn: (r) => r.rows ?? -1,
      width: 90,
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">{r.rows === null ? "—" : count(r.rows)}</span>
      ),
    },
    {
      id: "last_write",
      header: "Last write",
      accessorFn: (r) => r.lastWrite ?? "",
      filter: "select",
      width: 120,
      cell: (r) => (
        <span className={r.role === "gap" || r.role === "unmeasured" ? "text-destructive" : "text-muted-foreground"}>
          {staleness(r.lastWrite)}
        </span>
      ),
    },
    {
      id: "note",
      header: "What it means",
      accessorFn: (r) => r.note,
      width: 360,
      cell: (r) => <span className="text-muted-foreground">{r.note}</span>,
    },
  ];

  const gaps = data?.ledgers.filter((l) => l.role === "gap" || l.role === "unmeasured") ?? [];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden />
            Platform spend
          </h1>
          <p className="text-xs text-muted-foreground">
            Where the money went, across every organization. Day boundaries are local midnight in{" "}
            {zoneLabel(timezone)}
            {data && data.timezone !== timezone
              ? ` — the database did not recognise that zone and used ${zoneLabel(data.timezone)} instead`
              : ""}
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {data ? `Headline read ${new Date(data.generatedAt).toLocaleTimeString()}` : "Not loaded yet"}
          </span>
          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {loading ? "Reading…" : "Refresh headline"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="font-medium">The spend read failed — no numbers are shown.</div>
          <div className="mt-1 text-xs">
            {error.message}
            {" · "}
            This page needs a Super Admin account; the read is refused at the database, not hidden in the UI.
            Use Refresh to try again.
          </div>
        </div>
      ) : null}

      {knobsState.error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          The alarm threshold setting could not be read ({knobsState.error.message}), so the headline below
          will not change colour no matter how high today runs. Seed
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
        <p className="-mt-3 text-[11px] text-muted-foreground">
          {fixedMonthly === "missing"
            ? "Fixed costs (hosting, plan-billed services): the setting platform.spend.fixed_monthly_usd is missing, so none are shown."
            : fixedMonthly === null
              ? "Fixed costs (hosting, plan-billed services): reading…"
              : fixedMonthly > 0
                ? `Plus fixed costs of about ${usd(fixedMonthly / data.headline.daysInMonth)} per day (${usd(fixedMonthly)} a month for hosting and plan-billed services, entered by hand; not part of any number above).`
                : "Fixed costs (hosting, plan-billed services) are not entered yet — set the monthly figure under Administration → Users → Limits (platform.spend.fixed_monthly_usd) and it will show here per day."}
        </p>
      ) : null}

      <SpendExplorer />

      {data ? (
        <>
          <Folded
            icon={DollarSign}
            title="Every cost source"
            subtitle={`${data.ledgers.length} ledgers · ${gaps.length} measure nothing, so every number above is a lower bound`}
          >
            <div className="flex flex-col gap-3">
              <Section
                icon={AlertTriangle}
                title="Known gaps"
                subtitle="Money we know we spend with no row to prove it"
              >
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {gaps.map((gap) => (
                    <div key={gap.ledgerKey} className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{gap.label}</span>
                        <span className="shrink-0 text-[11px] text-destructive">
                          {gap.tableRef ? staleness(gap.lastWrite) : "no ledger"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{gap.note}</p>
                    </div>
                  ))}
                </div>
              </Section>
              <MatrxDataTable
                urlState={{ id: "spend-ledgers" }}
                data={data.ledgers}
                columns={ledgerColumns}
                getRowId={(r) => r.ledgerKey}
                pageSize={25}
                emptyState={{ title: "No cost sources registered." }}
                toolbar={{ search: true, searchPlaceholder: "Search cost sources…" }}
              />
            </div>
          </Folded>

          <Folded
            icon={Package}
            title="Print orders"
            subtitle="Revenue customers paid us, against what Lulu charged us — not part of the spend headline"
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Revenue (paid)</div>
                <div className="text-lg font-semibold tabular-nums text-foreground">{usd(data.printOrders.revenueUsd)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {count(data.printOrders.paidOrders)} of {count(data.printOrders.orders)} orders
                </div>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Refunded</div>
                <div className="text-lg font-semibold tabular-nums text-foreground">{usd(data.printOrders.refundedUsd)}</div>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Our Lulu cost</div>
                <div className="text-lg font-semibold tabular-nums text-foreground">{usd(data.printOrders.luluCostUsd)}</div>
              </div>
              <div
                className={`rounded-md border px-3 py-2 ${
                  data.printOrders.marginUsd < 0 ? "border-destructive/50 bg-destructive/10" : "border-border bg-card"
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
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Last order</div>
                <div className="text-sm font-medium text-foreground">{timestamp(data.printOrders.lastOrderAt)}</div>
                <div className="text-[11px] text-muted-foreground">Lulu cost is captured per order at quote time</div>
              </div>
            </div>
          </Folded>
        </>
      ) : null}
    </div>
  );
}
