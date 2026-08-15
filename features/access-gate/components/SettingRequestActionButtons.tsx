"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleSlash,
  ExternalLink,
  Loader2,
  Settings,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  decideSettingAccessRequest,
  getSettingAccessRequestForDecision,
} from "@/features/access-gate/service/accessRequests";
import { getSettingRequestAction } from "@/features/messaging/actions/settingRequestActionRegistry";
import type { AccessRequestStatus } from "@/features/access-gate/types";

export function SettingRequestActionButtons({
  requestId,
  href,
  actionKey,
  isOwn = false,
  compact = false,
  onDone,
}: {
  requestId: string;
  href: string;
  actionKey: string;
  isOwn?: boolean;
  compact?: boolean;
  onDone?: (status: AccessRequestStatus) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<AccessRequestStatus | null>(null);
  const action = getSettingRequestAction(actionKey);
  const safeHref = href.startsWith("/") && !href.startsWith("//") ? href : null;

  if (isOwn) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-primary-foreground/80">
        <Settings className="h-3 w-3" aria-hidden />
        Setting change requested
      </span>
    );
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground">
        <Check className="h-3 w-3" aria-hidden />
        {done === "granted" ? "Change completed" : "Declined"}
      </span>
    );
  }

  async function apply() {
    if (!action) {
      toast.error("This request uses an action the app does not recognize.");
      return;
    }
    setBusy(true);
    try {
      const request = await getSettingAccessRequestForDecision(requestId);
      const durableAction = getSettingRequestAction(
        request.settingRequest.actionKey,
      );
      if (!durableAction) {
        throw new Error(
          "This request uses an action the app does not recognize.",
        );
      }
      await durableAction.execute(request.settingRequest.actionPayload, {
        organizationId: request.resourceId,
      });
      const result = await decideSettingAccessRequest({
        requestId,
        decision: "complete",
      });
      setDone(result.status);
      onDone?.(result.status);
      toast.success(durableAction.completedLabel);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't make that change.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    try {
      const result = await decideSettingAccessRequest({
        requestId,
        decision: "decline",
      });
      setDone(result.status);
      onDone?.(result.status);
      toast.success("Request declined.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't decline that.",
      );
    } finally {
      setBusy(false);
    }
  }

  const size = compact ? "h-7 px-2 text-[11px]" : "h-11 sm:h-8";
  return (
    <div className="flex flex-wrap gap-2">
      {action ? (
        <Button
          className={size}
          size="sm"
          disabled={busy}
          onClick={() => void apply()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
          {action.label}
        </Button>
      ) : null}
      {safeHref ? (
        <Button asChild className={size} size="sm" variant="outline">
          <Link href={safeHref}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open setting
          </Link>
        </Button>
      ) : null}
      <Button
        className={size}
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => void decline()}
      >
        <CircleSlash className="h-3.5 w-3.5" aria-hidden />
        Decline
      </Button>
    </div>
  );
}
