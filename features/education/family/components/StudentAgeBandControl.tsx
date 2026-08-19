// features/education/family/components/StudentAgeBandControl.tsx
//
// The guardian's age-band control for a linked student — the ONE route out of
// `under_13`, and the reason the self-declaration hard block is not a dead end.
//
// A child may never self-declare out of under_13 (that click would evaporate the
// whole COPPA gate), so a real birthday has to be confirmed by an adult who
// already completed verifiable consent. Renders only for a VERIFIED link,
// because that is exactly the bar `edu_guardian_set_age_band` enforces
// server-side — showing it on an unverified link would be a button that always
// fails.

"use client";

import { useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { coppaService } from "@/features/education/compliance/coppaService";
import type { AgeBand } from "@/features/education/compliance/types";

const BANDS: { value: AgeBand; label: string }[] = [
  { value: "under_13", label: "Under 13" },
  { value: "13_17", label: "13–17" },
  { value: "adult", label: "18+" },
];

export function StudentAgeBandControl({
  studentUserId,
  studentLabel,
  onChanged,
}: {
  studentUserId: string;
  studentLabel: string;
  /** Refetch the links so a band change re-renders the consent state. */
  onChanged?: () => void;
}) {
  const [saving, setSaving] = useState<AgeBand | null>(null);
  const [done, setDone] = useState<AgeBand | null>(null);

  const setBand = async (band: AgeBand) => {
    setSaving(band);
    const res = await coppaService.guardianSetAgeBand(studentUserId, band);
    setSaving(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setDone(band);
    toast.success(
      `${studentLabel}'s age is now set to ${
        BANDS.find((b) => b.value === band)?.label ?? band
      }.`,
    );
    onChanged?.();
  };

  return (
    <div className="flex flex-col gap-2 rounded-b-lg border border-t-0 border-border bg-muted/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Had a birthday? A parent or guardian has to change {studentLabel}
          &apos;s age — children can&apos;t move themselves out of the
          under-13 protections.
        </span>
      </p>
      <div className="flex shrink-0 gap-1.5">
        {BANDS.map((b) => (
          <Button
            key={b.value}
            size="sm"
            variant={done === b.value ? "default" : "outline"}
            className="h-8 px-2 text-xs"
            disabled={saving !== null}
            onClick={() => setBand(b.value)}
          >
            {saving === b.value ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : null}
            {b.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
