"use client";

// features/applets-host/AppletGuestKeepLine.tsx — THE ONE ACCOUNT LINE A GUEST SEES IN AN APPLET (G2 guest data).
//
// Owner ruling (2026-10-09): guests may save, "prompt them to create an account to save the data but then we
// BETTER NOT lose their data". After the reminder knob (applets.guest/saves_before_reminder, 3) — or when
// saving stops at the ceiling (applets.guest/max_records, 25) — one line above the Applet says their records
// come with them, with the button. Sign-up promotes the SAME guest; logging in claims its workspace
// (lib/guest/session-handover.ts); both land back here (the destination rides the link).

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@ai-matrx/design-system/controls";
import type { GuestSaveStatus } from "@ai-matrx/applets";

import { useLoginHref } from "@/hooks/auth/useLoginHref";

export function guestKeepLineShown(status: GuestSaveStatus | null): status is GuestSaveStatus {
  return !!status && status.saved > 0 && (status.saved >= status.reminderAt || status.saved >= status.ceiling);
}

export function AppletGuestKeepLine({ status }: { status: GuestSaveStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const signUp = useLoginHref("/sign-up");
  const logIn = useLoginHref("/login");
  const n = status.saved;
  return (
    <div role="status" className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2 text-sm text-foreground">
      <span>
        Create a free account to keep these — your {n} {n === 1 ? "record comes" : "records come"} with you
      </span>
      <Button variant="primary" disabled={pending} onClick={() => startTransition(() => router.push(signUp))}>
        Create free account
      </Button>
      <Button variant="quiet" disabled={pending} onClick={() => startTransition(() => router.push(logIn))}>
        Log in
      </Button>
    </div>
  );
}
