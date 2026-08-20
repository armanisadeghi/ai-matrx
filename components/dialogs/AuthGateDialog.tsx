"use client";

import React from "react";
import { LogIn, Gem, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useLoginHref } from "@/hooks/auth/useLoginHref";

interface AuthGateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
  featureDescription?: string;
}

/**
 * Auth gate that keeps users on the current page.
 * Opens a sign-in/sign-up prompt without navigating away.
 * After successful auth the user returns to exactly where they were.
 * Desktop: Dialog — Mobile: Drawer (bottom sheet)
 */
export function AuthGateDialog({
  isOpen,
  onClose,
  featureName = "this feature",
  featureDescription,
}: AuthGateDialogProps) {
  const isMobile = useIsMobile();
  const signInUrl = useLoginHref();
  const signUpUrl = useLoginHref("/sign-up");

  const content = (
    <div className="flex flex-col items-center gap-5 pt-2 pb-4 px-1 text-center">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
        <Lock className="w-7 h-7 text-primary" />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]">
          {featureDescription ||
            `Sign in to use ${featureName}. Your current work will be right here when you get back.`}
        </p>
      </div>

      <div className="flex flex-col gap-2.5 w-full max-w-[260px]">
        <Button
          className="w-full gap-2"
          onClick={() => {
            window.location.href = signInUrl;
          }}
        >
          <LogIn className="w-4 h-4" />
          Sign In
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => {
            window.location.href = signUpUrl;
          }}
        >
          <Gem className="w-4 h-4" />
          Create Free Account
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DrawerContent className="pb-safe">
          <DrawerHeader className="text-center">
            <DrawerTitle>Sign in required</DrawerTitle>
            <DrawerDescription>
              {featureName} requires an account
            </DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Sign in required</DialogTitle>
          <DialogDescription>
            {featureName} requires an account
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

export default AuthGateDialog;
