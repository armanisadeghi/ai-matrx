"use client";

/**
 * Header center zone for /vault. Identity only — the workspace owns its own
 * search, scope switcher, and create actions, so duplicating them up here
 * would give the route two competing toolbars.
 */
import Link from "next/link";
import { ShieldCheck, KeyRound } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

/** Mounts itself into the shell header — render it bare, never inside <PageHeader>. */
export function VaultRouteHeader() {
  return (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center gap-2 px-1">
          <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-sm font-semibold text-foreground">Vault</h1>
        </div>
      }
      right={
        <Link
          href="/vault/authenticator"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <KeyRound className="h-3.5 w-3.5" />
          Authenticator
        </Link>
      }
    />
  );
}
