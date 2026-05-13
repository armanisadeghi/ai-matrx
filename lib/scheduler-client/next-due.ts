// lib/scheduler-client/next-due.ts
//
// TS twin of packages/matrx-scheduler/matrx_scheduler/next_due.py.
// Computes the next fire time for a trigger config so callers can:
//   - render a "next run" preview in the create-task form
//   - populate sch_trigger.next_due_at after a recurring fire (until
//     the Python authoritative endpoint /scheduling/compute-next-due-at
//     is live)
//
// The Python implementation is the source of truth; this module
// intentionally mirrors its branching. If the two diverge, the Python
// version wins (the scanner runs server-side and writes the canonical
// value).
//
// FE callers (CronForm preview, /administration/scheduling/cron-tester)
// import directly from here. Web write paths go through the aidream
// /scheduler/* HTTP router (features/scheduling/service/schedulerClient.ts)
// which auto-computes next_due_at server-side.

import { CronExpressionParser } from "cron-parser";

import type { TriggerType } from "./types";

// ── Trigger config shapes ──────────────────────────────────────────────────
//
// These mirror the discriminated union in features/scheduling/types.ts.
// Only triggers with a scheduled next-fire time are listed here; event-driven
// triggers (event, manual, dependency, context-match) fall through to the
// default "null" branch in computeNextDueAt.

export interface OneShotTriggerConfig {
    type: "one-shot";
    /** ISO-8601 timestamp. The trigger fires once at this instant. */
    at: string;
}

export interface IntervalTriggerConfig {
    type: "interval";
    every_seconds: number;
}

export interface HeartbeatTriggerConfig {
    type: "heartbeat";
    every_seconds: number;
}

export interface CronTriggerConfig {
    type: "cron";
    expression: string;
    /** IANA timezone name (e.g. 'America/Los_Angeles', 'UTC'). */
    tz: string;
}

export interface ContextMatchTriggerConfig {
    type: "context-match";
    kind?: string;
    url_pattern?: string;
    hostname?: string;
}

export type ScheduledTriggerConfig =
    | OneShotTriggerConfig
    | IntervalTriggerConfig
    | HeartbeatTriggerConfig
    | CronTriggerConfig
    | ContextMatchTriggerConfig;

// ── Result ─────────────────────────────────────────────────────────────────

export interface NextFireResult {
    /** ISO string, or null when the trigger is event-driven. */
    nextDueAt: string | null;
    /** True when the trigger fires only on external events, not by schedule. */
    eventDriven: boolean;
}

// ── computeNextDueAt — the canonical entry point ──────────────────────────

/**
 * Returns the next time this trigger should fire, as an ISO-8601 UTC
 * string, or null when the trigger is event-driven.
 *
 * Mirrors the branching in packages/matrx-scheduler/matrx_scheduler/next_due.py.
 *
 * Throws on malformed configs (invalid cron, non-numeric every_seconds,
 * unparseable `at`) — callers in form-validation paths should wrap
 * the call in try/catch and surface the message.
 */
export function computeNextDueAt(
    trigger: ScheduledTriggerConfig,
    now: Date = new Date(),
): NextFireResult {
    switch (trigger.type) {
        case "one-shot": {
            const parsed = new Date(trigger.at);
            if (Number.isNaN(parsed.getTime())) {
                throw new Error(`Invalid one-shot 'at' value: ${trigger.at}`);
            }
            return { nextDueAt: parsed.toISOString(), eventDriven: false };
        }
        case "interval":
        case "heartbeat": {
            const seconds = Number(trigger.every_seconds);
            if (!Number.isFinite(seconds) || seconds < 1) {
                throw new Error(
                    `Invalid every_seconds: ${trigger.every_seconds}`,
                );
            }
            const next = new Date(now.getTime() + seconds * 1000);
            return { nextDueAt: next.toISOString(), eventDriven: false };
        }
        case "cron": {
            const iter = CronExpressionParser.parse(trigger.expression, {
                tz: trigger.tz,
                currentDate: now,
            });
            return {
                nextDueAt: iter.next().toDate().toISOString(),
                eventDriven: false,
            };
        }
        case "context-match":
            return { nextDueAt: null, eventDriven: true };
    }
}

/**
 * Returns the next N fire times for a cron expression in a given
 * timezone. Used by the form preview card and the admin cron-tester.
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
 * Validates a cron expression + tz combo. Returns null on success or
 * an error message on failure. Doesn't throw — UIs render the message
 * inline.
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

/**
 * Convenience: returns true when the trigger type fires only on
 * external events (event-driven) and has no scheduled next-fire time.
 * Mirrors the boolean Python's next_due returns null for.
 */
export function isEventDrivenTrigger(type: TriggerType): boolean {
    return (
        type === "event" ||
        type === "manual" ||
        type === "dependency" ||
        type === "context-match"
    );
}
