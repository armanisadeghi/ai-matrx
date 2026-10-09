"use client";

import { AlertTriangle, BellOff, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactAge, type DeliveryLag, type LivePresence } from "../presence";

const PRESENCE_LABEL: Record<LivePresence, string> = {
  busy: "Busy",
  idle: "Idle",
  ended: "Ended",
};

/** What tells two similar sessions apart: platform · workspace · last seen. */
export function sessionTag(
  s: { providerLabel: string; workspace: string | null; lastSeenAt: string | null },
  nowMs: number,
): string {
  const seen = s.lastSeenAt ? compactAge(nowMs - Date.parse(s.lastSeenAt)) : null;
  return [s.providerLabel, s.workspace, seen ? `${seen} ago` : null].filter(Boolean).join(" · ");
}

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

const LAG_SHORT: Record<DeliveryLag["state"], string> = {
  clear: "",
  offered: "Unconfirmed",
  failing: "Failing",
  muted: "Muted",
};

/** The dot key, shown once under the Sessions header (dots are never color-only). */
export function PresenceLegend() {
  return (
    <div className="flex items-center gap-3 px-3 pb-1 text-[11px] text-muted-foreground" aria-hidden>
      {(["busy", "idle", "ended"] as const).map((p) => (
        <span key={p} className="inline-flex items-center gap-1">
          <PresenceDot presence={p} className="size-2" />
          {PRESENCE_LABEL[p]}
        </span>
      ))}
    </div>
  );
}

/** The delivery-lag marker: absent when delivery is clear. */
export function LagMarker({ lag, showLabel = false }: { lag: DeliveryLag; showLabel?: boolean }) {
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
      {showLabel && <span className="ml-0.5 text-[11px]">{LAG_SHORT[lag.state]}</span>}
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
