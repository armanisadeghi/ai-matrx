"use client";

/**
 * AccountSettings — consent toggles for a Cloud Browser (WS-8 scope).
 *
 * Unattended login, session-health checks, and code entry are user consent
 * (D-13/D-15: enrolled per human, audited) and all three start ON (Arman,
 * 2026-09-18: signed-in sites stay signed in and the platform logs back in on
 * its own wherever a person is not truly required). The copy says so, so
 * nobody has to guess which way a switch already leans. "Sensitive actions
 * require a human" is an always-on floor — it can never be turned off, and it
 * says so too.
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
    desc: "On by default: the agent completes a saved sign-in itself instead of waiting for you, until you turn this off.",
  },
  {
    key: "sessionHealthChecks",
    label: "Keep my sessions alive",
    desc: "On by default: we quietly check that your accounts are still signed in and warn you before one expires, until you turn this off.",
  },
  {
    key: "totpDelegation",
    label: "Let Matrx enter my verification codes",
    desc: "On by default for accounts you have enrolled: the Matrx authenticator enters the six-digit code so the agent never stops for you, and you can turn it off or unenrol an account at any time.",
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
