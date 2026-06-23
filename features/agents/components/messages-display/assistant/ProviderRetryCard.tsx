"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleStop,
  Clock3,
  Loader2,
  RefreshCw,
  RotateCw,
  ServerCrash,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProviderRetryPayload } from "@/types/python-generated/stream-events";
import { cn } from "@/lib/utils";

interface ProviderRetryCardProps {
  retry: ProviderRetryPayload;
  busyAction: "cancel" | "retry_now" | null;
  onCancel: () => void;
  onRetryNow: () => void;
}

function retryAtMs(retryAt: number | null | undefined): number | null {
  if (retryAt == null) return null;
  return retryAt > 1_000_000_000_000 ? retryAt : retryAt * 1000;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function providerName(provider: string): string {
  if (!provider) return "The AI provider";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function statusCopy(retry: ProviderRetryPayload): {
  title: string;
  body: string;
  tone: "waiting" | "active" | "done" | "stopped";
} {
  const provider = providerName(retry.provider);
  if (retry.state === "retrying_now") {
    return {
      title: `${provider} is trying again`,
      body: "We are retrying the request now. No action is needed.",
      tone: "active",
    };
  }
  if (retry.state === "recovered") {
    return {
      title: `${provider} recovered`,
      body: "The provider accepted a retry and the response is continuing.",
      tone: "done",
    };
  }
  if (retry.state === "cancelled") {
    return {
      title: "Retry cancelled",
      body: "This run was cancelled by request.",
      tone: "stopped",
    };
  }
  if (retry.state === "suspended") {
    return {
      title: `${provider} is still busy`,
      body: "We used the automatic retry window and paused this run. This is provider capacity, not your prompt.",
      tone: "stopped",
    };
  }
  return {
    title: `${provider} is busy`,
    body:
      retry.user_message ||
      "The provider is temporarily overloaded. We are waiting and retrying automatically.",
    tone: "waiting",
  };
}

export function ProviderRetryCard({
  retry,
  busyAction,
  onCancel,
  onRetryNow,
}: ProviderRetryCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const retryTime = retryAtMs(retry.retry_at);
  const countdownMs = retryTime == null ? null : retryTime - now;
  const scheduled = retry.state === "scheduled";
  const canRetryNow =
    scheduled && retry.can_retry_now === true && !!retry.actions?.retry_now;
  const canCancel =
    scheduled && retry.can_cancel === true && !!retry.actions?.cancel;
  const copy = statusCopy(retry);
  const nextAttempt = retry.next_attempt ?? retry.failed_attempt + 1;
  const attemptText =
    retry.max_retries > 0
      ? `Retry ${Math.min(nextAttempt, retry.max_retries)} of ${retry.max_retries}`
      : `Retry ${nextAttempt}`;

  useEffect(() => {
    if (!scheduled || retryTime == null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [scheduled, retryTime]);

  const Icon =
    copy.tone === "active"
      ? Loader2
      : copy.tone === "done"
        ? CheckCircle2
        : copy.tone === "stopped"
          ? XCircle
          : ServerCrash;

  return (
    <div
      className={cn(
        "my-2 max-w-2xl rounded-md border px-3 py-2.5 text-sm shadow-sm",
        copy.tone === "done"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
          : copy.tone === "stopped"
            ? "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100"
            : "border-sky-500/30 bg-sky-500/10 text-sky-950 dark:text-sky-100",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            copy.tone === "active" && "animate-spin",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{copy.title}</span>
            <span className="inline-flex items-center gap-1 rounded border border-current/15 px-1.5 py-0.5 text-[11px] text-current/75">
              <RefreshCw className="h-3 w-3" />
              {attemptText}
            </span>
            {scheduled && countdownMs != null && (
              <span className="inline-flex items-center gap-1 rounded border border-current/15 px-1.5 py-0.5 text-[11px] text-current/75">
                <Clock3 className="h-3 w-3" />
                {formatCountdown(countdownMs)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-current/75">
            {copy.body}
          </p>
          {(canRetryNow || canCancel) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {canRetryNow && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busyAction !== null}
                  onClick={onRetryNow}
                  className="h-7"
                >
                  {busyAction === "retry_now" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="h-3.5 w-3.5" />
                  )}
                  Retry now
                </Button>
              )}
              {canCancel && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={onCancel}
                  className="h-7 bg-transparent"
                >
                  {busyAction === "cancel" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CircleStop className="h-3.5 w-3.5" />
                  )}
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
