// features/education/compliance/components/AiConsentRequiredDialog.tsx
//
// The "a parent must approve" state shown when an under-13 account with no active
// guardian link tries to use an AI feature. NOT a silent failure — it explains
// the COPPA requirement and routes to the guardian-consent flow (/education/family),
// reusing the existing guardian system (no parallel consent path).

"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function AiConsentRequiredDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            <DialogTitle>A parent needs to approve first</DialogTitle>
          </div>
          <DialogDescription className="space-y-3 pt-1 text-left">
            <span className="block">
              Because this account is set to <strong>under 13</strong>, a parent or
              guardian has to approve before you can use AI features or create study
              material. This keeps the account compliant with children&apos;s privacy
              rules (COPPA).
            </span>
            <span className="block">
              Ask your parent to approve you from the Family page — once they do,
              everything unlocks automatically.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button asChild>
            <Link href="/education/family">Set up parent approval</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
