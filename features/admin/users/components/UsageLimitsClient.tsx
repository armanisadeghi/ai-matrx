"use client";

// Users & Access › AI usage limits — who is close to, or over, their AI-points
// allowance, window by window, and the two levers an admin pulls: change the
// plan, or reset a window.
//
// Data: the Accounts roster read (GET /api/admin/users) — one pass, no per-row
// calls. Each row's plan, windows and states are billing._points_usage_state's
// answer verbatim (users.admin_account_plans); the Enterprise source
// organization and the month's points are users.admin_account_points. Nothing
// here recomputes a state or a limit (USAGE-GATE.md, "the one answer").
//
// Reset writes billing.usage_reset_apply (super-admin): one marker per window,
// the calculation then counts that window from the marker. The row is
// replaced with the function's fresh answer.

import { useEffect, useState } from "react";
import { MoreHorizontal, RotateCcw, WalletCards } from "lucide-react";
import { formatCount } from "@ai-matrx/kit/format";
import { Input } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KpiGrid, KpiTile } from "@/components/official/kpi/KpiTile";
import { ErrorNotice } from "@ai-matrx/design-system";
import { readOf } from "@ai-matrx/design-system";
import AppLink from "@/components/navigation/AppLink";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  ChangePlanDialog,
  type ChangePlanSubject,
} from "@/features/admin/limits/components/ChangePlanDialog";
import { applyUsageReset } from "@/features/admin/limits/service";
import { periodLabel } from "@/features/admin/limits/types";
import { resetConsequence } from "@/features/admin/limits/enterpriseCustom";
import { AdminUserRef } from "./AdminUserRef";
import { rowInSegment, type AccountSegment } from "../lib/accountSegments";
import {
  PRIMARY_WINDOWS,
  applyFreshUsage,
  compareConstraint,
  inUsagePopulation,
  maxPressure,
  presentSecondaryWindows,
  usageKpis,
  windowOf,
  windowRatio,
} from "../lib/usageLimits";
import type { AdminUsageState, AdminUserRow } from "../types";

import { Spinner } from "@/components/ui/loaders/Spinner";
const SEGMENTS: ReadonlyArray<{ id: AccountSegment; label: string }> = [
  { id: "people", label: "People" },
  { id: "guests", label: "Guests" },
  { id: "team", label: "Team" },
  { id: "bots_tests", label: "Bots & tests" },
  { id: "all", label: "All" },
];

const STATE_LABEL: Record<AdminUsageState, string> = { ok: "OK", near: "Near", over: "Over" };

const STATE_BADGE: Record<AdminUsageState, string> = {
  ok: "border-success/40 bg-success/10 text-success-ink",
  near: "border-warning/40 bg-warning/10 text-warning-ink",
  over: "border-destructive/40 bg-destructive/10 text-destructive-ink",
};

const STATE_BAR: Record<AdminUsageState, string> = {
  ok: "bg-success",
  near: "bg-warning",
  over: "bg-destructive",
};

const RESET_CHOICES = ["rolling_5h", "week", "month"] as const;

function displayName(row: AdminUserRow): string {
  return row.display_name?.trim() || row.email?.trim() || `${row.is_anonymous ? "guest" : "account"} ${row.id.slice(0, 8)}`;
}

