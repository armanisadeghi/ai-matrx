"use client";

// Change which plan a PERSON or an ORGANIZATION is on (super-admin).
//
// One dialog, two subjects: a person gets DATED free time through
// `billing.free_months_apply` (Arman 2026-10-04: free time is never endless — months are
// required, 1..billing/free_period_max_months read live; the database keeps the more
// generous plan and caps the end date) and "Default plan" clears the grant through
// `billing.user_plan_set(null)`; an organization writes `billing.org_plan_assign` (plan + note; that
// function has no expiry argument, so the field is not offered). Plans come
// from `billing.plan`, grouped by audience, with the read-only price beside
// each name. The database refuses anyone but a super admin; its message is
// shown verbatim.
//
// Enterprise is never one person's plan, so a person is never offered it. When
// an organization is on (or is being moved to) Enterprise, the dialog shows
// its custom limits editor: Enterprise has no numbers of its own and is never
// unlimited — members inherit the values entered there.

import { useEffect, useState } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";
import { applyFreeMonths, fetchFreeTimeKnobs } from "@/features/admin/users/service/coupons";
import { refusalText, validateMonths } from "@/features/admin/users/lib/coupons";
import { assignOrgPlan, fetchPlans, setUserPlan } from "../service";
import { groupPlansByAudience, planPriceLabel, type Plan } from "../types";
import { isEnterpriseAudience } from "../enterpriseCustom";
import { EnterpriseCustomLimitsEditor } from "./EnterpriseCustomLimitsEditor";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const DEFAULT_CHOICE = "__default__";

export type ChangePlanSubject =
  | { kind: "user"; id: string; name: string; currentPlanKey: string | null; grantActive: boolean }
  | { kind: "organization"; id: string; name: string; currentPlanKey: string | null };

export function ChangePlanDialog({
  subject,
  onClose,
  onChanged,
}: {
  subject: ChangePlanSubject | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [note, setNote] = useState("");
  const [months, setMonths] = useState("1");
  const [cap, setCap] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subject) return;
    let cancelled = false;
    Promise.all([fetchPlans(), fetchFreeTimeKnobs()])
      .then(([rows, knobs]) => {
        if (cancelled) return;
        setPlans(rows.filter((p) => p.active));
        setCap(knobs.maxMonths);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [subject]);

  const subjectKey = subject ? `${subject.kind}:${subject.id}` : null;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (subject && seededFor !== subjectKey) {
    setSeededFor(subjectKey);
    setChoice(
      subject.kind === "user" && !subject.grantActive
        ? DEFAULT_CHOICE
        : (subject.currentPlanKey ?? ""),
    );
    setNote("");
    setMonths("1");
  }

  const groups = groupPlansByAudience(
    (plans ?? []).filter(
      (p) =>
        subject?.kind !== "user" || (p.audience !== "guest" && !isEnterpriseAudience(p.audience)),
    ),
  );
  const choiceIsEnterprise = isEnterpriseAudience(
    (plans ?? []).find((p) => p.plan_key === choice)?.audience,
  );

  const givesFreeTime = subject?.kind === "user" && choice !== "" && choice !== DEFAULT_CHOICE;
  const monthsError = givesFreeTime && cap !== null ? validateMonths(Number(months), cap) : null;

  const save = async () => {
    if (!subject || !choice || monthsError) return;
    setSaving(true);
    try {
      if (subject.kind === "user" && choice === DEFAULT_CHOICE) {
        await setUserPlan({ userId: subject.id, planKey: null, note: note.trim() || null, expiresAt: null });
      } else if (subject.kind === "user") {
        const outcome = await applyFreeMonths({
          userIds: [subject.id],
          planKey: choice,
          months: Number(months),
          note: note.trim() || null,
        });
        const result = outcome.results[0];
        if (!result?.ok || !result.grant) {
          toast.error(result ? refusalText(result) : "Refused");
          return;
        }
        toast.success(
          `${plans?.find((p) => p.plan_key === result.grant?.plan_key)?.name ?? result.grant.plan_key} until ${new Date(result.grant.ends_at).toLocaleDateString()}`,
        );
        onChanged();
        onClose();
        return;
      } else {
        await assignOrgPlan(subject.id, choice, note.trim() || null);
      }
      toast.success("Plan changed");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={subject !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size={subject?.kind === "organization" && choiceIsEnterprise ? "lg" : "sm"}>
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription className="truncate">{subject?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {loadError ? (
            <p className="type-body text-destructive">{loadError}<ErrorAlchemyMenu error={loadError} /></p>
          ) : (
            <Select value={choice} onValueChange={setChoice} disabled={!plans}>
              <SelectTrigger aria-label="Plan">
                <SelectValue placeholder={plans ? "Choose a plan" : "Loading plans…"} />
              </SelectTrigger>
              <SelectContent>
                {subject?.kind === "user" && (
                  <SelectItem value={DEFAULT_CHOICE}>Default plan</SelectItem>
                )}
                {groups.map((group) => (
                  <SelectGroup key={group.audience}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.plans.map((plan) => (
                      <SelectItem key={plan.plan_key} value={plan.plan_key}>
                        {plan.name} · {planPriceLabel(plan)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
          {givesFreeTime && (
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Free for (months{cap !== null ? `, up to ${cap}` : ""})</span>
              <Input
                type="number"
                min={1}
                max={cap ?? undefined}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
              {monthsError && <span className="text-destructive">{monthsError}<ErrorAlchemyMenu error={monthsError} /></span>}
            </label>
          )}
          {subject?.kind === "organization" && choiceIsEnterprise && (
            <EnterpriseCustomLimitsEditor
              organizationId={subject.id}
              organizationName={subject.name}
            />
          )}
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>Note (optional)</span>
            <Input
              value={note}
              placeholder="Comped for beta feedback"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={saving && <Spinner size="xs" className="text-current" />} variant="primary" onClick={() => void save()} disabled={saving || !choice || !!monthsError || (givesFreeTime && cap === null)}>
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
