"use client";

/**
 * AccountSettings — consent toggles for a Cloud Browser (WS-8 scope).
 *
 * Unattended login, session-health checks, and TOTP delegation are user consent
 * (D-13/D-15: enrolled per human, audited). "Sensitive actions require a human"
 * is an always-on floor — it can never be turned off, and it says so.
 */

import React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/utils/cn";
import { Lock } from "lucide-react";
import type { CloudBrowserConsent } from "../types";

const ROWS: {
  key: keyof CloudBrowserConsent;
  label: string;
  desc: string;
  locked?: boolean;
}[] = [
  {
    key: "unattendedLogin",
    label: "Sign in for me while I'm away",
    desc: "Let the agent complete a saved sign-in without waiting for you. You are never required to log in yourself.",
  },
  {
    key: "sessionHealthChecks",
    label: "Keep my sessions alive",
    desc: "Quietly check that accounts are still signed in and warn you before one expires.",
  },
  {
    key: "totpDelegation",
    label: "Let Matrx enter my verification codes",
    desc: "For accounts you've enrolled, the Matrx authenticator can enter the six-digit code so the agent doesn't have to stop for you. Enrolled per account, audited, and revocable.",
  },
  {
    key: "sensitiveActionsRequireHuman",
    label: "Always stop for me on sensitive actions",
    desc: "Payments, security settings, and destructive changes always pause for a person. This can't be turned off.",
    locked: true,
  },
];

export function AccountSettings({
  consent,
  onChange,
  className,
}: {
  consent: CloudBrowserConsent;
  onChange: (next: CloudBrowserConsent) => void;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col divide-y divide-border rounded-md border border-border", className)}>
      {ROWS.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              {row.label}
              {row.locked ? <Lock className="h-3 w-3 text-muted-foreground" aria-label="Always on" /> : null}
            </div>
            <div className="text-xs text-muted-foreground">{row.desc}</div>
          </div>
          <Switch
            checked={consent[row.key]}
            disabled={row.locked}
            onCheckedChange={(v) => onChange({ ...consent, [row.key]: v })}
            aria-label={row.label}
          />
        </li>
      ))}
    </ul>
  );
}
