// features/hr/people/directory/offboarding/OffboardEmployeeDialog.tsx
//
// ROUTE `/hr/people` — the offboarding (separation) surface (SPEC-EMPLOYEES §4.10, §2.2).
//
// 🚨 THIS REPLACES A COMING-SOON STUB. "Start offboarding" was wired to
// `announceComingSoon("hr.people.start-offboarding")` while the door `hr_separation_record`
// was fully built and capability-gated — an HR admin could not terminate anyone through the
// product. This is the real form that calls the door I already drove live.
//
// 🚨 THE REFUSAL RENDERS WHERE THE PERSON IS LOOKING (verifications-dialog law). The door
// returns named refusals — validation (both dates required; termination before last day),
// forbidden (no `working_record.write`) — as DATA. They render inline in this dialog, which
// survives, not as a toast beside an unchanged form nobody can act on.
//
// 🚨 THE MENU ITEM IS ALREADY CAPABILITY-GATED (`canOffboard` = `identity.write` + an
// employment). The door RE-CHECKS `working_record.write` — the client is UX, never the
// boundary — so a caller who slips past the hidden control still gets a named `forbidden`.

"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, DoorOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
  fetchHrSeparationReasonCategories,
  recordHrSeparation,
} from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";
import type { HrResult } from "@/features/hr/types";
import type { HrEmployeeMenuSubject } from "@/features/hr/people/directory/useHrEmployeeMenu";
import {
  HR_SEPARATION_CATEGORIES,
  HR_SEPARATION_CATEGORY_LABELS,
  HR_SEPARATION_INITIATORS,
  HR_SEPARATION_INITIATOR_LABELS,
  type HrSeparationCategory,
  type HrSeparationInitiator,
  type HrSeparationReasonCategory,
} from "./types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `null` is "not decided", a first-class answer the rehire flow surfaces as such. */
type RehireChoice = "yes" | "no" | "undecided";
const REHIRE_LABELS: Record<RehireChoice, string> = {
  yes: "Eligible for rehire",
  no: "Not eligible for rehire",
  undecided: "Not decided yet",
};
function rehireValue(choice: RehireChoice): boolean | null {
  return choice === "yes" ? true : choice === "no" ? false : null;
}

export function OffboardEmployeeDialog({
  subject,
  onClose,
  onDone,
}: {
  /** The person to offboard. `null` keeps the dialog unmounted (parent-controlled). */
  subject: HrEmployeeMenuSubject | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reasons, setReasons] = useState<HrSeparationReasonCategory[]>([]);
  const [reasonsFailed, setReasonsFailed] = useState(false);

  const [category, setCategory] = useState<HrSeparationCategory>("involuntary");
  const [reasonId, setReasonId] = useState<string>("");
  const [initiator, setInitiator] = useState<HrSeparationInitiator>("employer");
  const [lastDayWorked, setLastDayWorked] = useState(today());
  const [terminationDate, setTerminationDate] = useState(today());
  const [rehire, setRehire] = useState<RehireChoice>("undecided");
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<HrResult<unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The reason menu is a `platform.categories` read, not an `hr_*` door. A failure here is
    // reported as its own state — the person can still see the form, just not a reason list —
    // never a silent empty menu that reads as "no reasons exist".
    fetchHrSeparationReasonCategories()
      .then((rows) => {
        if (cancelled) return;
        setReasons(rows);
        setReasonsFailed(false);
      })
      .catch(() => {
        if (!cancelled) setReasonsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!subject) return null;

  // Dates are ordered the way the door's own CHECK orders them, refused before the round-trip
  // so the person fixes it here rather than reading a server sentence for an obvious slip.
  const datesOutOfOrder = terminationDate < lastDayWorked;
  const canSubmit =
    Boolean(subject.employmentId) &&
    Boolean(reasonId) &&
    Boolean(lastDayWorked) &&
    Boolean(terminationDate) &&
    !datesOutOfOrder &&
    !saving;

  async function submit() {
    if (!subject?.employmentId || !canSubmit) return;
    setSaving(true);
    setRefusal(null);
    const result = await recordHrSeparation({
      employmentId: subject.employmentId,
      separationCategory: category,
      reasonCategoryId: reasonId,
      initiator,
      lastDayWorked,
      terminationDate,
      rehireEligible: rehireValue(rehire),
      rehireEligibleNote: note.trim() || null,
    });
    setSaving(false);

    if (result.ok) {
      const future = terminationDate > today();
      toast.success(
        future
          ? `${subject.displayName}'s separation is recorded for ${terminationDate}.`
          : `${subject.displayName} has been offboarded.`,
      );
      onDone();
      return;
    }
    setRefusal(result);
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Offboard {subject.displayName}</DialogTitle>
          <DialogDescription>
            Record their separation. This ends the employment spell and starts the
            records-retention clock; it cannot be quietly undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {refusal && !refusal.ok ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
            >
              {hrErrorSentence(refusal, "Recording this separation")}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="sep-category">Kind of separation</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as HrSeparationCategory)}
            >
              <SelectTrigger id="sep-category" className="min-h-11 sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HR_SEPARATION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {HR_SEPARATION_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sep-reason">Reason</Label>
            {reasonsFailed ? (
              <p className="text-xs text-destructive">
                The reason list could not be loaded. Reload the page and try again.
              </p>
            ) : (
              <Select value={reasonId} onValueChange={setReasonId}>
                <SelectTrigger id="sep-reason" className="min-h-11 sm:min-h-9">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sep-initiator">Who initiated it</Label>
            <Select
              value={initiator}
              onValueChange={(v) => setInitiator(v as HrSeparationInitiator)}
            >
              <SelectTrigger id="sep-initiator" className="min-h-11 sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HR_SEPARATION_INITIATORS.map((i) => (
                  <SelectItem key={i} value={i}>
                    {HR_SEPARATION_INITIATOR_LABELS[i]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sep-last-day">Last day worked</Label>
              <Input
                id="sep-last-day"
                type="date"
                value={lastDayWorked}
                onChange={(e) => setLastDayWorked(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sep-term-date">Termination date</Label>
              <Input
                id="sep-term-date"
                type="date"
                value={terminationDate}
                onChange={(e) => setTerminationDate(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
            </div>
          </div>
          {/* The door refuses termination before last day; say so here, before the round-trip. */}
          {datesOutOfOrder ? (
            <p className="text-xs text-destructive">
              The termination date cannot be before the last day worked — final pay and
              benefits key on different ones.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Last day worked and termination date are different fields, and both are required
              — final pay keys on one, benefits on the other.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="sep-rehire">Rehire eligibility</Label>
            <Select
              value={rehire}
              onValueChange={(v) => setRehire(v as RehireChoice)}
            >
              <SelectTrigger id="sep-rehire" className="min-h-11 sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REHIRE_LABELS) as RehireChoice[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {REHIRE_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sep-note">Note for the record (optional)</Label>
            <Input
              id="sep-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-11 sm:min-h-9"
              placeholder="Kept with the separation; skip it if there is nothing to add."
            />
          </div>

          {/* Downstream effects, said plainly so a destructive act is never a surprise. */}
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Recording this sets their employment to <strong>terminated</strong>, starts the
              records-retention clock on their file, and ends their HR access to this employer.
              A future termination date is recorded now and takes effect on that day.
            </span>
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-h-11 sm:min-h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={!canSubmit}
            className="min-h-11 sm:min-h-9"
          >
            <DoorOpen className="mr-1.5 h-3.5 w-3.5" />
            Offboard {subject.displayName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
