"use client";

// features/hr/me/SelfServiceToggle.tsx
//
// The BOOLEAN sibling of `SelfServiceField` (SPEC-EMPLOYEES §7.1).
//
// 🚨 WHY A SECOND COMPONENT RATHER THAN A BRANCH IN THE FIRST. `SelfServiceField`
// renders a text input, and its whole §7.2 pending-request rule is built around
// "the requested VALUE renders instead of the stored one". A boolean has no
// meaningful requested-value display — "true, awaiting HR" is not a sentence a
// person can act on — and the only field this serves is `self_free`, which never
// creates a request at all. Forcing a checkbox through the text component would
// mean a policy branch inside every render path of a component whose reason for
// existing is a rule that does not apply here.
//
// 🚨 THE POLICY IS THE SERVER'S, AND THIS IS UX ONLY. `hr.field_policy` is the
// source: `(target_token, column_name)` resolved against the org with the platform
// row as fallback, and **fail-closed** — a column with no policy row is rejected as
// `unknown` rather than ignored. `hr_employee.directory_opt_out` is seeded
// `self_free` at the platform level, which `hr_self_update` folds into its `free`
// branch and applies immediately. If that seed is ever changed to
// `self_request_approval`, this control keeps working and the server starts
// answering `requested` instead of `applied` — which `useSelfUpdate` already words
// correctly. Nothing here needs to know.
//
// 🚨 THE IN-FLIGHT FLIP IS DROPPED THE MOMENT THE SAVE SETTLES, so a refusal snaps
// the switch back to what is stored. A privacy switch that appears to have taken
// effect when it has not is the one failure this control must never have: the
// person believes they are hidden and they are not. See `pending` below.

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function SelfServiceToggle({
  field,
  label,
  description,
  value,
  onSave,
  saving,
  className,
}: {
  field: string;
  label: string;
  /** What turning it ON actually does, in the person's own terms. */
  description: string;
  value: boolean;
  /**
   * Resolves `false` when the write did not land. This control does not need the
   * answer — it clears `pending` either way and the refreshed prop snaps the
   * switch back — but the host DOES: it renders the sentence saying why, which
   * is the half a switch silently reverting can never explain on its own.
   */
  onSave: (field: string, next: boolean) => Promise<boolean>;
  saving?: boolean;
  className?: string;
}) {
  /*
    🚨 THE STORED VALUE IS NEVER COPIED INTO STATE — only the IN-FLIGHT one is.
    `pending` holds what the person just asked for and is cleared the moment the
    save settles, so the prop is the single source of truth on every other render.
    Mirroring `value` into state with an effect would mean two places believe they
    know whether somebody is hidden, and the stale one wins on any render the
    effect has not caught up with. For a privacy switch that is the one failure
    that matters: the person believes they are hidden and they are not.
  */
  const [pending, setPending] = useState<boolean | null>(null);
  const shown = pending ?? value;

  const toggle = async (next: boolean) => {
    setPending(next);
    try {
      await onSave(field, next);
    } finally {
      // Cleared on BOTH paths. On success the refreshed prop carries the new
      // truth; on refusal it carries the old one and the switch snaps back.
      setPending(null);
    }
  };

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0 space-y-0.5">
        <label
          htmlFor={`self-toggle-${field}`}
          className="block text-sm font-medium text-foreground"
        >
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
        <Switch
          id={`self-toggle-${field}`}
          checked={shown}
          disabled={saving}
          onCheckedChange={(next) => void toggle(next)}
        />
      </div>
    </div>
  );
}
