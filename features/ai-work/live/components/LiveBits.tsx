"use client";

import { AlertTriangle, BellOff, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactAge, type DeliveryLag, type LivePresence } from "../presence";

const PRESENCE_LABEL: Record<LivePresence, string> = {
  busy: "Busy",
  idle: "Idle",
  ended: "Ended",
};

export function presenceLabel(presence: LivePresence): string {
  return PRESENCE_LABEL[presence];
}

/** Slack-style presence dot; busy pulses like an activity light. */
export function PresenceDot({
  presence,
  className,
}: {
  presence: LivePresence;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={PRESENCE_LABEL[presence]}
      title={PRESENCE_LABEL[presence]}
      className={cn("relative inline-flex size-2.5 shrink-0", className)}
    >
      {presence === "busy" && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
      )}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          presence === "busy" && "bg-emerald-500",
          presence === "idle" && "bg-amber-400",
          presence === "ended" && "border border-muted-foreground/50 bg-transparent",
        )}
      />
    </span>
  );
}

export function lagText(lag: DeliveryLag): string | null {
  switch (lag.state) {
    case "offered":
      return `Offered ${compactAge(lag.sinceMs)} ago, not confirmed`;
    case "failing":
      return [
        lag.failures ? `${lag.failures} failed lookup${lag.failures === 1 ? "" : "s"}` : null,
        lag.expired ? `${lag.expired} expired` : null,
        lag.reason,
      ]
        .filter(Boolean)
        .join(" · ");
    case "muted":
      return "Muted";
    default:
      return null;
  }
}

/** The delivery-lag marker: absent when delivery is clear. */
export function LagMarker({ lag }: { lag: DeliveryLag }) {
  const text = lagText(lag);
  if (!text) return null;
  const Icon = lag.state === "failing" ? AlertTriangle : lag.state === "muted" ? BellOff : Clock;
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className={cn(
        "inline-flex shrink-0 items-center",
        lag.state === "failing" && "text-destructive",
        lag.state === "offered" && "text-amber-500",
        lag.state === "muted" && "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

const LAG_RANK: Record<DeliveryLag["state"], number> = {
  clear: 0,
  muted: 1,
  offered: 2,
  failing: 3,
};

export function worstLag(lags: readonly DeliveryLag[]): DeliveryLag {
  return lags.reduce<DeliveryLag>(
    (worst, lag) => (LAG_RANK[lag.state] > LAG_RANK[worst.state] ? lag : worst),
    { state: "clear" },
  );
}
