"use client";

/**
 * Header center zone for /vault. Identity only — the workspace owns its own
 * search, scope switcher, and create actions, so duplicating them up here
 * would give the route two competing toolbars.
 */
import { ShieldCheck } from "lucide-react";

export function VaultRouteHeader() {
  return (
    <div className="flex w-full items-center gap-2 px-1">
      <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-semibold text-foreground">Vault</span>
    </div>
  );
}
