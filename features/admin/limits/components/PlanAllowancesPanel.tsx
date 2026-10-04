"use client";

// The allowances half of Limits & Knobs — every plan's numbers in ONE matrix,
// editable in place (Arman, 2026-10-03: every plan number is set from the
// admin console, never in code).
//
// Rows are plans grouped by audience (Guest, Free, Personal, Business,
// Enterprise), ordered by rank. Columns are (capability, window) pairs:
// AI points gets one column per window — Month, Week, 5-hour by default, Day
// and 1-hour behind a toggle — because a plan carries several windows at once
// (`billing.plan_limit` is unique on plan × capability × period). Every other
// capability gets its own matrix below, one column per window that exists,
// plus "Add window" for a window no plan has yet.
//
// Rules the cells carry or the data becomes untrustworthy:
//
//   * BLANK IS UNLIMITED and is never the same thing as 0. `0` means "this plan
//     does not include this at all". A third state exists: NO ROW for that
//     window — the window simply does not apply to the plan (the usage state
//     never judges it). The three render differently: placeholder
//     "unlimited", a "not included" hint, and a "—" placeholder.
//   * Blank typed over an existing row saves NULL (unlimited). Blank over a
//     missing row saves nothing. Removing a window is its own control (the X
//     beside a cell that holds a row → `billing.plan_limit_remove`, a soft
//     delete), and it names its consequence before it acts: the plan then has
//     no cap in that window at all.
//   * Money dimensions are stored in micro-dollars, points in points (the
//     dollar figure beside points is a hint from the `billing.points_per_usd`
//     knob via `pointsToUsdLabel`). Conversions live in `types.ts`, once.
//   * A capability with `enforced = false` is TRACKING ONLY and says so in
//     words wherever its numbers appear.
//   * Name and price are read-only here — they are `billing.plan` columns,
//     edited on Billing › Plans & pricing (the price links there).
//   * THE 0 TRAP: saving 0 asks first and names the consequence ("0 means no AI
//     points at all for Pro — every account on it is blocked.").
//   * ENTERPRISE HAS NO CELLS. It is never unlimited and has no plan numbers:
//     its values are entered per organization (Organizations admin, custom
//     limits) and inherited by members. Its row says so and links there.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, X } from "lucide-react";
import { formatFileSize } from "@ai-matrx/kit/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import {
  fetchCapabilities,
  fetchPlanLimits,
  fetchPlans,
  removePlanLimit,
  setPlanLimit,
} from "../service";
import type { Capability, Plan, PlanLimit } from "../types";
import {
  DEFAULT_POINTS_WINDOWS,
  METER_PERIODS,
  OPTIONAL_POINTS_WINDOWS,
  POINTS_CAPABILITY,
  groupPlansByAudience,
  isMicroUsd,
  isPoints,
  limitToDisplay,
  limitToStored,
  periodLabel,
  planPriceLabel,
  pointsToUsdLabel,
} from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { isEnterpriseAudience, zeroConfirmation } from "../enterpriseCustom";

/**
 * The one honest word for `billing.capability.enforced`. "Tracking only" is
 * deliberately not jargon: the number is counted against, and nobody is
 * stopped. Shared with the add-ons tab so the two never drift apart.
 */
export function EnforcementBadge({ enforced }: { enforced: boolean }) {
  return enforced ? (
    <Badge variant="default" className="text-xs">
      enforced
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-warning text-xs text-warning"
      title="Usage is counted against this limit, but nobody is blocked when they pass it."
    >
      tracking only — does not stop anything yet
    </Badge>
  );
}

function cellId(planId: string, capability: string, period: string): string {
  return `${planId}|${capability}|${period}`;
}

interface MatrixColumn {
  capability: string;
  period: string;
}

const BYTES_CAPABILITIES = new Set(["platform.storage_bytes"]);

/** "weekly", "monthly"… — the word the remove confirmation uses for a window. */
const PERIOD_ADJECTIVE: Record<string, string> = {
  month: "monthly",
  week: "weekly",
  day: "daily",
  rolling_5h: "5-hour",
  rolling_1h: "1-hour",
  lifetime: "total",
};

