"use client";

/**
 * Header center zone for /vault/authenticator. Identity + a door back to the
 * Vault (the credentials these authenticators sit on).
 */
import Link from "next/link";
import { ShieldCheck, ChevronRight } from "lucide-react";

export function AuthenticatorRouteHeader() {
  return (
    <div className="flex w-full items-center gap-1.5 px-1">
      <Link
        href="/vault"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Vault
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-semibold text-foreground">
        Authenticator
      </span>
    </div>
  );
}
