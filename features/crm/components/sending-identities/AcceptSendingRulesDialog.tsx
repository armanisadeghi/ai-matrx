"use client";

/**
 * AcceptSendingRulesDialog — read the sending rules, accept them on the record.
 *
 * This is the FIRST caller of `acceptOutreachPolicy` (the write existed since
 * crm_06 with no UI, so `crm.outreach_acceptance` stayed empty and every send
 * was refused as `aup_not_accepted`). Acceptance is deliberate: the full text
 * is on screen, the button names the act, and the exact words agreed to are
 * recorded with the row — never a silent one-click behind a fix button.
 *
 * The text below is the plain-language floor the send authority actually
 * enforces. The formal Acceptable Use Policy draft
 * (common-docs/systems/marketing/outreach-compliance/ACCEPTABLE_USE_POLICY.md) is not
 * ratified by counsel yet; when it is, it replaces SENDING_RULES_TEXT here and
 * OUTREACH_POLICY_VERSION bumps — old acceptances stay, per version.
 */

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { acceptOutreachPolicy } from "@/features/crm/compliance/service";

export const SENDING_RULES_TEXT = `The sending rules

1. You only contact people you have a real, work-related reason to contact, and every message says who you are and offers a working one-step way to opt out.
2. An opt-out is permanent and honored immediately. So is a spam complaint. No setting, plan, or person can send past either.
3. Purchased or scraped-in-bulk contact lists are never sent to, in any kind of campaign. Marketing campaigns go only to people with a recorded opt-in.
4. Outreach leaves your own connected mailbox on your own proven domain, at a human pace, within the limits the system sets while your sending reputation is earned.
5. If bounces or complaints spike, sending pauses automatically. A person reviews before it resumes.
6. You are responsible for what your messages say and for having the right to contact each recipient under their country's rules; the system blocks countries whose rules aren't confirmed yet.`;

interface AcceptSendingRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  /** Called after the acceptance row is recorded. */
  onAccepted?: () => void;
}

export function AcceptSendingRulesDialog({
  open,
  onOpenChange,
  organizationId,
  onAccepted,
}: AcceptSendingRulesDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setSaving(true);
    setError(null);
    try {
      await acceptOutreachPolicy({
        organizationId,
        lane: "cold_outreach",
        acceptedText: SENDING_RULES_TEXT,
      });
      onAccepted?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>The sending rules</DialogTitle>
          <DialogDescription>
            One person accepts these for the whole organization. They are the
            rules the system already enforces on every message.
          </DialogDescription>
        </DialogHeader>

        <ol className="max-h-72 list-decimal space-y-2 overflow-y-auto pl-5 text-sm text-foreground">
          {SENDING_RULES_TEXT.split("\n")
            .slice(2)
            .map((line) => line.replace(/^\d+\.\s*/, ""))
            .filter(Boolean)
            .map((line) => (
              <li key={line.slice(0, 40)}>{line}</li>
            ))}
        </ol>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Not now
          </Button>
          <Button onClick={() => void accept()} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-1.5 h-4 w-4" />
            )}
            I agree to these rules
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
