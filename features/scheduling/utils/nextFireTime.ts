// features/scheduling/utils/nextFireTime.ts
//
// Computes the next fire time for any trigger config. Used by the create
// form's live preview and to populate `next_due_at` when creating a task
// before the Python authoritative computer (aidream /scheduling/compute-
// next-due-at) is live. Once Python is live, callers should prefer the
// server's response — this is the FE shim.

import { CronExpressionParser } from "cron-parser";
import type { TriggerConfig } from "../types";

export interface NextFireResult {
  /** ISO string, or null when the trigger is event-driven (e.g. context-match). */
  nextDueAt: string | null;
  /** True when the trigger fires only on external events, not by schedule. */
  eventDriven: boolean;
}

export function computeNextFireTime(
  trigger: TriggerConfig,
  now: Date = new Date(),
): NextFireResult {
  switch (trigger.type) {
    case "one-shot":
      return { nextDueAt: new Date(trigger.at).toISOString(), eventDriven: false };

    case "interval":
    case "heartbeat": {
      const seconds = Number(trigger.every_seconds);
      if (!Number.isFinite(seconds) || seconds < 1) {
        throw new Error(`Invalid every_seconds: ${trigger.every_seconds}`);
      }
      const next = new Date(now.getTime() + seconds * 1000);
      return { nextDueAt: next.toISOString(), eventDriven: false };
    }

    case "cron": {
      const iter = CronExpressionParser.parse(trigger.expression, {
        tz: trigger.tz,
        currentDate: now,
      });
      return { nextDueAt: iter.next().toDate().toISOString(), eventDriven: false };
    }

    case "context-match":
      return { nextDueAt: null, eventDriven: true };
  }
}

/**
 * Returns the next N fire times for a cron expression in a given timezone.
 * Used by the form's preview card and by the admin cron-tester page.
 */
export function nextNCronFires(
  expression: string,
  tz: string,
  n: number,
  startFrom: Date = new Date(),
): string[] {
  const iter = CronExpressionParser.parse(expression, {
    tz,
    currentDate: startFrom,
  });
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(iter.next().toDate().toISOString());
  }
  return out;
}

/**
 * Validates a cron expression + tz combo. Returns null on success or an
 * error message on failure. Doesn't throw — callers render the message.
 */
export function validateCron(expression: string, tz: string): string | null {
  if (!expression || !expression.trim()) {
    return "Expression is empty";
  }
  if (expression.length > 200) {
    return "Expression too long (max 200 chars)";
  }
  try {
    CronExpressionParser.parse(expression, { tz });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid cron expression";
  }
}
