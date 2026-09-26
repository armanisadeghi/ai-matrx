"use client";

/**
 * Header center zone for /vault. Identity only — the workspace owns its own
 * search, scope switcher, and create actions, so duplicating them up here
 * would give the route two competing toolbars.
 */
import { ShieldCheck, KeyRound } from "lucide-react";
import { TapTargetButton } from "@ai-matrx/tap-target";
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
        // A labelled tap button, so on a phone RouteHeader keeps it visible
        // icon-only (name + tooltip kept) rather than folding it into "…".
        <TapTargetButton
          href="/vault/authenticator"
          icon={<KeyRound className="h-4 w-4" />}
          label="Authenticator"
        />
      }
    />
  );
}
