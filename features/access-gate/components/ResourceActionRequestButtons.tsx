"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleSlash,
  ExternalLink,
  Flag,
  KeyRound,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  decideAccessRequest,
  getResourceActionRequestForDecision,
  reportAccessRequest,
} from "@/features/access-gate/service/accessRequests";
import { getResourceActionRequestAction } from "@/features/messaging/actions/resourceActionRequestRegistry";
import type { AccessRequestStatus } from "@/features/access-gate/types";

export function ResourceActionRequestButtons({
  requestId,
  actionKey,
  href,
  itemName,
  isOwn = false,
  compact = false,
  onDone,
}: {
  requestId: string;
  actionKey: string;
  href?: string | null;
  itemName: string;
  isOwn?: boolean;
  compact?: boolean;
  onDone?: (status: AccessRequestStatus) => void;
}) {
  const currentUserId = useAppSelector(selectUserId);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<AccessRequestStatus | null>(null);
  const action = getResourceActionRequestAction(actionKey);
  const safeHref =
    href?.startsWith("/") && !href.startsWith("//") ? href : null;
  const size = compact ? "h-7 px-2 text-[11px]" : "h-11 sm:h-8";

  if (isOwn) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-primary-foreground/80">
        <Trash2 className="h-3 w-3" aria-hidden />
        Deletion requested
      </span>
    );
  }
  if (done) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground">
        <Check className="h-3 w-3" aria-hidden />
        {done === "granted"
          ? "Completed"
          : done === "reported"
            ? "Reported"
            : "Declined"}
      </span>
    );
  }

  async function completeAction() {
    if (!action) {
      toast.error("This request uses an action the app does not recognize.");
      return;
    }
    const ok = await confirm({
      title: action.confirmTitle(itemName),
      description: action.confirmDescription,
      confirmLabel: action.label,
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const request = await getResourceActionRequestForDecision(requestId);
      const durableAction = getResourceActionRequestAction(
        request.resourceAction.actionKey,
      );
      if (!durableAction) {
        throw new Error(
          "This request uses an action the app does not recognize.",
        );
      }
      await durableAction.execute({
        resourceType: request.resourceType,
        resourceId: request.resourceId,
      });
      const result = await decideAccessRequest({
        requestId,
        decision: "complete",
        currentUserId,
      });
      setDone(result.status);
      onDone?.(result.status);
      toast.success(durableAction.completedLabel);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't complete that action.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function grantFullAccess() {
    setBusy(true);
    try {
      const result = await decideAccessRequest({
        requestId,
        decision: "grant",
        level: "admin",
        currentUserId,
      });
      setDone(result.status);
      onDone?.(result.status);
      toast.success("Full access granted.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't grant access.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    try {
      const result = await decideAccessRequest({
        requestId,
        decision: "decline",
        currentUserId,
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

  async function report() {
    const ok = await confirm({
      title: "Report this request?",
      description:
        "This ends the conversation for good. They won't be able to ask about this item again.",
      confirmLabel: "Report",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await reportAccessRequest(requestId);
      setDone("reported");
      onDone?.("reported");
      toast.success("Request reported.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't report that.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {action ? (
        <Button
          className={size}
          size="sm"
          disabled={busy}
          onClick={() => void completeAction()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          )}
          {action.label}
        </Button>
      ) : null}
      <Button
        className={size}
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void grantFullAccess()}
      >
        <KeyRound className="h-3.5 w-3.5" aria-hidden />
        Give full access
      </Button>
      {safeHref ? (
        <Button asChild className={size} size="sm" variant="outline">
          <Link href={safeHref}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open item
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
      <Button
        className={size}
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => void report()}
      >
        <Flag className="h-3.5 w-3.5" aria-hidden />
        Report
      </Button>
    </div>
  );
}
