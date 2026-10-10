"use client";

// One Enterprise organization's own AI-points values, per window.
//
// Enterprise is NEVER unlimited and never one person's plan (Arman,
// 2026-10-04): the numbers are entered here per ORGANIZATION
// (`billing.account_addon`, source `enterprise_custom`, via
// `billing.org_custom_limit_set` / `_remove`, super-admin) and every member
// inherits them through `billing._points_usage_state`. A window holds a number
// or is "Not set"; with nothing set, members use their own plan, and the
// editor says so. There is no Unlimited option and blank never saves.

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, Input } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { cn } from "@/lib/utils";
import { fetchAccountAddons, removeOrgCustomLimit, setOrgCustomLimit } from "../service";
import { periodLabel, pointsToUsdLabel } from "../types";
import {
  ENTERPRISE_CUSTOM_WINDOWS,
  customLimitsByPeriod,
  parseCustomLimit,
} from "../enterpriseCustom";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
function CustomCell({
  period,
  saved,
  rate,
  orgName,
  isLastSet,
  onSave,
  onRemove,
}: {
  period: string;
  saved: number | undefined;
  rate: number | null;
  orgName: string;
  isLastSet: boolean;
  onSave: (value: number) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const savedText = saved === undefined ? "" : String(saved);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? savedText;
  const label = periodLabel(period);

  const remove = async () => {
    const ok = await confirm({
      title: `Unset ${orgName}'s ${label} value?`,
      description: isLastSet
        ? "Nothing is then set — members use their own plan."
        : `Members then have no ${label.toLowerCase()} cap from ${orgName}.`,
      confirmLabel: "Unset",
      cancelLabel: "Keep it",
      variant: "destructive",
    });
    if (!ok) {
      setDraft(null);
      return;
    }
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

  const commit = async () => {
    // Enter saves, then the input disables and blurs: that blur must not send
    // the same value a second time while the first save is in flight.
    if (saving) return;
    if (draft === null || draft.trim() === savedText) {
      setDraft(null);
      return;
    }
    const parsed = parseCustomLimit(draft);
    if (parsed === undefined) {
      toast.error("Enter a whole number of points");
      return;
    }
    if (parsed === null) {
      if (saved === undefined) setDraft(null);
      else await remove();
      return;
    }
    if (parsed === 0) {
      const ok = await confirm({
        title: `Set ${orgName}'s ${label} value to 0?`,
        description: `0 means no AI points at all — every member of ${orgName} is blocked.`,
        confirmLabel: "Set to 0",
        cancelLabel: "Cancel",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const hint =
    value.trim() === "" ? "" : (pointsToUsdLabel(value.replace(/[,_\s]/g, ""), null, rate) ?? "not a number");

  return (
    <label className="group block min-w-0 space-y-0.5">
      <span className="block type-meta font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <Input
          className="w-full" numeric mark={draft !== null && draft.trim() !== savedText ? "changed" : saved === undefined && draft === null ? "inherited" : undefined}
          placeholder="Not set"
          aria-label={`${orgName} ${label} AI points`}
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
          <Spinner size="xs" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        ) : saved !== undefined ? (
          <Button variant="quiet" icon={<X />} removes aria-label={`Unset the ${label} value`} title="Unset this window" onClick={(event) => {
              event.preventDefault();
              void remove();
            }} className="absolute top-1/2 opacity-0 focus-visible:opacity-100 group-hover:opacity-100" />
        ) : null}
      </div>
      <span
        className={cn(
          "block truncate text-right type-meta text-muted-foreground",
          value.trim() === "0" && "text-warning",
        )}
      >
        {value.trim() === "0" ? "no AI at all" : hint}
      </span>
    </label>
  );
}

export function EnterpriseCustomLimitsEditor({
  organizationId,
  organizationName,
  className,
}: {
  organizationId: string;
  organizationName: string;
  className?: string;
}) {
  const { rate } = useCostDisplay();
  const [values, setValues] = useState<Map<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const addons = await fetchAccountAddons();
      setValues(customLimitsByPeriod(addons, organizationId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [organizationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const setCount = values?.size ?? 0;

  return (
    <section
      className={cn("rounded-md border border-border bg-card px-3 py-2", className)}
      aria-label="Enterprise custom limits"
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="type-secondary font-semibold">Custom limits · AI points per person</h3>
        {values && setCount === 0 ? (
          <span className="truncate type-meta text-warning">
            Not set — members use their own plan
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="type-secondary text-destructive">{error}<ErrorAlchemyMenu error={error} /></p>
      ) : !values ? (
        <div className="flex h-12 items-center gap-2 type-secondary text-muted-foreground">
          <Spinner size="xs" className="text-current" /> Reading custom values
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 pr-4 sm:grid-cols-5">
          {ENTERPRISE_CUSTOM_WINDOWS.map((period) => (
            <CustomCell
              key={`${organizationId}|${period}`}
              period={period}
              saved={values.get(period)}
              rate={rate}
              orgName={organizationName}
              isLastSet={setCount === 1 && values.has(period)}
              onSave={async (value) => {
                await setOrgCustomLimit(organizationId, period, value, null);
                await load();
              }}
              onRemove={async () => {
                await removeOrgCustomLimit(organizationId, period);
                await load();
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
