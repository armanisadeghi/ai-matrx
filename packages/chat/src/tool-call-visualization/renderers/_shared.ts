/**
 * Shared helpers used by multiple tool renderers.
 *
 * All helpers operate on the canonical ToolLifecycleEntry + optional
 * ToolEventPayload[] — never on the deprecated ToolCallObject shape.
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";

/** All non-empty `message` strings from the event log, in server order. */
export function collectMessages(events: ToolEventPayload[] | undefined): string[] {
    if (!events) return [];
    const out: string[] = [];
    for (const e of events) {
        if (typeof e.message === "string" && e.message.length > 0) out.push(e.message);
    }
    return out;
}

/**
 * Return tool_step events, optionally filtered by step name.
 * ToolStepData shape: { step: string, metadata?: Record<string, unknown> }
 */
export function filterStepEvents(
    events: ToolEventPayload[] | undefined,
    stepName?: string,
): Array<{ event: ToolEventPayload; step: string; metadata: Record<string, unknown> }> {
    if (!events) return [];
    const out: Array<{ event: ToolEventPayload; step: string; metadata: Record<string, unknown> }> = [];
    for (const e of events) {
        if (e.event !== "tool_step") continue;
        const data = e.data as { step?: string; metadata?: Record<string, unknown> } | undefined;
        const step = data?.step;
        if (!step) continue;
        if (stepName && step !== stepName) continue;
        out.push({ event: e, step, metadata: (data?.metadata as Record<string, unknown>) ?? {} });
    }
    return out;
}

/** Argument from the tool's input arguments (typed fetch). */
export function getArg<T = unknown>(entry: ToolLifecycleEntry, key: string): T | undefined {
    const args = entry.arguments;
    if (!args || typeof args !== "object") return undefined;
    return (args as Record<string, unknown>)[key] as T | undefined;
}

/** Parse `entry.result` as an object if possible (handles JSON strings). */
export function resultAsObject(entry: ToolLifecycleEntry): Record<string, unknown> | null {
    const r = entry.result;
    if (!r) return null;
    if (typeof r === "object" && !Array.isArray(r)) return r as Record<string, unknown>;
    if (typeof r === "string") {
        try {
            const parsed = JSON.parse(r);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            // ignore
        }
    }
    return null;
}

/** Parse `entry.result` as a string — stringifies objects for text-search use-cases. */
export function resultAsString(entry: ToolLifecycleEntry): string | null {
    const r = entry.result;
    if (r == null) return null;
    if (typeof r === "string") return r;
    try {
        return JSON.stringify(r);
    } catch {
        return null;
    }
}

/** True when the tool has finished successfully or errored. */
export function isTerminal(entry: ToolLifecycleEntry): boolean {
    return entry.status === "completed" || entry.status === "error";
}

/** True when the tool completed successfully. */
export function isSuccess(entry: ToolLifecycleEntry): boolean {
    return entry.status === "completed";
}
