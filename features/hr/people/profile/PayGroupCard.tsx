"use client";

// features/hr/people/profile/PayGroupCard.tsx — SPEC-EMPLOYEES §2.4 route 70
//
// THE CONTROL THAT PUTS ONE EMPLOYMENT INTO A PAY GROUP. It is the only one in
// the product: `public.hr_employment_set_pay_group` shipped live and had ZERO
// callers anywhere in the browser, so an employee created through the UI got a
// null `pay_group_id` and had no path to a non-null one (G2 D15 re-run, N6).
//
// 🚨 WHY THIS FIELD IS NOT COSMETIC. `hr.pay_period` is GENERATED FROM A PAY
// GROUP'S CALENDAR. An employment with no pay group can never have a pay period,
// and without a period there is no timesheet, no attestation, no approval, no
// lock and no export for that person. It is the whole difference between "this
// employer has people" and "this employer can pay them".
//
// 🚨 A PAY-GROUP MOVE IS NOT RETROACTIVE, AND THIS CARD SAYS SO BEFORE SAVING.
// The door answers `existing_periods_recut: false` — route 70's rule restated on
// the wire — because periods and workweeks ALREADY CUT keep the group they were
// cut under. Hours already computed, and possibly already exported, are not
// rewritten. An HR admin moving somebody mid-period who is not told that will
// believe they just fixed last week. They did not.

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Loader2 } from "lucide-react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";

import { hrSettingsHref, type HrOrgRef } from "../../routes";
import { setHrEmploymentPayGroup } from "../../service";
import type { HrPayGroupAssignmentAck } from "../../types";
import {
  payFrequencyWords,
  payGroupOptions,
  useHrStructure,
} from "../shared/useHrStructure";

/**
 * Radix `Select` refuses an empty-string item value, and "no pay group" is a real
 * answer rather than the absence of one — a contractor who invoices legitimately
 * has none. The sentinel never leaves this file; the door is sent `null`.
 */
const NO_PAY_GROUP = "__no_pay_group__";

type Refusal = { sentence: string; door: string | null };

