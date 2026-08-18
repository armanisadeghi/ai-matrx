// features/education/compliance/components/AiConsentRequiredDialog.tsx
//
// The "a parent must approve" state shown when an under-13 account with no active
// guardian link tries to use an AI feature. NOT a silent failure — it explains
// the COPPA requirement and routes to the guardian-consent flow (/education/family),
// reusing the existing guardian system (no parallel consent path).

"use client";

import Link from "next/link";
import { ShieldAlert, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import type { CoppaGateReason } from "../types";

export function AiConsentRequiredDialog({
  open,
  onOpenChange,
  reason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Drives the copy: "ask a parent" vs "waiting for a parent to verify". */
  reason?: CoppaGateReason;
}) {
  const isMobile = useIsMobile();
  // An active-but-unverified guardian link → the parent has been asked; they just
  // need to complete the VERIFIABLE step (COPPA §312.5). Distinct from no parent.
  const pending = reason === "guardian_verification_pending";

  const explainer = pending ? (
    <>
      <span className="block">
        A parent has been added to this <strong>under 13</strong> account, but
        they still need to <strong>verify their consent</strong> before AI
        features unlock — children&apos;s privacy law (COPPA) requires a
        verifiable step, not just a checkbox.
      </span>
      <span className="block">
        Ask your parent to open the Family page and tap{" "}
        <strong>Verify consent</strong>. It takes under a minute and unlocks
        everything automatically.
      </span>
    </>
  ) : (
    <>
      <span className="block">
        Because this account is set to <strong>under 13</strong>, a parent or
        guardian has to approve before you can use AI features or create study
        material. This keeps the account compliant with children&apos;s privacy
        rules (COPPA).
      </span>
      <span className="block">
        Ask your parent to approve you from the Family page — once they do and
        verify, everything unlocks automatically.
      </span>
    </>
  );

  const familyLink = (
    <Link href="/education/family">
      {pending ? "Open the Family page" : "Set up parent approval"}
    </Link>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="pb-safe">
          <DrawerHeader>
            <div className="mb-1 flex items-center justify-center gap-2">
              {pending ? (
                <Clock className="h-5 w-5 text-amber-500" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-amber-500" />
              )}
              <DrawerTitle>
                {pending
                  ? "Waiting for a parent to verify"
                  : "A parent needs to approve first"}
              </DrawerTitle>
            </div>
            <DrawerDescription className="space-y-3 pt-1 text-left">
              {explainer}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="flex-row gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Not now
            </Button>
            <Button asChild className="flex-1">
              {familyLink}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            {pending ? (
              <Clock className="h-5 w-5 text-amber-500" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-500" />
            )}
            <DialogTitle>
              {pending
                ? "Waiting for a parent to verify"
                : "A parent needs to approve first"}
            </DialogTitle>
          </div>
          <DialogDescription className="space-y-3 pt-1 text-left">
            {explainer}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button asChild>{familyLink}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
