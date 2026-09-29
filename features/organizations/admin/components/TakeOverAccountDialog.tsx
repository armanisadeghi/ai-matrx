"use client";

/**
 * Take over a member's account — ACCESS LADDER T-16 (common-docs/policies/access-ladder.md).
 *
 * Private is the owner alone. An organization owner or admin's ONLY way into a member's private
 * data is taking over the account, the Google Workspace / Microsoft 365 procedure: the person is
 * signed out everywhere, every other way into the account is closed, the admin sets a new password
 * and signs in as the account. The written reason is sent to the person and recorded on their own
 * access log and on this organization's log. It works only for an account this organization alone
 * holds; a person's own account that also belongs to other organizations is refused by the database
 * with its own sentence, which this dialog shows verbatim.
 *
 * Moving their work to someone else is NOT this: that is offboarding's transfer.
 */
import React, { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// A confirmation of an irreversible act is an AlertDialog: it blocks the page on purpose.
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listTakeOverPurposes, takeOverAccount, type TakeOverPurpose } from "../service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  userId: string;
  label: string;
  onDone: () => void;
}

const MIN_PASSWORD = 12;

export function TakeOverAccountDialog({ open, onOpenChange, orgId, userId, label, onDone }: Props) {
  const [purposes, setPurposes] = useState<TakeOverPurpose[] | null>(null);
  const [purposesError, setPurposesError] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!open || purposes) return;
    let live = true;
    listTakeOverPurposes()
      .then((rows) => live && setPurposes(rows))
      .catch((err: unknown) =>
        live && setPurposesError(err instanceof Error ? err.message : "The reason list could not be loaded."),
      );
    return () => {
      live = false;
    };
  }, [open, purposes]);

  const submit = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      const result = await takeOverAccount({ orgId, userId, purpose, reason, newPassword: password });
      if (!result.takenOver) {
        setRefusal(result.message);
        return;
      }
      toast.success(result.message);
      setPassword("");
      onOpenChange(false);
      onDone();
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : "The take-over could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Take over {label}&apos;s account</AlertDialogTitle>
          <AlertDialogDescription>
            This is the only way into a member&apos;s private data. It happens the moment you
            confirm:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{label} is signed out on every device, and their password stops working.</li>
          <li>
            Their reset links, second sign-in factor and outside sign-ins (such as Google) are
            removed.
          </li>
          <li>You sign in as the account with the new password you set here.</li>
          <li>
            {label} is told who did it and the reason you write, and it stays on their access
            record and this organization&apos;s log permanently.
          </li>
        </ul>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="takeover-purpose">Reason category</Label>
            {purposesError ? (
              <p className="text-sm text-destructive">{purposesError}</p>
            ) : (
              <Select value={purpose} onValueChange={setPurpose} disabled={!purposes}>
                <SelectTrigger id="takeover-purpose">
                  <SelectValue placeholder={purposes ? "Choose a reason" : "Loading reasons…"} />
                </SelectTrigger>
                <SelectContent>
                  {(purposes ?? []).map((p) => (
                    <SelectItem key={p.slug} value={p.slug}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="takeover-reason">Why, in your own words (sent to {label})</Label>
            <Textarea
              id="takeover-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="text-base md:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="takeover-password">New password for the account</Label>
            <Input
              id="takeover-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-base md:text-sm"
            />
            <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters.</p>
          </div>
          {refusal ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {refusal}
            </p>
          ) : null}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} variant="destructive">
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="mr-2 h-4 w-4" />
            )}
            Take over account
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
