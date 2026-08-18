"use client";

/**
 * NotificationConsent — D-14 consent surface, front and centre.
 *
 * A browser that pauses for a person is worthless if the person is not told.
 * Browser notifications default ON; email / text / in-app direct message are
 * opt-ins the user ticks. Consent is asked at setup AND at first use.
 *
 * 🚨 This surface NEVER builds a channel. It only records consent for the
 * SHIPPED platform paths (per NOTIFICATIONS.md):
 *   - browser   → features/messaging notification (tab-only; best-effort)
 *   - email     → lib/email/client.ts sendEmail (Resend), users.user_email_preferences
 *   - sms       → communication SMS RPC, communication.sms_notification_preferences
 *   - in_app    → platform.assists row (primary in-app channel)
 * The producer that WRITES the notification lives server-side (WS-5 / S5 §P6).
 */

import React from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Bell, Mail, MessageSquare, Inbox } from "lucide-react";
import type { NotificationChannel, NotificationConsent as Consent } from "../types";

const ROWS: {
  key: NotificationChannel;
  label: string;
  desc: string;
  icon: React.ReactNode;
  lockedOn?: boolean;
}[] = [
  {
    key: "browser",
    label: "Browser notification",
    desc: "A pop-up while AI Matrx is open in a tab. On by default.",
    icon: <Bell className="h-4 w-4" />,
    lockedOn: false,
  },
  {
    key: "in_app",
    label: "In-app message",
    desc: "A one-click card inside AI Matrx that takes you straight to the browser.",
    icon: <Inbox className="h-4 w-4" />,
  },
  {
    key: "email",
    label: "Email",
    desc: "A message to your inbox when a browser needs you.",
    icon: <Mail className="h-4 w-4" />,
  },
  {
    key: "sms",
    label: "Text message",
    desc: "A text to your phone for the moments you're away from the screen.",
    icon: <MessageSquare className="h-4 w-4" />,
  },
];

export function NotificationConsent({
  consent,
  onChange,
  onAcknowledge,
  variant = "inline",
  className,
}: {
  consent: Consent;
  onChange: (next: Consent) => void;
  onAcknowledge?: () => void;
  /** "prompt" = the front-and-centre first-use ask; "inline" = settings row. */
  variant?: "prompt" | "inline";
  className?: string;
}) {
  const set = (key: NotificationChannel, value: boolean) =>
    onChange({ ...consent, [key]: value });

  return (
    <div className={cn("flex flex-col gap-3", variant === "prompt" && "rounded-lg border border-primary/40 bg-primary/5 p-4", className)}>
      {variant === "prompt" ? (
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
            <Bell className="h-4 w-4 text-primary" />
            How should we reach you?
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Sometimes your Cloud Browser needs a person — a verification code, a sign-in, an
            approval. Tell us how to reach you so nothing waits without you knowing.
          </p>
        </div>
      ) : null}

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {ROWS.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="mt-0.5 text-muted-foreground">{row.icon}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{row.label}</div>
                <div className="text-xs text-muted-foreground">{row.desc}</div>
              </div>
            </div>
            <Switch
              checked={consent[row.key]}
              onCheckedChange={(v) => set(row.key, v)}
              aria-label={`${row.label} notifications`}
            />
          </li>
        ))}
      </ul>

      {variant === "prompt" ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            onClick={() => {
              onAcknowledge?.();
            }}
          >
            Save and continue
          </Button>
        </div>
      ) : null}
    </div>
  );
}
