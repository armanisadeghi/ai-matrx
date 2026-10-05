"use client";

// Plans & pricing — every plan's own columns, editable in place: name, tagline,
// badge, monthly and annual price, per-seat, minimum seats, order, whether the
// /pricing page lists it, and whether it is active (Arman, 2026-10-04: "these
// values … need to come from the database so I can set them in the admin
// panel"). Writes go through `billing.plan_set` (super-admin); the pricing page,
// upgrade dialogs and every plan surface read the same rows through
// `billing.plan_catalog()`, so a save here is what customers see.
//
// Prices are typed in dollars and stored in cents. The two prices move as a
// pair (the RPC refuses one without the other): clearing the monthly price
// clears both (custom pricing — "Talk to sales"); setting a monthly price on a
// plan with no annual price sets the annual one to match (no discount) until
// it is edited. Cells save on Enter or blur, then re-read the rows. A save that
// touches a price, the name or active re-syncs Stripe (new prices under the
// plan's product, old ones archived) so checkout charges what this page shows.

import { useCallback, useEffect, useRef, useState } from "react";
import { Field, Switch } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { fetchPlans, setPlanFields } from "../service";
import { groupPlansByAudience, type Plan, type PlanFields } from "../types";

function toastError(err: unknown) {
  toast.error(err instanceof Error ? err.message : String(err));
}

/** Saving any of these re-syncs Stripe (prices, product name, sellable set). */
const STRIPE_FIELDS: ReadonlyArray<keyof PlanFields> = ["monthly_cents", "annual_cents", "name", "active"];

function centsToDollars(cents: number | null): string {
  if (cents === null) return "";
  return Number.isInteger(cents / 100) ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** `undefined` = not a valid amount; `null` = blank (custom pricing). */
function dollarsToCents(raw: string): number | null | undefined {
  const trimmed = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100);
}

function savingsLabel(plan: Plan): string | null {
  const { monthly_cents: m, annual_cents: a } = plan;
  if (m === null || a === null || m <= 0 || a >= m) return null;
  return `${Math.round((1 - a / m) * 100)}% off`;
}

