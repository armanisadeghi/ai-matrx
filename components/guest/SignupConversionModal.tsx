"use client";

/**
 * THE ONE GUEST REMINDER — shown when the server answers
 * `guest_ai_allowance_used` (lib/guest/guest-ai-allowance.ts).
 *
 * Opened only through the `guestAiAllowance` overlay
 * (features/overlays/openers/guestAiAllowance.tsx), never rendered by a
 * feature. It is a reminder, never a wall: "Not now" closes it and every
 * non-AI feature keeps working. "Create free account" keeps the current page
 * as the return destination (utils/auth/FEATURE.md via `useLoginHref`).
 */

import Link from "next/link";
import { UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLoginHref } from "@/hooks/auth/useLoginHref";

export const GUEST_AI_ALLOWANCE_DEFAULT_MESSAGE =
  "Create a free account to keep going.";

const TITLE = "You've used your free AI tries";

/**
 * The server's sentence wins, minus a leading restatement of the title (the
 * envelope's message opens with the same words the title already shows).
 */
function descriptionFor(message: string | null | undefined): string {
  let served = message?.trim() ?? "";
  if (served.toLowerCase().startsWith(TITLE.toLowerCase())) {
    served = served.slice(TITLE.length).replace(/^[.!]?\s*/, "");
  }
  return served || GUEST_AI_ALLOWANCE_DEFAULT_MESSAGE;
}

export interface SignupConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The server's own sentence, when it sent one. */
  message?: string | null;
}

export function SignupConversionModal({
  isOpen,
  onClose,
  message,
}: SignupConversionModalProps) {
  const signUpHref = useLoginHref("/sign-up?source=guest_ai_allowance");
  const loginHref = useLoginHref("/login?source=guest_ai_allowance");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{descriptionFor(message)}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Already have one?{" "}
          <Link
            href={loginHref}
            onClick={onClose}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Not now
          </Button>
          <Button variant="primary" asChild>
            <Link href={signUpHref} onClick={onClose}>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              Create free account
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