/** One short hint under a saved or typed value — ≤ 60 chars, one line. */
function valueHint(
  capability: string,
  period: string,
  raw: string,
  rate: number | null,
): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const stored = limitToStored(capability, trimmed);
  if (stored === undefined) return "not a number";
  if (stored === null) return "unlimited";
  if (Number(trimmed) === 0) return "not included";
  if (isPoints(capability)) return pointsToUsdLabel(trimmed, period, rate);
  if (BYTES_CAPABILITIES.has(capability)) return formatFileSize(Number(trimmed));
  return null;
}

function LimitCell({
  plan,
  column,
  existing,
  rate,
  onSave,
  onRemove,
}: {
  plan: Plan;
  column: MatrixColumn;
  existing: PlanLimit | undefined;
  rate: number | null;
  onSave: (value: number | null) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const saved = existing ? limitToDisplay(column.capability, existing.limit_value) : "";
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? saved;
  const dirty = draft !== null && draft.trim() !== saved;
  const hint = valueHint(column.capability, column.period, value, rate);
  const isZero = value.trim() !== "" && Number(value.trim()) === 0;

  const commit = async () => {
    if (!dirty || draft === null) {
      setDraft(null);
      return;
    }
    // Blank over a missing row is "leave the window off", not a write.
    if (!existing && draft.trim() === "") {
      setDraft(null);
      return;
    }
    const stored = limitToStored(column.capability, draft);
    if (stored === undefined) {
      toast.error("Enter a number, or \"unlimited\"");
      return;
    }
    const zero = zeroConfirmation(plan.name, column.capability, stored, existing?.limit_value);
    if (zero) {
      const ok = await confirm({
        ...zero,
        confirmLabel: "Save 0",
        cancelLabel: "Cancel",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await onSave(stored);
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const windowLabel = periodLabel(column.period);
    const adjective = PERIOD_ADJECTIVE[column.period] ?? windowLabel.toLowerCase();
    const ok = await confirm({
      title: `Remove the ${windowLabel} window from ${plan.name}?`,
      description: `${plan.name} then has no ${adjective} cap.`,
      confirmLabel: "Remove window",
      cancelLabel: "Keep it",
      variant: "destructive",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await onRemove();
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <td className="group px-1.5 py-1 align-top">
      <div className="relative">
        {isMicroUsd(column.capability) && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            $
          </span>
        )}
        <Input
          className={cn(
            "h-8 w-full min-w-24 text-right tabular-nums text-sm",
            isMicroUsd(column.capability) && "pl-5",
            !existing && "border-dashed",
            isZero && "text-muted-foreground line-through",
            dirty && "border-primary",
          )}
          placeholder={existing ? "unlimited" : "—"}
          title={existing ? undefined : "This window does not apply to the plan"}
          aria-label={`${plan.name} ${column.capability} ${periodLabel(column.period)}`}
          value={value}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") void commit();
            if (event.key === "Escape") setDraft(null);
          }}
        />
        {saving ? (
          <Loader2 className="absolute right-[-14px] top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          existing && (
            <button
              type="button"
              className="absolute right-[-15px] top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`Remove the ${periodLabel(column.period)} window from ${plan.name}`}
              title="Remove this window"
              onClick={() => void remove()}
            >
              <X className="h-3 w-3" />
            </button>
          )
        )}
      </div>
      <p
        className={cn(
          "mt-0.5 h-4 truncate text-right text-[11px] text-muted-foreground",
          isZero && "text-warning",
        )}
      >
        {hint ?? (existing && value.trim() === "" ? "unlimited" : "")}
      </p>
    </td>
  );
}

function PlanMatrix({
  plans,
  columns,
  capabilityByKey,
  limitIndex,
  rate,
  showCapability,
  onSave,
  onRemove,
}: {
  plans: Plan[];
  columns: MatrixColumn[];
  capabilityByKey: Map<string, Capability>;
  limitIndex: Map<string, PlanLimit>;
  rate: number | null;
  showCapability: boolean;
  onSave: (planKey: string, column: MatrixColumn, value: number | null) => Promise<void>;
  onRemove: (planKey: string, column: MatrixColumn) => Promise<void>;
}) {
  const groups = groupPlansByAudience(plans);
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/40">
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Plan
            </th>
            <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
              Price
            </th>
            {columns.map((column) => {
              const cap = capabilityByKey.get(column.capability);
              return (
                <th
                  key={`${column.capability}|${column.period}`}
                  className="min-w-28 px-1.5 py-2 text-right text-xs font-medium"
                >
                  {showCapability && (
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {column.capability}
                    </span>
                  )}
                  <span>{periodLabel(column.period)}</span>
                  {showCapability && cap && !cap.enforced && (
                    <span className="block text-[10px] font-normal text-warning">
                      tracking only
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupRows
              key={group.audience}
              label={group.label}
              plans={group.plans}
              columns={columns}
              limitIndex={limitIndex}
              rate={rate}
              onSave={onSave}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  label,
  plans,
  columns,
  limitIndex,
  rate,
  onSave,
  onRemove,
}: {
  label: string;
  plans: Plan[];
  columns: MatrixColumn[];
  limitIndex: Map<string, PlanLimit>;
  rate: number | null;
  onSave: (planKey: string, column: MatrixColumn, value: number | null) => Promise<void>;
  onRemove: (planKey: string, column: MatrixColumn) => Promise<void>;
}) {
  return (
    <>
      <tr className="border-b border-border bg-muted/20">
        <td
          colSpan={columns.length + 2}
          className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </td>
      </tr>
      {plans.map((plan) => (
        <tr key={plan.plan_key} className="border-b border-border last:border-b-0">
          <td className="sticky left-0 z-10 bg-card px-3 py-1.5 align-top">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{plan.name}</span>
              {plan.is_default && (
                <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                  default
                </Badge>
              )}
            </div>
            <span className="block font-mono text-[10px] text-muted-foreground">
              {plan.plan_key}
            </span>
          </td>
          <td
            className="px-2 py-1.5 text-right align-top text-xs tabular-nums text-muted-foreground"
            title={
              plan.annual_cents !== null && plan.annual_cents !== plan.monthly_cents
                ? `Billed yearly: ${planPriceLabel({ monthly_cents: plan.annual_cents, per_seat: plan.per_seat })}`
                : undefined
            }
          >
            <Link
              href="/administration/billing/plans"
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              {planPriceLabel(plan)}
            </Link>
          </td>
          {isEnterpriseAudience(plan.audience) ? (
            <td colSpan={columns.length} className="px-3 py-1.5 align-middle text-xs text-muted-foreground">
              Custom per organization ·{" "}
              <Link
                href="/administration/users/organizations?plan=enterprise"
                className="text-primary underline-offset-2 hover:underline"
              >
                Enterprise organizations
              </Link>
            </td>
          ) : columns.map((column) => (
            <LimitCell
              key={`${column.capability}|${column.period}`}
              plan={plan}
              column={column}
              existing={limitIndex.get(cellId(plan.plan_key, column.capability, column.period))}
              rate={rate}
              onSave={(value) => onSave(plan.plan_key, column, value)}
              onRemove={() => onRemove(plan.plan_key, column)}
            />
          ))}
        </tr>
      ))}
    </>
  );
}

function sortColumns(columns: MatrixColumn[]): MatrixColumn[] {
  const order = (p: string) => {
    const i = (METER_PERIODS as readonly string[]).indexOf(p);
    return i === -1 ? 99 : i;
  };
  return [...columns].sort(
    (a, b) =>
      a.capability.localeCompare(b.capability) || order(a.period) - order(b.period),
  );
}

export function PlanAllowancesPanel() {
  const { rate: costRate } = useCostDisplay();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [limits, setLimits] = useState<PlanLimit[]>([]);
  const [extraPointWindows, setExtraPointWindows] = useState<string[]>([]);
  const [addedColumns, setAddedColumns] = useState<MatrixColumn[]>([]);
  const [newCapability, setNewCapability] = useState<string>("");
  const [newPeriod, setNewPeriod] = useState<string>("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planRows, capRows, limitRows] = await Promise.all([
        fetchPlans(),
        fetchCapabilities(),
        fetchPlanLimits(),
      ]);
      setPlans(planRows.filter((plan) => plan.active));
      setCapabilities(capRows);
      setLimits(limitRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Deferred a tick so the first read is not a synchronous setState inside
  // the effect body (the house pattern — see TaxonomyAdminClient).
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const limitIndex = useMemo(() => {
    const index = new Map<string, PlanLimit>();
    for (const row of limits) {
      index.set(cellId(row.plan_id, row.capability, row.period), row);
    }
    return index;
  }, [limits]);

  const capabilityByKey = useMemo(
    () => new Map(capabilities.map((cap) => [cap.capability, cap])),
    [capabilities],
  );

  // A window that already holds a row is always shown; Day / 1-hour join by toggle.
  const pointsColumns = useMemo(() => {
    const withRows = new Set(
      limits.filter((row) => isPoints(row.capability)).map((row) => row.period),
    );
    const periods = new Set<string>([...DEFAULT_POINTS_WINDOWS, ...extraPointWindows, ...withRows]);
    return sortColumns(
      [...periods].map((period) => ({ capability: POINTS_CAPABILITY, period })),
    );
  }, [limits, extraPointWindows]);

  const otherColumns = useMemo(() => {
    const seen = new Map<string, MatrixColumn>();
    for (const row of limits) {
      if (isPoints(row.capability)) continue;
      seen.set(`${row.capability}|${row.period}`, { capability: row.capability, period: row.period });
    }
    for (const column of addedColumns) seen.set(`${column.capability}|${column.period}`, column);
    return sortColumns([...seen.values()]);
  }, [limits, addedColumns]);

  const save = useCallback(
    async (planKey: string, column: MatrixColumn, value: number | null) => {
      await setPlanLimit(planKey, column.capability, column.period, value);
      // Re-read the rows so the cell shows what the database now holds.
      setLimits(await fetchPlanLimits());
      toast.success("Allowance saved");
    },
    [],
  );

  const remove = useCallback(async (planKey: string, column: MatrixColumn) => {
    await removePlanLimit(planKey, column.capability, column.period);
    setLimits(await fetchPlanLimits());
    toast.success("Window removed");
  }, []);

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading plans…</p>;
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>
        <Button className="mt-3" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const pointsCap = capabilityByKey.get(POINTS_CAPABILITY);
  const addableCapabilities = capabilities.filter((cap) => !isPoints(cap.capability));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">AI points</h3>
          {pointsCap && <EnforcementBadge enforced={pointsCap.enforced} />}
          <span
            className="text-xs text-muted-foreground"
            title="Blank is unlimited, 0 is not included, — means the window is off."
          >
            per person, in points
          </span>
          <div className="ml-auto flex items-center gap-1">
            {OPTIONAL_POINTS_WINDOWS.map((period) => {
              const on = pointsColumns.some((c) => c.period === period);
              const locked = limits.some((row) => isPoints(row.capability) && row.period === period);
              return (
                <Button
                  key={period}
                  size="sm"
                  variant={on ? "secondary" : "outline"}
                  className="h-7 text-xs"
                  disabled={locked}
                  title={locked ? "A plan already has this window" : undefined}
                  onClick={() =>
                    setExtraPointWindows((prev) =>
                      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period],
                    )
                  }
                >
                  {on ? "Hide" : "Show"} {periodLabel(period)}
                </Button>
              );
            })}
          </div>
        </div>
        <PlanMatrix
          plans={plans}
          columns={pointsColumns}
          capabilityByKey={capabilityByKey}
          limitIndex={limitIndex}
          rate={costRate}
          showCapability={false}
          onSave={save}
          onRemove={remove}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Other allowances</h3>
          <div className="ml-auto flex items-center gap-1.5">
            <Select value={newCapability} onValueChange={setNewCapability}>
              <SelectTrigger className="h-8 w-52 text-xs" aria-label="Capability">
                <SelectValue placeholder="Capability" />
              </SelectTrigger>
              <SelectContent>
                {addableCapabilities.map((cap) => (
                  <SelectItem key={cap.capability} value={cap.capability} className="font-mono text-xs">
                    {cap.capability}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newPeriod} onValueChange={setNewPeriod}>
              <SelectTrigger className="h-8 w-28 text-xs" aria-label="Window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METER_PERIODS.map((period) => (
                  <SelectItem key={period} value={period} className="text-xs">
                    {periodLabel(period)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!newCapability}
              onClick={() => {
                setAddedColumns((prev) => [...prev, { capability: newCapability, period: newPeriod }]);
                setNewCapability("");
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add window
            </Button>
          </div>
        </div>
        <PlanMatrix
          plans={plans}
          columns={otherColumns}
          capabilityByKey={capabilityByKey}
          limitIndex={limitIndex}
          rate={costRate}
          showCapability
          onSave={save}
          onRemove={remove}
        />
      </section>
    </div>
  );
}
