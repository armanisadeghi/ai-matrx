"use client";

// Change which plan a PERSON or an ORGANIZATION is on (super-admin).
//
// One dialog, two subjects: a person writes `billing.user_plan_set` (per user
// first — Arman 2026-10-03; optional expiry and note; "Default plan" clears the
// grant), an organization writes `billing.org_plan_assign` (plan + note; that
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
import { Loader2 } from "lucide-react";
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
import { Input } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { assignOrgPlan, fetchPlans, setUserPlan } from "../service";
import { groupPlansByAudience, planPriceLabel, type Plan } from "../types";
import { isEnterpriseAudience } from "../enterpriseCustom";
import { EnterpriseCustomLimitsEditor } from "./EnterpriseCustomLimitsEditor";

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
  const [expires, setExpires] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subject) return;
    let cancelled = false;
    fetchPlans()
      .then((rows) => {
        if (!cancelled) setPlans(rows.filter((p) => p.active));
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
    setExpires("");
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

  const save = async () => {
    if (!subject || !choice) return;
    setSaving(true);
    try {
      if (subject.kind === "user") {
        await setUserPlan({
          userId: subject.id,
          planKey: choice === DEFAULT_CHOICE ? null : choice,
          note: note.trim() || null,
          expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        });
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
      <DialogContent className={subject?.kind === "organization" && choiceIsEnterprise ? "sm:max-w-2xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription className="truncate">{subject?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
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
          {subject?.kind === "user" && choice !== DEFAULT_CHOICE && (
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Expires (optional)</span>
              <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
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
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !choice}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