export function PayGroupCard({
  employmentId,
  organizationId,
  currentPayGroupId,
  canWrite,
  org,
  onSaved,
}: {
  employmentId: string;
  organizationId: string;
  /** What the employment carries today, off `hr_employment_history`'s spell row. */
  currentPayGroupId: string | null;
  canWrite: boolean;
  org: HrOrgRef;
  onSaved: () => void;
}) {
  const structure = useHrStructure(organizationId).data;
  const [choice, setChoice] = useState<string>(currentPayGroupId ?? NO_PAY_GROUP);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [saved, setSaved] = useState<HrPayGroupAssignmentAck | null>(null);

  // Inactive groups are kept in the lookup: somebody already IN a deactivated
  // group still has to be able to read the name of the group they are in.
  const allGroups = payGroupOptions(structure);
  const selectable = allGroups.filter(
    (group) => group.isActive || group.id === currentPayGroupId,
  );
  const current = allGroups.find((group) => group.id === currentPayGroupId) ?? null;
  const next = choice === NO_PAY_GROUP ? null : (allGroups.find((g) => g.id === choice) ?? null);

  const chosenId = choice === NO_PAY_GROUP ? null : choice;
  const isChange = chosenId !== (currentPayGroupId ?? null);

  const save = async () => {
    // A MOVE between two groups is the case that can silently contradict hours
    // an admin has already looked at, so it gets an explicit acknowledgement —
    // through the app's own dialog, never the browser's.
    if (currentPayGroupId && chosenId && chosenId !== currentPayGroupId) {
      const go = await confirm({
        title: `Move to ${next?.name ?? "another pay group"}?`,
        description:
          "Pay periods and workweeks already cut keep the group they were cut under. " +
          "Hours already computed — and anything already exported — are not rewritten. " +
          "Only periods cut from now on use the new group's calendar.",
        confirmLabel: "Move them",
      });
      if (!go) return;
    }

    setSaving(true);
    setRefusal(null);
    const result = await setHrEmploymentPayGroup({
      employmentId,
      payGroupId: chosenId,
    });
    setSaving(false);

    if (!result.ok) {
      // A refusal is DATA. Render the server's own sentence and its door.
      setRefusal(
        result.kind === "denied"
          ? {
              sentence:
                result.detail ??
                (result.reason === "forbidden"
                  ? "Changing this person's pay group isn't yours here."
                  : result.reason === "not_reachable"
                    ? "This employment could not be found."
                    : "The pay group was not changed."),
              door: result.door,
            }
          : { sentence: result.message, door: null },
      );
      return;
    }

    setSaved(result.data);
    toast.success(
      result.data.payGroupName
        ? `Pay group set to ${result.data.payGroupName}.`
        : "Pay group cleared.",
    );
    onSaved();
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">Pay group</h3>
          <p className="max-w-prose text-xs text-muted-foreground">
            Pay periods are cut from this group&apos;s calendar. Without one, this
            person has no pay periods — so no timesheet, no approval and nothing to
            export.
          </p>
        </div>
      </div>

      {allGroups.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-foreground">
            This employer has no pay groups yet, so there is nothing to put anyone
            into.
          </p>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
            <Link href={hrSettingsHref("pay-groups", { org })}>
              Create a pay group
            </Link>
          </Button>
        </div>
      ) : !canWrite ? (
        <p className="text-sm text-foreground">
          {current
            ? `${current.name}${
                payFrequencyWords(current.payFrequency)
                  ? ` — ${payFrequencyWords(current.payFrequency)}`
                  : ""
              }`
            : "No pay group. Changing it isn't yours here."}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Label className="block min-w-0 flex-1 space-y-1.5">
              <span className="block text-xs font-medium">In this pay group</span>
              <Select value={choice} onValueChange={setChoice} disabled={saving}>
                <SelectTrigger className="h-11 sm:h-9">
                  <SelectValue placeholder="Choose a pay group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PAY_GROUP}>No pay group</SelectItem>
                  {selectable.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                      {group.isActive ? "" : " (deactivated)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            <Button
              type="button"
              size="sm"
              className="min-h-11 sm:min-h-9"
              disabled={!isChange || saving}
              onClick={save}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Save pay group
            </Button>
          </div>

          {next ? (
            <p className="text-xs text-muted-foreground">
              {payFrequencyWords(next.payFrequency)
                ? `${payFrequencyWords(next.payFrequency)} · `
                : ""}
              Periods are cut from this group&apos;s calendar.
            </p>
          ) : null}

          {/* 🚨 BEFORE SAVING, NOT AFTER. `existing_periods_recut: false` is the
              server's own statement of route 70's rule, and this is the moment an
              admin can still act on it. */}
          {isChange ? (
            <p className="max-w-prose rounded-md border border-border bg-muted/40 p-2 text-xs text-foreground">
              {currentPayGroupId && chosenId
                ? "This is not retroactive. Pay periods and workweeks already cut keep the group they were cut under — hours already computed, and anything already exported, are not rewritten. Only periods cut from here on use the new calendar."
                : currentPayGroupId && !chosenId
                  ? "Taking them out of a pay group stops future periods being cut for them. Periods already cut stay exactly as they are — nothing already computed or exported is removed."
                  : "No periods have been cut for this person under a group yet. From here on they are cut from this group's calendar; nothing before today is created retroactively."}
            </p>
          ) : null}

          {refusal ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{refusal.sentence}</p>
              {refusal.door ? (
                <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                  <Link href={refusal.door}>Go and fix it</Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* What the door actually did, in its own words. */}
          {saved && !isChange ? (
            <p className="text-xs text-muted-foreground">
              {saved.payGroupName
                ? `Saved — ${saved.payGroupName}.`
                : "Saved — no pay group."}{" "}
              {saved.existingPeriodsRecut
                ? "Existing pay periods were re-cut."
                : "No existing pay period or workweek was re-cut."}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
