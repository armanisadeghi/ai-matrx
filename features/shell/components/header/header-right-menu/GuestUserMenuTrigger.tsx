"use client";

import AppLink from "@/components/navigation/AppLink";
import { LogIn } from "lucide-react";
import { useLoginHref } from "@/hooks/auth/useLoginHref";

/**
 * Signed-out identity control.
 *
 * `rail` sits in the bottom-left sidebar block and follows the same rules as
 * every other nav item: icon always, label only while the rail is expanded
 * (`.shell-nav-label`). It goes straight to login.
 *
 * `corner` is the glass-layer stand-in when a panel covers the top-right.
 * It is the same 44px icon slot as the signed-in avatar, with no label.
 */
export default function GuestUserMenuTrigger({
  placement = "rail",
}: {
  placement?: "rail" | "corner";
}) {
  const loginHref = useLoginHref();

  if (placement === "corner") {
    return (
      <AppLink
        href={loginHref}
        aria-label="Sign in"
        title="Sign in"
        className="flex h-11 w-11 items-center justify-center text-[var(--shell-nav-icon)] hover:bg-[var(--matrx-glass-bg-hover)]"
      >
        <LogIn
          className="h-[18px] w-[18px]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </AppLink>
    );
  }

  return (
    <AppLink
      href={loginHref}
      title="Sign in"
      className="shell-nav-item shell-tactile-subtle mx-1.5 min-w-0 flex-1"
    >
      <span className="shell-nav-icon">
        <LogIn size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="shell-nav-label">Sign in</span>
    </AppLink>
  );
}
