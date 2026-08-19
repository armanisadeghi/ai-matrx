// features/education/compliance/components/AgeDeclarationDialog.tsx
//
// The one-tap age-band prompt shown when a signed-in learner reaches an AI entry
// point with no declared age. Declaration is MANDATORY — before 2026-08-17 the
// band was NULL for every account in the database, so `edu_coppa_gate` returned
// ai_allowed=true universally and the entire child-safety gate was a no-op.
//
// This is a step, never a wall: picking a band writes it, re-checks the gate,
// and `useAiComplianceGate` resumes the action the learner originally clicked.
// An under-13 pick hands off to AiConsentRequiredDialog (a parent must approve).

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";
import { AUTH_DEST_PARAM } from "@/utils/auth/auth-destination";
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
import type { AgeBand } from "../types";

const BANDS: { value: AgeBand; label: string }[] = [
  { value: "under_13", label: "Under 13" },
  { value: "13_17", label: "13–17" },
  { value: "adult", label: "18 or older" },
];

export function AgeDeclarationDialog({
  open,
  onOpenChange,
  onPick,
  saving,
  isGuest = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (band: AgeBand) => void;
  /** The band currently being written, so its button shows the spinner. */
  saving: AgeBand | null;
  /**
   * A guest (anonymous) session. Adds a "sign in" path alongside declaring —
   * a guest can either tell us their age here or sign into an existing account.
   */
  isGuest?: boolean;
}) {
  const isMobile = useIsMobile();
  const busy = saving !== null;
  const pathname = usePathname();
  const signInHref = `/login?${AUTH_DEST_PARAM}=${encodeURIComponent(pathname ?? "/education")}`;

  const title = "How old are you?";
  const explainer = (
    <>
      <span className="block">
        We ask once, so we can apply the right privacy protections. Children
        under 13 need a parent&apos;s approval before using AI features —
        that&apos;s children&apos;s privacy law (COPPA), not a preference.
      </span>
      <span className="block">
        Pick your age below and we&apos;ll pick up right where you left off.
      </span>
      {isGuest ? (
        <span className="block text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={signInHref} className="font-medium underline underline-offset-2">
            Sign in
          </Link>
          .
        </span>
      ) : null}
    </>
  );

  const choices = (
    <div className="flex flex-col gap-2 sm:flex-row">
      {BANDS.map((b) => (
        <Button
          key={b.value}
          variant="outline"
          className="flex-1"
          disabled={busy}
          onClick={() => onPick(b.value)}
        >
          {saving === b.value ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {b.label}
        </Button>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={busy ? undefined : onOpenChange}>
        <DrawerContent className="pb-safe">
          <DrawerHeader>
            <div className="mb-1 flex items-center justify-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              <DrawerTitle>{title}</DrawerTitle>
            </div>
            <DrawerDescription className="space-y-3 pt-1 text-left">
              {explainer}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>{choices}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="space-y-3 pt-1 text-left">
            {explainer}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>{choices}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
