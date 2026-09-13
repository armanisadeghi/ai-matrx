// features/emergency-access/components/EmergencyDoorAffordance.tsx
//
// WHERE THE EMERGENCY DOOR IS MET (DD-137a, fix round 1).
//
// 🚨 THE DOOR HAD NO ENTRANCE. `EmergencyDoorDialog` shipped with ZERO call
// sites — no route, button or menu mounted it — so nobody could ask for
// emergency access from any screen in the application (V-38, 2026-09-12). The
// component was real; the door was not. That is the same defect HR had before
// it (`hrBreakGlass`, zero call sites), reproduced one layer up.
//
// This is the entrance, and there is exactly one: it mounts on the ONE access
// refusal screen (`AccessDenied`), which is where a person actually meets the
// wall. Not a menu item, not a per-feature button, not a second form — the
// place the refusal happens is the place the door belongs.
//
// 🚨 ABSENT, NEVER DEAD (law 4). Whether a door exists at all depends on the
// record's data class and on the viewer's standing in the organization that
// owns the row — neither of which the browser can read, because the row is
// precisely what it was just refused. `iam.emergency_door_eligibility` answers
// in one call, and this component renders NOTHING unless the answer is yes. A
// plain member, the record's own owner, and a record whose class has no door
// all see no control at all, rather than a button that would only ever be
// refused. The ordinary "ask the owner for access" request stays exactly where
// it is, for everyone, including the people who also see this.

"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { supabase } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";

import { checkEmergencyDoorEligibility } from "../service";
import type { EmergencyDoorEligibility } from "../types";
import { EmergencyDoorDialog } from "./EmergencyDoorDialog";

export function EmergencyDoorAffordance({
  token,
  id,
  /** Whose data it is, when the refusal screen was allowed to disclose it. */
  subjectLabel,
}: {
  token: string;
  id: string;
  subjectLabel?: string;
}) {
  const [eligibility, setEligibility] =
    useState<EmergencyDoorEligibility | null>(null);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void checkEmergencyDoorEligibility(supabase, { token, id }).then(
      (result) => {
        if (cancelled) return;
        // A failed check renders nothing. It is the one case where silence is
        // right: the alternative is offering a door we could not confirm
        // exists, on a screen that is already telling the person "no".
        setEligibility(result.ok ? result.data : null);
        setChecked(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  // Nothing is rendered until we know — no skeleton, no placeholder. A control
  // that appears a beat later on a refusal screen reads as the screen changing
  // its mind; absence until certainty is the honest state.
  if (!checked || !eligibility) return null;

  if (eligibility.reason === "already_pending") {
    return (
      <p className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          You have already asked for emergency access to this record. An owner
          of the organization has to approve it, and the person whose data it is
          has been told you asked.
        </span>
      </p>
    );
  }

  if (!eligibility.eligible) return null;

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-sm text-foreground">
        This is private data, and asking its owner is not the only route open to
        you.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        As an admin of the organization that owns it you can open the emergency
        door instead:{" "}
        {eligibility.needsSecondPerson
          ? "an owner of the organization has to approve it, "
          : ""}
        the access is read-only, it expires by itself, and the person whose data
        it is is told immediately — your name, the reason you pick, and the
        sentence you type. Use it for an emergency, not to save waiting.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => setOpen(true)}
      >
        <KeyRound className="h-4 w-4" />
        Request emergency access
      </Button>
      <EmergencyDoorDialog
        token={token}
        id={id}
        subjectLabel={subjectLabel}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}

export default EmergencyDoorAffordance;
