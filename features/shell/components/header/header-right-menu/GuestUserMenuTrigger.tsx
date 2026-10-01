"use client";

import AppLink from "@/components/navigation/AppLink";
import { LogIn } from "lucide-react";
import { useLoginHref } from "@/hooks/auth/useLoginHref";

/**
 * Signed-out identity control — the account rail's last row. Same rules as
 * every nav row: icon always, label only while the rail is expanded
 * (`.shell-nav-label`). It goes straight to login.
 */
export default function GuestUserMenuTrigger() {
  const loginHref = useLoginHref();

  return (
    <AppLink
      href={loginHref}
      title="Sign in"
      className="shell-nav-item shell-nav-stable shell-tactile-subtle"
    >
      <span className="shell-nav-icon">
        <LogIn size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="shell-nav-label">Sign in</span>
    </AppLink>
  );
}
