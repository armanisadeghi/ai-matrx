"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, LogIn, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useExitIntent } from "@/features/auth/hooks/useExitIntent";
import { useUserType } from "@/features/auth/hooks/useUserType";
import { cn } from "@/lib/utils";

interface ExitIntentSignupModalProps {
  /** Module name woven into the headline ("Chat", "Files", etc.). */
  moduleName: string;
}

/**
 * Polite one-shot exit-intent modal. Fires only for guests, only once
 * per session, only when the cursor leaves through the top edge of the
 * viewport. Authenticated visitors and people who have already dismissed
 * never see it.
 *
 * Desktop: Dialog. Mobile: bottom Drawer (consistent with the rest of
 * the app's modal/drawer pattern).
 */
export function ExitIntentSignupModal({ moduleName }: ExitIntentSignupModalProps) {
  const userType = useUserType();
  const isMobile = useIsMobile();
  const isGuest = userType !== "authenticated";
  const fired = useExitIntent({ enabled: isGuest });
  const [dismissed, setDismissed] = useState(false);

  if (!fired || dismissed) return null;

  const returnUrl =
    typeof window !== "undefined"
      ? encodeURIComponent(window.location.pathname + window.location.search)
      : "";
  const signUpHref = `/sign-up${returnUrl ? `?returnUrl=${returnUrl}` : ""}`;
  const signInHref = `/login${returnUrl ? `?returnUrl=${returnUrl}` : ""}`;

  const content = (
    <div className="flex flex-col items-center text-center gap-5 pt-2 pb-4 px-1">
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-to-br from-blue-500/20 to-violet-500/20",
          "border border-primary/20",
        )}
      >
        <UserPlus className="h-7 w-7 text-primary" />
      </div>

      <div className="space-y-2">
        <p className="text-base font-semibold text-foreground">
          One free account unlocks {moduleName} — and the rest of AI Matrx.
        </p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Save your work, build agents, share with your team. No credit card.
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-[280px]">
        <Link
          href={signUpHref}
          className={cn(
            "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md text-sm font-semibold",
            "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
          )}
        >
          <UserPlus className="h-4 w-4" />
          Create Free Account
        </Link>
        <Link
          href={signInHref}
          className={cn(
            "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md text-sm font-medium",
            "text-foreground hover:bg-muted transition-colors",
            "border border-border",
          )}
        >
          <LogIn className="h-4 w-4" />
          Sign In
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
          Maybe later
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        open={!dismissed}
        onOpenChange={(open) => {
          if (!open) setDismissed(true);
        }}
      >
        <DrawerContent className="pb-safe">
          <DrawerHeader className="text-center">
            <DrawerTitle>Before you go</DrawerTitle>
            <DrawerDescription>Free forever for core features</DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog
      open={!dismissed}
      onOpenChange={(open) => {
        if (!open) setDismissed(true);
      }}
    >
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Before you go</DialogTitle>
          <DialogDescription>Free forever for core features</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
