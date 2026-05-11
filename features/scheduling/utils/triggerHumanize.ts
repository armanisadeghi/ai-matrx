// features/scheduling/utils/triggerHumanize.ts
//
// Renders a trigger config as a short human-readable phrase, for chip labels
// in the list view and the trigger card on the detail view.

import cronstrue from "cronstrue";
import { format, formatDistanceToNowStrict } from "date-fns";
import type {
  ContextMatchConfig,
  CronConfig,
  HeartbeatConfig,
  IntervalConfig,
  OneShotConfig,
  TriggerType,
} from "../types";

const UNIT_LABEL: { threshold: number; singular: string; plural: string }[] = [
  { threshold: 86400, singular: "day", plural: "days" },
  { threshold: 3600, singular: "hour", plural: "hours" },
  { threshold: 60, singular: "minute", plural: "minutes" },
  { threshold: 1, singular: "second", plural: "seconds" },
];

function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 1) {
    return `${totalSeconds} seconds`;
  }
  for (const unit of UNIT_LABEL) {
    if (totalSeconds >= unit.threshold && totalSeconds % unit.threshold === 0) {
      const count = totalSeconds / unit.threshold;
      return `${count} ${count === 1 ? unit.singular : unit.plural}`;
    }
  }
  return `${totalSeconds} seconds`;
}

export function humanizeTrigger(
  type: TriggerType,
  config: Record<string, unknown>,
): string {
  switch (type) {
    case "one-shot": {
      const c = config as Partial<OneShotConfig>;
      if (!c.at) return "Once";
      try {
        return `Once at ${format(new Date(c.at), "MMM d, yyyy 'at' h:mm a")}`;
      } catch {
        return "Once";
      }
    }

    case "interval": {
      const c = config as Partial<IntervalConfig>;
      return c.every_seconds
        ? `Every ${formatSeconds(c.every_seconds)}`
        : "Interval";
    }

    case "heartbeat": {
      const c = config as Partial<HeartbeatConfig>;
      return c.every_seconds
        ? `Heartbeat every ${formatSeconds(c.every_seconds)}`
        : "Heartbeat";
    }

    case "cron": {
      const c = config as Partial<CronConfig>;
      if (!c.expression) return "Cron";
      try {
        const phrase = cronstrue.toString(c.expression, { verbose: false });
        return c.tz ? `${phrase} (${shortTz(c.tz)})` : phrase;
      } catch {
        return `Cron: ${c.expression}`;
      }
    }

    case "context-match": {
      const c = config as Partial<ContextMatchConfig>;
      const parts: string[] = [];
      if (c.kind) parts.push(c.kind);
      if (c.hostname) parts.push(`on ${c.hostname}`);
      if (c.url_pattern && !c.hostname) parts.push(`matching ${c.url_pattern}`);
      return parts.length ? `When ${parts.join(" ")}` : "On page match";
    }

    case "event":
      return "On event";
    case "manual":
      return "Manual only";
    case "dependency":
      return "On dependency";
  }
}

function shortTz(tz: string): string {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

/**
 * "in 3 minutes" / "2 hours ago"
 */
export function humanizeRelative(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}
