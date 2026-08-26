// features/hr/people/verifications/components/VerificationRowActions.tsx
//
// The per-row controls of route 17, and the ONE place the consent gate is
// visible to a human.
//
// 🚨 GENERATE IS DISABLED — NOT ABSENT — WHEN CONSENT IS MISSING. This is the
// deliberate exception to "absent, never masked". That rule protects a viewer
// from learning what someone else's record contains. Here the viewer is HR, the
// control is legitimately theirs, and the thing they must learn is exactly
// *why they cannot press it yet*. Hiding the button would leave them with a row
// that does nothing and no way to find out why.
//
// 🚨 A DELIVERED LETTER IS NEVER EDITED. Its only forward action is "Raise a
// new request", which writes a NEW ROW referencing the prior one.

"use client";

import { useState } from "react";
import { FileSignature, FileText, Loader2, ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "@/lib/toast";
import { denyHrVerification, deliverHrVerification } from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";

import {
  HR_VERIFICATION_DELIVERY_LABELS,
  HR_VERIFICATION_DELIVERY_METHODS,
  HR_VERIFICATION_DENIAL_BASES,
  HR_VERIFICATION_DENIAL_LABELS,
  toVerificationState,
  type HrVerificationDeliveryMethod,
  type HrVerificationDenialBasis,
  type HrVerificationLetterRow,
} from "../types";

export function VerificationRowActions({
  row,
  busy,
  canGenerate,
  onGenerate,
  onChanged,
}: {
  row: HrVerificationLetterRow;
  busy: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  onChanged: () => void;
}) {
  const [denying, setDenying] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [basis, setBasis] = useState<HrVerificationDenialBasis>(
    "no_employment_record",
  );
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<HrVerificationDeliveryMethod>("email");
  const [recipient, setRecipient] = useState(row.requester_email ?? "");
  const [saving, setSaving] = useState(false);

  const state = toVerificationState(String(row.state));

  // THE GATE, re-checked in the UI on top of the table CHECK and the server.
  const needsConsent =
    Boolean(row.includes_compensation) && !row.employee_consent_at;

  const generatable =
    canGenerate && (state === "received" || state === "awaiting-consent");
  const delivered = state === "delivered";

  async function deny() {
    if (saving) return;
    setSaving(true);
    const result = await denyHrVerification({
      letterId: row.id,
      denialBasis: basis,
      note: note.trim() || null,
    });
    setSaving(false);
    if (result.ok) {
      setDenying(false);
      onChanged();
      return;
    }
    toast.error(hrErrorSentence(result, "Denying this request"));
  }

  async function deliver() {
    if (saving) return;
    setSaving(true);
    const result = await deliverHrVerification({
      letterId: row.id,
      method,
      recipient: recipient.trim() || null,
    });
    setSaving(false);
    if (result.ok) {
      setDelivering(false);
      onChanged();
      return;
    }
    toast.error(hrErrorSentence(result, "Recording the delivery"));
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {generatable ? (
        <span className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-8"
            disabled={needsConsent || busy}
            onClick={onGenerate}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSignature className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate
          </Button>
          {needsConsent ? (
            <span className="text-xs text-muted-foreground">
              Waiting on the employee&apos;s consent to state income
            </span>
          ) : null}
        </span>
      ) : null}

      {state === "generated" && canGenerate ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-8"
          onClick={() => setDelivering(true)}
        >
          Record delivery
        </Button>
      ) : null}

      {delivered ? (
        <span className="text-xs text-muted-foreground">
          Delivered — a new request is the only way to change what was asserted
        </span>
      ) : null}

      {row.letter_file_id ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          // The file lane owns the viewer. This is a door into it, never a
          // second file renderer.
          asChild
        >
          <a href={`/files/f/${row.letter_file_id}`}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Letter
          </a>
        </Button>
      ) : null}

      {canGenerate && state !== "denied" && !delivered ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          onClick={() => setDenying(true)}
        >
          <ShieldX className="mr-1.5 h-3.5 w-3.5" />
          Deny
        </Button>
      ) : null}

      {denying ? (
        <Dialog open onOpenChange={(open) => (open ? null : setDenying(false))}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Deny this request</DialogTitle>
              <DialogDescription>
                The denial is itself the record. The requester is told only that
                it cannot be provided.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="deny-basis">Basis</Label>
                <Select
                  value={basis}
                  onValueChange={(v) =>
                    setBasis(v as HrVerificationDenialBasis)
                  }
                >
                  <SelectTrigger id="deny-basis" className="min-h-11 sm:min-h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HR_VERIFICATION_DENIAL_BASES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {HR_VERIFICATION_DENIAL_LABELS[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deny-note">Note for the record</Label>
                <Input
                  id="deny-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-11 sm:min-h-9"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDenying(false)}
                className="min-h-11 sm:min-h-9"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={deny}
                disabled={saving}
                className="min-h-11 sm:min-h-9"
              >
                Deny
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {delivering ? (
        <Dialog
          open
          onOpenChange={(open) => (open ? null : setDelivering(false))}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Record the delivery</DialogTitle>
              <DialogDescription>
                Once delivered, this letter is an assertion this organization is
                held to and cannot be edited.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="deliver-method">How</Label>
                <Select
                  value={method}
                  onValueChange={(v) =>
                    setMethod(v as HrVerificationDeliveryMethod)
                  }
                >
                  <SelectTrigger
                    id="deliver-method"
                    className="min-h-11 sm:min-h-9"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HR_VERIFICATION_DELIVERY_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {HR_VERIFICATION_DELIVERY_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deliver-recipient">To</Label>
                <Input
                  id="deliver-recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="min-h-11 sm:min-h-9"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDelivering(false)}
                className="min-h-11 sm:min-h-9"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={deliver}
                disabled={saving}
                className="min-h-11 sm:min-h-9"
              >
                Record it
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