function WindowCell({ row, period }: { row: AdminUserRow; period: string }) {
  const w = windowOf(row, period);
  if (!w) return <span className="type-secondary text-muted-foreground">—</span>;
  const ratio = windowRatio(w);
  const pct = ratio === null ? null : ratio === Infinity ? 999 : Math.min(999, Math.round(ratio * 100));
  const title = [
    `${periodLabel(period)}: ${formatCount(w.used)} / ${w.limit === null ? "no limit" : formatCount(w.limit)} points`,
    w.resets_at ? `resets ${new Date(w.resets_at).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="w-full min-w-24" title={title}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", STATE_BAR[w.state])}
          style={{ width: `${pct === null ? 0 : Math.min(100, pct)}%` }}
        />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-1 type-meta tabular-nums">
        <span className="truncate text-muted-foreground">
          {formatCount(w.used, { style: "compact" })} / {w.limit === null ? "no limit" : formatCount(w.limit, { style: "compact" })}
        </span>
        <span className={cn("shrink-0", w.state === "ok" ? "text-muted-foreground" : w.state === "near" ? "text-warning" : "text-destructive")}>
          {pct === null ? "" : `${pct}%`}
        </span>
      </div>
    </div>
  );
}

function ResetDialog({
  row,
  onClose,
  onDone,
}: {
  row: AdminUserRow | null;
  onClose: () => void;
  onDone: (row: AdminUserRow, fresh: unknown) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (row && seededFor !== row.id) {
    setSeededFor(row.id);
    setPicked(new Set());
    setAll(false);
    setNote("");
  }
  const periods = all ? null : RESET_CHOICES.filter((p) => picked.has(p));
  const ready = all || (periods?.length ?? 0) > 0;
  const name = row ? displayName(row) : "";

  const toggle = (period: string, on: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(period);
      else next.delete(period);
      return next;
    });
  };

  const submit = async () => {
    if (!row || !ready) return;
    setSaving(true);
    try {
      const fresh = await applyUsageReset(row.id, periods, note.trim() || null);
      onDone(row, fresh);
      toast.success("Usage reset");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset AI usage</DialogTitle>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {RESET_CHOICES.map((period) => (
              <label key={period} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={all || picked.has(period)}
                  disabled={all}
                  onCheckedChange={(v) => toggle(period, v === true)}
                  aria-label={periodLabel(period)}
                />
                {periodLabel(period)}
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={all} onCheckedChange={(v) => setAll(v === true)} aria-label="All windows" />
              All
            </label>
          </div>
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>Note (optional)</span>
            <Input value={note} placeholder="Support: stuck after a failed run" onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className={cn("type-body", ready ? "text-foreground" : "text-muted-foreground")}>
            {ready ? resetConsequence(name, periods) : "Pick the windows to clear."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={saving && <Spinner size="xs" className="text-current" />} variant="danger" onClick={() => void submit()} disabled={saving || !ready}>
            Reset usage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsageLimitsClient() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [segment, setSegment] = useState<AccountSegment>("all");
  const [allAccounts, setAllAccounts] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [planTarget, setPlanTarget] = useState<ChangePlanSubject | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);
  const [nowMs, setNowMs] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let res = await fetch("/api/admin/users", { cache: "no-store" });
        let json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load accounts");
        if (typeof json.plans_error === "string") {
          // The plans read is heavy; a transient failure usually clears. Retry once before showing the banner.
          await new Promise((r) => setTimeout(r, 1500));
          if (cancelled) return;
          const again = await fetch("/api/admin/users", { cache: "no-store" });
          const againJson = await again.json();
          if (again.ok) {
            res = again;
            json = againJson;
          }
        }
        if (!cancelled) {
          setRows(json.users as AdminUserRow[]);
          setPlansError(typeof json.plans_error === "string" ? json.plans_error : null);
          setNowMs(Date.now());
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const population = rows.filter((row) => inUsagePopulation(row, nowMs, allAccounts));
  const visible = population.filter((row) => rowInSegment(row, segment)).sort(compareConstraint);
  const kpis = usageKpis(visible);
  const windows = [...PRIMARY_WINDOWS, ...presentSecondaryWindows(visible)];

  const columns: MatrxColumnDef<AdminUserRow>[] = [
    {
      id: "person",
      header: "Person",
      accessorFn: (row) => displayName(row),
      cell: (row) => (
        <AdminUserRef userId={row.id} name={row.display_name} email={row.email} />
      ),
      width: 220,
    },
    {
      id: "plan",
      header: "Plan",
      accessorFn: (row) => row.plan?.name ?? "—",
      filter: "select",
      cell: (row) =>
        row.plan ? (
          <div className="min-w-0 type-secondary">
            <div className="truncate">{row.plan.name}</div>
            {row.plan.organization ? (
              <AppLink
                href={`/administration/users/organizations?org=${row.plan.organization.id}`}
                className="block truncate type-meta text-primary underline-offset-2 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                via {row.plan.organization.name}
              </AppLink>
            ) : (
              <div className="truncate type-meta text-muted-foreground">
                {row.plan.source === "grant" ? "assigned" : row.plan.source === "guest" ? "guest allowance" : row.plan.source === "organization" ? "organization plan" : "default plan"}
              </div>
            )}
          </div>
        ) : (
          <span className="type-secondary text-muted-foreground">—</span>
        ),
      width: 150,
    },
    {
      id: "state",
      header: "State",
      accessorFn: (row) => STATE_LABEL[row.plan?.state ?? "ok"],
      sortValue: (row) => ({ over: 2, near: 1, ok: 0 })[row.plan?.state ?? "ok"] * 10_000 + Math.min(9_999, maxPressure(row) * 1000),
      filter: "select",
      cell: (row) => {
        const state = row.plan?.state ?? "ok";
        return (
          <span className={cn("inline-flex rounded border px-1.5 py-0.5 type-meta font-medium", STATE_BADGE[state])}>
            {STATE_LABEL[state]}
          </span>
        );
      },
      width: 80,
    },
    ...windows.map(
      (period): MatrxColumnDef<AdminUserRow> => ({
        id: `w_${period}`,
        header: periodLabel(period),
        accessorFn: (row) => {
          const w = windowOf(row, period);
          return w ? windowRatio(w) : null;
        },
        cell: (row) => <WindowCell row={row} period={period} />,
        filter: false,
        width: 140,
      }),
    ),
    {
      id: "month_points",
      header: "Points this month",
      accessorFn: (row) => row.plan?.month_points ?? 0,
      cell: (row) => <span className="type-secondary tabular-nums">{formatCount(row.plan?.month_points ?? 0)}</span>,
      align: "right",
      width: 120,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {plansError ? (
        <ErrorNotice
          size="inline"
          message="Plans and usage could not load. Refresh to retry."
          error={plansError}
          operation="Load account plans"
          calls={["users.admin_account_plans", "users.admin_account_points"]}
        />
      ) : null}
      <KpiGrid className="lg:grid-cols-4">
        <KpiTile label="Over" value={loading ? null : formatCount(kpis.over)} tone={kpis.over ? "bad" : "neutral"} loading={loading} title="Accounts with at least one window at or past its limit." />
        <KpiTile label="Near" value={loading ? null : formatCount(kpis.near)} tone={kpis.near ? "warn" : "neutral"} loading={loading} title="Accounts past the near threshold in some window, none over." />
        <KpiTile label="OK" value={loading ? null : formatCount(kpis.ok)} tone="good" loading={loading} title="Accounts within every window." />
        <KpiTile label="Points this month" value={loading ? null : formatCount(kpis.monthPoints)} loading={loading} title="AI points spent this calendar month by the accounts listed." />
      </KpiGrid>
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={visible}
          columns={[
            ...columns,
            {
              id: "custom-actions",
              header: "Manage",
              sortable: false,
              filter: false,
              customActions: (row) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button icon={<MoreHorizontal />} aria-label="Actions" variant="quiet" title="Actions" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setResetTarget(row)}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Reset…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={row.plan?.source === "guest"}
                      onSelect={() =>
                        setPlanTarget({
                          kind: "user",
                          id: row.id,
                          name: displayName(row),
                          currentPlanKey: row.plan?.key ?? null,
                          grantActive: row.plan?.source === "grant",
                        })
                      }
                    >
                      <WalletCards className="mr-2 h-4 w-4" /> Change plan…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
          ]}
          getRowId={(r) => r.id}
          isLoading={loading}
          pageSize={50}
          urlState={{ id: "usage-limits" }}
          read={readOf({ loading, error }, { what: "AI usage" })}
          emptyState={{
            title: "Nobody to show",
            description: allAccounts ? "No accounts in this segment." : "No AI use in 35 days, nobody near a limit.",
          }}
          toolbar={{
            leading: (
              <div className="flex flex-wrap items-center gap-1">
                {SEGMENTS.map((s) => (
                  <Button
                    key={s.id}
                    variant={segment === s.id ? "outline" : "quiet"}
                    aria-pressed={segment === s.id}
                    onClick={() => setSegment(s.id)}
                  >
                    {s.label}
                    <span className="ml-1 tabular-nums text-muted-foreground">
                      {population.filter((row) => rowInSegment(row, s.id)).length}
                    </span>
                  </Button>
                ))}
                <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox checked={allAccounts} onCheckedChange={(v) => setAllAccounts(v === true)} aria-label="All accounts" />
                  All accounts
                </label>
              </div>
            ),
          }}
        />
      </div>
      <ChangePlanDialog
        subject={planTarget}
        onClose={() => setPlanTarget(null)}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />
      <ResetDialog
        row={resetTarget}
        onClose={() => setResetTarget(null)}
        onDone={(row, fresh) =>
          setRows((prev) => prev.map((r) => (r.id === row.id ? applyFreshUsage(r, fresh) : r)))
        }
      />
    </div>
  );
}
