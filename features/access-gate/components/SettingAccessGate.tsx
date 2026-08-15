"use client";

/**
 * SettingAccessGate — the settings variant of the existing access gate.
 * Admins see the control. Other org members see a gentle, pre-filled request
 * that lands in the same durable ledger and actionable DM system.
 */

import { useState } from "react";
import { Check, Loader2, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { settingDoorHref } from "@/features/settings/doors/settingDoorTarget";
import { createSettingAccessRequest } from "@/features/access-gate/service/accessRequests";
import type { JsonObject } from "@/types/json";

export function SettingAccessGate({
  canManage,
  organizationId,
  organizationSlugOrId,
  settingKey,
  settingLabel,
  actionKey,
  actionPayload,
  defaultMessage,
  requestReady = true,
  children,
}: {
  canManage: boolean;
  organizationId: string;
  organizationSlugOrId: string;
  settingKey: string;
  settingLabel: string;
  actionKey: string;
  actionPayload: JsonObject;
  defaultMessage: string;
  requestReady?: boolean;
  children: React.ReactNode;
}) {
  const currentUserId = useAppSelector(selectUserId);
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const message = customMessage ?? defaultMessage;

  if (canManage) return <>{children}</>;

  async function send() {
    setBusy(true);
    try {
      const result = await createSettingAccessRequest({
        organizationId,
        settingKey,
        settingLabel,
        href: settingDoorHref({
          scope: "organization",
          organizationSlugOrId,
          controlId: settingKey,
        }),
        actionKey,
        actionPayload,
        message,
        currentUserId,
      });
      setPending(true);
      if (result.already) {
        toast.success("Your request is already waiting for an admin.");
      } else if (result.delivered === 0) {
        toast.warning(
          "Your request is saved, but we couldn't message an admin just now.",
        );
      } else {
        toast.success("Request sent to your organization admins.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't send that request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background">
          {pending ? (
            <Check className="h-4 w-4 text-primary" aria-hidden />
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {pending
              ? "Your request is waiting"
              : "An organization admin controls this setting"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {pending
              ? "It is saved in Access requests, even if the direct message could not be delivered."
              : "Tell them what you need. The request is filled with this setting and includes an action they can complete inside the message."}
          </p>
        </div>
      </div>

      {!pending ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={message}
            onChange={(event) => setCustomMessage(event.target.value)}
            rows={3}
            maxLength={1000}
            aria-label="Message to organization admins"
          />
          <Button
            size="sm"
            disabled={busy || !message.trim() || !requestReady}
            onClick={() => void send()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden />
            )}
            Request this change
          </Button>
        </div>
      ) : null}
    </div>
  );
}
