/**
 * buildCapturedErrorPayload.ts
 *
 * Adapts captured errors into the canonical agent-copy shapes
 * (`AgentPayloadInput`) consumed by `<CopyButtons>` / `buildAgentPayload`, plus
 * matching human-readable text. One captured error or the whole list.
 *
 * The agent payload carries everything needed to act: the route, the issuing
 * call-site / component, the operation, the table/function/endpoint, the full
 * raw error — AND the current visibility tier plus a ready-to-paste downgrade
 * rule. That last part closes the loop on the admin workflow: "this shouldn't
 * be an error" → Copy for AI → an agent drops the suggested rule into
 * `errorTierRules.ts` → the error goes quiet.
 */

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type {
  CapturedError,
  CapturedErrorSource,
} from "@/lib/diagnostics/errorCaptureStore";
import { tierMeta } from "@/lib/diagnostics/errorTiers";
import {
  TIER_RULES_FILE,
  buildDowngradeRuleStub,
} from "@/lib/diagnostics/errorTierRules";

const LOCATION = "AI Matrx — Error Inspector";

const SOURCE_LABELS: Record<CapturedErrorSource, string> = {
  "supabase-postgrest": "Supabase error",
  "supabase-exception": "Supabase exception",
  "runtime-exception": "Runtime exception",
  "unhandled-rejection": "Unhandled promise rejection",
  "console-error": "Console error",
  "api-http": "Backend HTTP error",
  "api-network": "Backend network error",
  "react-render": "React render error",
};

export function sourceLabel(source: CapturedErrorSource): string {
  return SOURCE_LABELS[source] ?? source;
}

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
    e.relation ?? (e.operation === "rpc" ? "rpc" : e.operation) ?? "error";
  const code = e.code ? ` [${e.code}]` : "";
  return `${what}${code}`;
}

/** The "how to make this quieter" pointer, shown to humans + agents. */
function downgradeHint(e: CapturedError): string {
  const t = tierMeta(e.tier);
  const lines = [`Tier: ${e.tier} (${t.label})`];
  if (e.tierReason) lines.push(`Tier reason: ${e.tierReason}`);
  return lines.join("\n");
}

/** Human-readable block for a single captured error. */
export function capturedErrorToHuman(e: CapturedError): string {
  const lines: string[] = [
    `${sourceLabel(e.source)}: ${e.message}`,
  ];
  if (e.relation || e.operation !== "unknown") {
    lines.push(
      `Where: ${e.operation !== "unknown" ? e.operation : ""}${
        e.relation ? `${e.operation !== "unknown" ? " " : ""}${e.relation}` : ""
      }${e.schema ? ` (schema: ${e.schema})` : ""}`.trim(),
    );
  }
  if (e.code) lines.push(`Code: ${e.code}`);
  if (typeof e.status === "number") lines.push(`HTTP status: ${e.status}`);
  if (e.details) lines.push(`Details: ${e.details}`);
  if (e.hint) lines.push(`Hint: ${e.hint}`);
  lines.push(`Route: ${e.route || "(unknown)"}`);
  lines.push(downgradeHint(e));
  if (e.count > 1) lines.push(`Occurrences: ${e.count}`);
  lines.push(`First: ${isoOrEmpty(e.firstAt)} · Last: ${isoOrEmpty(e.lastAt)}`);
  if (e.callSite) lines.push(`Call site:\n${e.callSite}`);
  if (e.stack) lines.push(`Stack:\n${e.stack}`);
  return lines.join("\n");
}

/** Agent (Copy for AI) payload for a single captured error. */
export function capturedErrorToAgentInput(e: CapturedError): AgentPayloadInput {
  const stub = buildDowngradeRuleStub(e);
  const summary = [
    capturedErrorToHuman(e),
    "",
    `To change this error's visibility tier, add a rule to ${TIER_RULES_FILE}:`,
    stub,
  ].join("\n");

  return {
    kind: "app-error",
    location: LOCATION,
    description:
      "A single captured runtime error from the running app (any source).",
    summary,
    attributes: {
      source: e.source,
      tier: e.tier,
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
      "tier-rule": e.tierRuleId,
      "downgrade-rules-file": TIER_RULES_FILE,
    },
    data: {
      source: e.source,
      tier: e.tier,
      tierRuleId: e.tierRuleId,
      tierReason: e.tierReason,
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
      downgrade: {
        rulesFile: TIER_RULES_FILE,
        suggestedRule: stub,
      },
    },
  };
}

/** Agent (Copy for AI) payload for the entire captured-error set. */
export function capturedErrorsToAgentInput(
  list: CapturedError[],
): AgentPayloadInput {
  return {
    kind: "app-errors",
    location: LOCATION,
    description:
      "Every runtime error captured in this browser session, newest first, across all sources.",
    attributes: {
      count: list.length,
      occurrences: list.reduce((sum, e) => sum + e.count, 0),
      red: list.filter((e) => e.tier === "red").length,
      orange: list.filter((e) => e.tier === "orange").length,
      yellow: list.filter((e) => e.tier === "yellow").length,
    },
    context: {
      "downgrade-rules-file": TIER_RULES_FILE,
    },
    data: list.map((e) => ({
      source: e.source,
      tier: e.tier,
      tierRuleId: e.tierRuleId,
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
  if (list.length === 0) return "No errors captured.";
  return list
    .map((e, i) => `--- [${i + 1}] ---\n${capturedErrorToHuman(e)}`)
    .join("\n\n");
}
