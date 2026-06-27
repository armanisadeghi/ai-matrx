/**
 * buildCapturedErrorPayload.ts
 *
 * Adapts captured errors into the canonical agent-copy shapes
 * (`AgentPayloadInput`) consumed by `<CopyButtons>` / `buildAgentPayload`, plus
 * matching human-readable text. One captured error or the whole list. The XML
 * envelope names the route, the issuing call-site (component), the operation,
 * the table/function, and the full raw PostgREST fields — everything an AI
 * agent needs to locate and fix the failure.
 */

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type { CapturedError } from "@/lib/diagnostics/errorCaptureStore";

const LOCATION = "AI Matrx Admin — Supabase Error Inspector";

function isoOrEmpty(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

/** A short label for a single error — used in lists, toasts, headers. */
export function capturedErrorLabel(e: CapturedError): string {
  const what =
    e.relation ?? (e.operation === "rpc" ? "rpc" : e.operation) ?? "query";
  const code = e.code ? ` [${e.code}]` : "";
  return `${what}${code}`;
}

/** Human-readable block for a single captured error. */
export function capturedErrorToHuman(e: CapturedError): string {
  const lines: string[] = [
    `Supabase ${e.source === "supabase-exception" ? "exception" : "error"}: ${e.message}`,
    `Operation: ${e.operation}${e.relation ? ` on ${e.relation}` : ""}${
      e.schema ? ` (schema: ${e.schema})` : ""
    }`,
  ];
  if (e.code) lines.push(`Code: ${e.code}`);
  if (typeof e.status === "number") lines.push(`HTTP status: ${e.status}`);
  if (e.details) lines.push(`Details: ${e.details}`);
  if (e.hint) lines.push(`Hint: ${e.hint}`);
  lines.push(`Route: ${e.route || "(unknown)"}`);
  if (e.count > 1) lines.push(`Occurrences: ${e.count}`);
  lines.push(`First: ${isoOrEmpty(e.firstAt)} · Last: ${isoOrEmpty(e.lastAt)}`);
  if (e.callSite) lines.push(`Call site:\n${e.callSite}`);
  if (e.stack && e.source === "supabase-exception") {
    lines.push(`Stack:\n${e.stack}`);
  }
  return lines.join("\n");
}

/** Agent (Copy for AI) payload for a single captured error. */
export function capturedErrorToAgentInput(e: CapturedError): AgentPayloadInput {
  return {
    kind: "supabase-error",
    location: LOCATION,
    description:
      "A single captured Supabase/PostgREST error from the running app.",
    summary: capturedErrorToHuman(e),
    attributes: {
      source: e.source,
      operation: e.operation,
      relation: e.relation,
      schema: e.schema,
      code: e.code,
      status: e.status,
      occurrences: e.count,
    },
    context: {
      "origin-route": e.route,
      "origin-url": e.url,
      "first-seen": isoOrEmpty(e.firstAt),
      "last-seen": isoOrEmpty(e.lastAt),
      "call-site": e.callSite,
    },
    data: {
      message: e.message,
      code: e.code,
      details: e.details,
      hint: e.hint,
      status: e.status,
      operation: e.operation,
      schema: e.schema,
      relation: e.relation,
      route: e.route,
      url: e.url,
      callSite: e.callSite,
      stack: e.stack,
      raw: e.raw,
    },
  };
}

/** Agent (Copy for AI) payload for the entire captured-error set. */
export function capturedErrorsToAgentInput(
  list: CapturedError[],
): AgentPayloadInput {
  return {
    kind: "supabase-errors",
    location: LOCATION,
    description:
      "Every Supabase/PostgREST error captured in this browser session, newest first.",
    attributes: {
      count: list.length,
      occurrences: list.reduce((sum, e) => sum + e.count, 0),
    },
    data: list.map((e) => ({
      source: e.source,
      operation: e.operation,
      schema: e.schema,
      relation: e.relation,
      code: e.code,
      message: e.message,
      details: e.details,
      hint: e.hint,
      status: e.status,
      route: e.route,
      url: e.url,
      callSite: e.callSite,
      stack: e.stack,
      occurrences: e.count,
      firstSeen: isoOrEmpty(e.firstAt),
      lastSeen: isoOrEmpty(e.lastAt),
      raw: e.raw,
    })),
  };
}

/** Human-readable block for the entire captured-error set. */
export function capturedErrorsToHuman(list: CapturedError[]): string {
  if (list.length === 0) return "No Supabase errors captured.";
  return list
    .map((e, i) => `--- [${i + 1}] ---\n${capturedErrorToHuman(e)}`)
    .join("\n\n");
}
