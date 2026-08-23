"use client";

/**
 * NotificationConsent — D-14 consent surface, front and centre.
 *
 * A browser that pauses for a person is worthless if the person is not told.
 * Consent is asked at setup AND at first use.
 *
 * 🚨 This surface NEVER builds a channel and NEVER stores a preference of its
 * own. It renders the SHIPPED platform paths and writes them where they
 * actually live (`../notificationPreferences.ts` /
 * `useHandoffNotificationPreferences`):
 *   - in-app  → `platform.assists` — ALWAYS ON, not a preference (§2)
 *   - browser → `users.user_preferences.messaging.showDesktopNotifications`
 *   - email   → `users.user_email_preferences.browser_handoff_notifications`
 *   - sms     → `communication.sms_notification_preferences.system_alerts`
 * The producer that WRITES the notification lives server-side (aidream
 * `services/cloud_browser/notify.py`) and reads those same three stores.
 */

import React from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Bell, Mail, MessageSquare, Inbox, Check } from "lucide-react";
import type { NotificationChannel, NotificationConsent as Consent } from "../types";

const ROWS: {
  key: NotificationChannel;
  label: string;
  desc: string;
  icon: React.ReactNode;
  /** Always on and not a choice — rendered as a stated fact, never a switch. */
  alwaysOn?: boolean;
}[] = [
  {
    key: "in_app",
    label: "In AI Matrx",
    // Explained, not offered — §2. A switch here would promise a choice the
    // server does not honour.
    desc: "A one-click card that takes you straight to the browser. Always on — it is how the app shows you what is waiting.",
    icon: <Inbox className="h-4 w-4" />,
    alwaysOn: true,
  },
  {
    key: "browser",
    label: "Browser notification",
    desc: "A pop-up while AI Matrx is open in a tab.",
    icon: <Bell className="h-4 w-4" />,
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
  smsEnrolled = true,
  error,
  variant = "inline",
  className,
}: {
  consent: Consent;
  onChange: (channel: NotificationChannel, enabled: boolean) => void;
  onAcknowledge?: () => void;
  /** False disables the text switch and says why, instead of failing on save. */
  smsEnrolled?: boolean;
  error?: string | null;
  /** "prompt" = the front-and-centre first-use ask; "inline" = settings row. */
  variant?: "prompt" | "inline";
  className?: string;
}) {
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
        {ROWS.map((row) => {
          const blocked = row.key === "sms" && !smsEnrolled;
          return (
            <li key={row.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 text-muted-foreground">{row.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{row.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {blocked
                      ? "Verify a mobile number in Settings → Text messages to turn this on."
                      : row.desc}
                  </div>
                </div>
              </div>
              {row.alwaysOn ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Check className="h-3.5 w-3.5" />
                  Always
                </span>
              ) : (
                <Switch
                  checked={consent[row.key] === true}
                  disabled={blocked}
                  onCheckedChange={(v) => onChange(row.key, v)}
                  aria-label={`${row.label} notifications`}
                />
              )}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

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
