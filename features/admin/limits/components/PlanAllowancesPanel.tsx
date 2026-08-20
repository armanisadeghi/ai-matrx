"use client";

// The allowances half of Limits & Knobs — what each plan includes, per metered
// capability, editable in place.
//
// These are the numbers `billing.resolve_capability` hands to every gate on the
// platform, so this grid IS the free tier. Two rules the UI has to carry or the
// data becomes untrustworthy:
//
//   * BLANK IS UNLIMITED, and it is not the same thing as 0. `0` means "this
//     plan does not include this at all"; blank means "no ceiling". Rendering
//     them the same way is how a plan silently loses a capability.
//   * A money dimension is stored in micro-dollars. The admin edits dollars;
//     the conversion happens here, once, next to the constant that declares it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import {
  fetchCapabilities,
  fetchPlanLimits,
  fetchPlans,
  setPlanLimit,
} from "../service";
import type { Capability, Plan, PlanLimit } from "../types";
import { isMicroUsd, limitToDisplay, limitToStored } from "../types";

function cellId(planId: string, capability: string, period: string): string {
  return `${planId}|${capability}|${period}`;
}

export function PlanAllowancesPanel() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [limits, setLimits] = useState<PlanLimit[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
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
      setDrafts(
        Object.fromEntries(
          limitRows.map((row) => [
            cellId(row.plan_id, row.capability, row.period),
            limitToDisplay(row.capability, row.limit_value),
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const limitIndex = useMemo(() => {
    const index = new Map<string, PlanLimit>();
    for (const row of limits) {
      index.set(cellId(row.plan_id, row.capability, row.period), row);
    }
    return index;
  }, [limits]);

  /** Only capabilities somebody actually meters get a row. */
  const meteredCapabilities = useMemo(
    () =>
      capabilities.filter((cap) =>
        limits.some((row) => row.capability === cap.capability),
      ),
    [capabilities, limits],
  );

  const save = useCallback(
    async (planId: string, capability: string, period: string) => {
      const id = cellId(planId, capability, period);
      const stored = limitToStored(capability, drafts[id] ?? "");
      if (stored === undefined) {
        toast.error("Enter a number, or leave it blank for unlimited");
        return;
      }
      setSaving(id);
      try {
        await setPlanLimit(planId, capability, period, stored);
        toast.success("Allowance saved");
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(null);
      }
    },
    [drafts, load],
  );

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading plans…</p>;
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{error}</p>
        <Button className="mt-3" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">This grid is the free tier.</p>
        <p className="mt-1 text-muted-foreground">
          These are the numbers every gate on the platform asks for. A blank cell
          means <strong>unlimited</strong>; <strong>0</strong> means the plan does
          not include the capability at all — they are not the same thing. Money
          dimensions are entered in dollars. Saving requires super-admin.
        </p>
      </div>

      {meteredCapabilities.map((cap) => {
        const money = isMicroUsd(cap.capability);
        return (
          <section key={cap.capability} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono text-sm font-semibold">{cap.capability}</h3>
              <Badge variant={cap.enforced ? "default" : "outline"} className="text-xs">
                {cap.enforced ? "enforced" : "visible only"}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                per {cap.period ?? "lifetime"}
              </Badge>
              {cap.usage_source === "external" && (
                <Badge variant="outline" className="text-xs">
                  usage measured by the owning system
                </Badge>
              )}
              {money && (
                <span className="text-xs text-muted-foreground">
                  entered in US dollars
                </span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const period = cap.period ?? "lifetime";
                const id = cellId(plan.id, cap.capability, period);
                const existing = limitIndex.get(id);
                const dirty =
                  (drafts[id] ?? "") !==
                  limitToDisplay(cap.capability, existing?.limit_value ?? null);
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 rounded-md border border-border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {plan.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {plan.audience}
                        </span>
                      </p>
                      {existing?.note && (
                        <p className="truncate text-xs text-muted-foreground">
                          {existing.note}
                        </p>
                      )}
                    </div>
                    {money && <span className="text-sm text-muted-foreground">$</span>}
                    <Input
                      className="w-28"
                      placeholder="unlimited"
                      value={drafts[id] ?? ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [id]: event.target.value }))
                      }
                    />
                    <Button
                      size="sm"
                      variant={dirty ? "default" : "ghost"}
                      disabled={!dirty || saving === id}
                      onClick={() => void save(plan.id, cap.capability, period)}
                    >
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
