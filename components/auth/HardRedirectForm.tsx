"use client";

// HardRedirectForm — a <form> for auth actions whose success landing must be a
// FULL-DOCUMENT navigation, never a soft client-side one.
//
// Why: a tab left open on /login across deploys still runs the OLD build's JS.
// A server action's redirect() is performed client-side by that old runtime,
// which then requests the destination's chunks from a build whose assets are
// gone (past the skew-protection window) — ChunkLoadError → the "This page is
// out of date" boundary. /welcome was the top reported victim because it is
// the universal first landing after login. A window.location.assign() loads
// the destination's HTML + assets entirely from the live deployment, and on an
// auth page there is no user state to lose.
//
// Contract: the passed server action returns { hardRedirect: string } on
// success. Error paths may keep calling redirect()/encodedRedirect() — those
// re-render the same auth page and are handled by Next as before.

import type { ReactNode } from "react";

export interface HardRedirectResult {
  hardRedirect: string;
}

function isHardRedirectResult(value: unknown): value is HardRedirectResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as HardRedirectResult).hardRedirect === "string"
  );
}

export function HardRedirectForm({
  action,
  className,
  suppressHydrationWarning,
  children,
}: {
  action: (formData: FormData) => Promise<HardRedirectResult | void>;
  className?: string;
  suppressHydrationWarning?: boolean;
  children: ReactNode;
}) {
  return (
    <form
      className={className}
      suppressHydrationWarning={suppressHydrationWarning}
      action={async (formData: FormData) => {
        const result = await action(formData);
        if (isHardRedirectResult(result)) {
          window.location.assign(result.hardRedirect);
        }
      }}
    >
      {children}
    </form>
  );
}
