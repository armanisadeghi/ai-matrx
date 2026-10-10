"use client";

// Give free months directly — no code (billing.free_months_apply). One dialog for every door:
// the Accounts roster (one person or the selected people) and the Free time & coupons tab
// (pick people here). Months are 1..billing/free_period_max_months, read live; the database
// applies its stacking rule (the more generous plan wins, capped at the ceiling) per person and
// refuses with its own words, which are shown per person with the resulting end date.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";
import { UserSearchField } from "@/features/user-search/UserSearchField";
import { fetchPlans } from "@/features/admin/limits/service";
import type { Plan } from "@/features/admin/limits/types";
import { audienceLabel } from "@/features/admin/limits/types";
import { isEnterpriseAudience } from "@/features/admin/limits/enterpriseCustom";
import { applyFreeMonths, fetchFreeTimeKnobs } from "../service/coupons";
import { monthsLabel, refusalText, validateMonths, type FreeMonthsResult } from "../lib/coupons";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export interface FreeMonthsPerson {
  id: string;
  label: string;
}

/** Plans free time can be given on — the same refusal the database makes (no enterprise/guest). */
export function freeTimePlans(plans: Plan[]): Plan[] {
  return plans.filter((p) => p.active && p.audience !== "guest" && !isEnterpriseAudience(p.audience));
}

/** A plan's name, with its audience when another offered plan shares the name (two "Pro"s). */
export function planOptionLabel(plan: Plan, plans: Plan[]): string {
  const shared = plans.filter((p) => p.name === plan.name).length > 1;
  return shared ? `${plan.name} · ${audienceLabel(plan.audience)}` : plan.name;
}

export function GiveFreeMonthsDialog({
  open,
  people: initialPeople,
  onClose,
  onApplied,
}: {
  open: boolean;
  /** Preselected people; empty means the admin picks them here. */
  people: FreeMonthsPerson[];
  onClose: () => void;
  onApplied?: () => void;
}) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [people, setPeople] = useState<FreeMonthsPerson[]>([]);
  const [query, setQuery] = useState("");
  const [planKey, setPlanKey] = useState("");
  const [months, setMonths] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<FreeMonthsResult[] | null>(null);

  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) {
    setSeeded(true);
    setPeople(initialPeople);
    setQuery("");
    setMonths("1");
    setNote("");
    setResults(null);
  }
  if (!open && seeded) setSeeded(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([fetchPlans(), fetchFreeTimeKnobs()])
      .then(([rows, knobs]) => {
        if (cancelled) return;
        setPlans(freeTimePlans(rows));
        setCap(knobs.maxMonths);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const monthsNum = Number(months);
  const monthsError = cap === null ? null : validateMonths(monthsNum, cap);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.label ?? id;
  const planName = (key: string) => plans?.find((p) => p.plan_key === key)?.name ?? key;

  const apply = async () => {
    if (!planKey || monthsError || people.length === 0) return;
    setSaving(true);
    try {
      const outcome = await applyFreeMonths({
        userIds: people.map((p) => p.id),
        planKey,
        months: monthsNum,
        note: note.trim() || null,
      });
      setResults(outcome.results);
      if (outcome.failed === 0) toast.success(`Free time given to ${outcome.applied}`);
      else toast.warning(`${outcome.applied} given, ${outcome.failed} refused`);
      onApplied?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give free months</DialogTitle>
          <DialogDescription>
            {people.length === 1 ? people[0].label : `${people.length} people`}
            {cap !== null ? ` · up to ${monthsLabel(cap)}` : ""}
          </DialogDescription>
        </DialogHeader>
        {results ? (
          <ul className="max-h-72 space-y-1 overflow-y-auto type-body">
            {results.map((r) => (
              <li key={r.user_id} className="flex items-baseline justify-between gap-3">
                <span className="truncate">{nameOf(r.user_id)}</span>
                {r.ok && r.grant ? (
                  <span className="shrink-0 type-secondary text-muted-foreground">
                    {planName(r.grant.plan_key)} to {new Date(r.grant.ends_at).toLocaleDateString()}
                    {r.grant.capped ? " (capped)" : ""}
                    {r.has_live_subscription ? " · pays" : ""}
                  </span>
                ) : (
                  <span className="shrink-0 type-secondary text-destructive">{refusalText(r)}<ErrorAlchemyMenu /></span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            {loadError && <p className="type-body text-destructive">{loadError}<ErrorAlchemyMenu error={loadError} /></p>}
            {initialPeople.length === 0 && (
              <div className="space-y-2">
                <UserSearchField
                  value={query}
                  onValueChange={setQuery}
                  directory="admin"
                  title="Add a person"
                  placeholder="Find a person…"
                  excludeUserIds={people.map((p) => p.id)}
                  onUserSelect={(user) => {
                    setPeople((prev) =>
                      prev.some((p) => p.id === user.id)
                        ? prev
                        : [...prev, { id: user.id, label: user.displayName || user.email || user.id }],
                    );
                    setQuery("");
                  }}
                />
                {people.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {people.map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 type-secondary"
                      >
                        {p.label}
                        <button
                          type="button"
                          aria-label={`Remove ${p.label}`}
                          onClick={() => setPeople((prev) => prev.filter((x) => x.id !== p.id))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Select value={planKey} onValueChange={setPlanKey} disabled={!plans}>
              <SelectTrigger aria-label="Plan">
                <SelectValue placeholder={plans ? "Choose a plan" : "Loading plans…"} />
              </SelectTrigger>
              <SelectContent>
                {(plans ?? []).map((plan) => (
                  <SelectItem key={plan.plan_key} value={plan.plan_key}>
                    {planOptionLabel(plan, plans ?? [])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Months</span>
              <Input
                type="number"
                min={1}
                max={cap ?? undefined}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
              {monthsError && <span className="text-destructive">{monthsError}<ErrorAlchemyMenu error={monthsError} /></span>}
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Note (optional)</span>
              <Input value={note} placeholder="Beta thank-you" onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="quiet" onClick={onClose}>
            {results ? "Done" : "Cancel"}
          </Button>
          {!results && (
            <Button
              icon={saving && <Spinner size="xs" className="text-current" />}
              variant="primary"
              onClick={() => void apply()}
              disabled={saving || !planKey || !!monthsError || cap === null || people.length === 0}
            >
              Give free time
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