/** A text cell that saves on Enter or blur when its value changed; Escape cancels. */
function TextCell({
  value,
  label,
  placeholder,
  className,
  inputMode,
  onSave,
}: {
  value: string;
  label: string;
  placeholder?: string;
  className?: string;
  inputMode?: "decimal" | "numeric";
  onSave: (raw: string) => Promise<void>;
}) {
  // `null` shows the stored value; a string is an edit in progress.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cancelled = useRef(false);

  const commit = async () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    if (draft === null || draft.trim() === value.trim()) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      setDraft(null);
    }
  };

  return (
    <Field
      aria-label={label}
      value={draft ?? value}
      placeholder={placeholder}
      inputMode={inputMode}
      disabled={saving}
      className={className}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function PlanRow({ plan, onSave }: { plan: Plan; onSave: (fields: PlanFields) => Promise<void> }) {
  const saveMonthly = async (raw: string) => {
    const cents = dollarsToCents(raw);
    if (cents === undefined) throw new Error("Not a price");
    if (cents === null) return onSave({ monthly_cents: null, annual_cents: null });
    const annual = plan.annual_cents === null || plan.annual_cents > cents ? cents : plan.annual_cents;
    return onSave({ monthly_cents: cents, annual_cents: annual });
  };
  const saveAnnual = async (raw: string) => {
    const cents = dollarsToCents(raw);
    if (cents === undefined) throw new Error("Not a price");
    if (plan.monthly_cents === null) throw new Error("Set the monthly price first");
    return onSave({ annual_cents: cents ?? plan.monthly_cents });
  };
  const savings = savingsLabel(plan);

  return (
    <tr className={cn("border-b border-border last:border-b-0", !plan.active && "opacity-60")}>
      <td className="sticky left-0 z-10 bg-card px-3 py-1.5 align-top">
        <TextCell
          value={plan.name}
          label={`${plan.plan_key} name`}
          className="w-32"
          onSave={(raw) => onSave({ name: raw })}
        />
        <span className="mt-0.5 block font-mono type-meta text-muted-foreground">{plan.plan_key}</span>
      </td>
      <td className="px-1.5 py-1.5 align-top">
        <TextCell
          value={plan.tagline ?? ""}
          label={`${plan.name} tagline`}
          className="w-56"
          onSave={(raw) => onSave({ tagline: raw })}
        />
      </td>
      <td className="px-1.5 py-1.5 align-top">
        <TextCell
          value={plan.badge ?? ""}
          label={`${plan.name} badge`}
          className="w-32"
          onSave={(raw) => onSave({ badge: raw })}
        />
      </td>
      <td className="px-1.5 py-1.5 align-top">
        <TextCell
          value={centsToDollars(plan.monthly_cents)}
          label={`${plan.name} monthly price`}
          placeholder="Custom"
          inputMode="decimal"
          className="w-24"
          onSave={saveMonthly}
        />
      </td>
      <td className="px-1.5 py-1.5 align-top">
        <TextCell
          value={centsToDollars(plan.annual_cents)}
          label={`${plan.name} annual price per month`}
          placeholder="Custom"
          inputMode="decimal"
          className="w-24"
          onSave={saveAnnual}
        />
        {savings && (
          <span className="mt-0.5 block type-meta text-success">{savings}</span>
        )}
      </td>
      <td className="px-1.5 py-1.5 text-center align-top">
        <Switch
          aria-label={`${plan.name} priced per seat`}
          checked={plan.per_seat}
          onCheckedChange={(on) => void onSave({ per_seat: on }).catch(toastError)}
        />
      </td>
      <td className="px-1.5 py-1.5 align-top">
        <TextCell
          value={plan.min_seats === null ? "" : String(plan.min_seats)}
          label={`${plan.name} minimum seats`}
          inputMode="numeric"
          className="w-16"
          onSave={async (raw) => {
            const n = raw.trim() === "" ? null : Number(raw);
            if (n !== null && (!Number.isInteger(n) || n < 1)) throw new Error("Minimum seats is a whole number, 1 or more");
            await onSave({ min_seats: n });
          }}
        />
      </td>
      <td className="px-1.5 py-1.5 align-top">
        <TextCell
          value={String(plan.rank)}
          label={`${plan.name} order`}
          inputMode="numeric"
          className="w-16"
          onSave={async (raw) => {
            const n = Number(raw);
            if (raw.trim() === "" || !Number.isInteger(n)) throw new Error("Order is a whole number");
            await onSave({ rank: n });
          }}
        />
      </td>
      <td className="px-1.5 py-1.5 text-center align-top">
        <Switch
          aria-label={`${plan.name} listed on the pricing page`}
          checked={plan.listed_on_pricing}
          onCheckedChange={(on) => void onSave({ listed_on_pricing: on }).catch(toastError)}
        />
      </td>
      <td className="px-1.5 py-1.5 text-center align-top">
        <Switch
          aria-label={`${plan.name} active`}
          checked={plan.active}
          onCheckedChange={(on) => void onSave({ active: on }).catch(toastError)}
        />
      </td>
    </tr>
  );
}

const HEADERS = [
  "Plan",
  "Tagline",
  "Badge",
  "Monthly $",
  "Annual $/mo",
  "Per seat",
  "Min seats",
  "Order",
  "On /pricing",
  "Active",
] as const;

export function PlanDetailsPanel({ onChanged }: { onChanged?: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlans(await fetchPlans());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const save = useCallback(
    async (planKey: string, fields: PlanFields) => {
      // A refusal propagates to the cell or switch, which names it in a toast.
      await setPlanFields(planKey, fields);
      await load();
      onChanged?.();
      if (!STRIPE_FIELDS.some((f) => f in fields)) {
        toast.success("Plan saved");
        return;
      }
      // Stripe follows the plan: new prices, archived old ones, portal lists.
      const res = await fetch("/api/admin/billing/sync-stripe-prices", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; mode?: string; created?: number };
      if (res.ok) toast.success(`Plan saved · Stripe ${body.mode ?? ""} updated`.trim());
      else toast.error(`Plan saved, but Stripe did not update: ${body.error ?? res.statusText}`);
    },
    [load, onChanged],
  );

  if (loading) {
    return <p className="p-6 type-body text-muted-foreground">Loading plans…</p>;
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="type-body text-destructive">
          {error} <ErrorAlchemyMenu error={error} />
        </p>
        <Button className="mt-3" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const groups = groupPlansByAudience(plans);
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse type-body">
        <thead className="bg-muted/40">
          <tr className="border-b border-border">
            {HEADERS.map((h, i) => (
              <th
                key={h}
                className={cn(
                  "whitespace-nowrap px-1.5 py-2 text-left type-secondary font-medium text-muted-foreground",
                  i === 0 && "sticky left-0 z-10 bg-muted/40 px-3",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupBlock key={group.audience} label={group.label} plans={group.plans} onSave={save} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupBlock({
  label,
  plans,
  onSave,
}: {
  label: string;
  plans: Plan[];
  onSave: (planKey: string, fields: PlanFields) => Promise<void>;
}) {
  return (
    <>
      <tr className="border-b border-border bg-muted/20">
        <td
          colSpan={HEADERS.length}
          className="px-3 py-1 type-meta font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </td>
      </tr>
      {plans.map((plan) => (
        <PlanRow key={plan.plan_key} plan={plan} onSave={(fields) => onSave(plan.plan_key, fields)} />
      ))}
    </>
  );
}
