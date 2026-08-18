"use client";

/**
 * HealthWarnings — per-account session health (browser.account_binding).
 *
 * "The website logged us out" is account health, distinct from the profile
 * status. Each named account is a DOOR: the origin links out so the user can go
 * fix the sign-in themselves. A problem that can be fixed ships with its fix.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { ShieldCheck, ShieldAlert, ShieldQuestion, ExternalLink } from "lucide-react";
import type { AccountBinding, AccountHealthState } from "../types";

const STATE_META: Record<
  AccountHealthState,
  { label: string; tone: string; icon: React.ReactNode; warn: boolean }
> = {
  healthy: { label: "Signed in", tone: "text-emerald-600 dark:text-emerald-400", icon: <ShieldCheck className="h-4 w-4" />, warn: false },
  unknown: { label: "Not checked yet", tone: "text-muted-foreground", icon: <ShieldQuestion className="h-4 w-4" />, warn: false },
  reauth_soon: { label: "Sign-in expiring soon", tone: "text-amber-600 dark:text-amber-400", icon: <ShieldAlert className="h-4 w-4" />, warn: true },
  reauth_required: { label: "Needs sign-in", tone: "text-red-600 dark:text-red-400", icon: <ShieldAlert className="h-4 w-4" />, warn: true },
  credentials_rejected: { label: "Sign-in was rejected", tone: "text-red-600 dark:text-red-400", icon: <ShieldAlert className="h-4 w-4" />, warn: true },
  mfa_required: { label: "Needs a verification code", tone: "text-amber-600 dark:text-amber-400", icon: <ShieldAlert className="h-4 w-4" />, warn: true },
  locked: { label: "Account locked", tone: "text-red-600 dark:text-red-400", icon: <ShieldAlert className="h-4 w-4" />, warn: true },
  revoked: { label: "Access revoked", tone: "text-red-600 dark:text-red-400", icon: <ShieldAlert className="h-4 w-4" />, warn: true },
  provider_policy_blocked: { label: "Blocked by the site", tone: "text-red-600 dark:text-red-400", icon: <ShieldAlert className="h-4 w-4" />, warn: true },
  profile_unavailable: { label: "Browser unavailable", tone: "text-muted-foreground", icon: <ShieldQuestion className="h-4 w-4" />, warn: true },
};

export function HealthWarnings({
  bindings,
  className,
}: {
  bindings: AccountBinding[];
  className?: string;
}) {
  if (bindings.length === 0) {
    return (
      <p className={cn("p-3 text-sm text-muted-foreground", className)}>
        No signed-in accounts recorded for this browser yet.
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-col divide-y divide-border rounded-md border border-border", className)}>
      {bindings.map((b) => {
        const meta = STATE_META[b.healthState];
        return (
          <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={meta.tone}>{meta.icon}</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{b.accountLabel}</div>
                <div className="truncate text-xs text-muted-foreground">{b.normalizedOrigin}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-medium", meta.tone)}>{meta.label}</span>
              {meta.warn ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`https://${b.normalizedOrigin}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open site
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
