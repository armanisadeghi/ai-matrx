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

import {
  buildAgentPayload,
  type AgentPayloadInput,
} from "@/components/agent-copy/buildAgentPayload";
import type {
  CapturedError,
  CapturedErrorSource,
} from "@/lib/diagnostics/errorCaptureStore";
import { tierMeta } from "@/lib/diagnostics/errorTiers";
import {
  TIER_RULES_FILE,
  buildDowngradeRuleStub,
} from "@/lib/diagnostics/errorTierRules";
import {
  sanitizeMessageForAi,
  sanitizeRawForAi,
  sanitizeStackTextForAi,
} from "@/lib/diagnostics/sanitizeErrorContextForAi";

const LOCATION = "AI Matrx — Error Inspector";

const ERROR_INVESTIGATION_PROMPT = `The following error evidence was captured from the running AI Matrx application. Use it as the starting point for a complete, evidence-based root cause analysis and, only when warranted, a durable fix.

Follow every applicable repository instruction. Do not assume the inspector's surface message is the root cause, especially when it says "unknown error." Trace the actual execution path in the code, logs, persisted records, request or conversation identifiers, configuration, and service boundaries that are available to you.

Your investigation must:
1. Reconstruct what happened, in order, from the initiating action through the final captured error, including retries, rollback, cancellation, cleanup, and user-facing handling.
2. Identify the direct technical root cause and explain why it happened.
3. Identify every system, boundary, and process involved, and distinguish the original failure from secondary or duplicate symptoms.
4. Determine which safeguards should have prevented, detected, classified, preserved, explained, recovered from, or contained the failure, and why each relevant safeguard did not.
5. Assess the entire class of similar failures, not only this occurrence. Prefer the simplest shared correction at the real choke point over a route-specific or message-specific patch.

Before making any change, decide whether the captured condition is truly a defect. If it is expected and correct behavior—for example, an intentional guard, a valid user mistake, a normal cancellation, or a transient condition already handled as designed—make no code changes. Report the evidence for that conclusion and explain why the current behavior is correct.

If it is a real defect, implement the complete, durable correction at every layer the evidence shows is warranted. Do not merely silence or downgrade the error, swallow an exception, add a blind retry, change wording, or special-case this one payload. Preserve useful structured diagnostics and make unknown failures more specific at their source. Add or update focused regression coverage and the feature documentation required by the repository, then verify both the original scenario and the broader failure class.

Conclude with: the root cause; the failure sequence; the systems and failed safeguards involved; the changes made at each justified layer; and the verification evidence.`;

const MULTI_LAYER_REMINDER = `Important: by the time an error or warning reaches this inspector, the incident is rarely only one failure. The originating operation may have failed, and one or more validation, classification, retry, recovery, rollback, observability, or presentation layers may also have failed to prevent it or make it actionable. Inspect all of them and repair every layer supported by evidence—but do not invent failures, broaden scope without evidence, or change code when the reported behavior is actually correct.`;

/** Wraps a faithful Error Inspector payload in an implementation-ready brief. */
function buildErrorInvestigationPrompt(payload: AgentPayloadInput): string {
  return `${ERROR_INVESTIGATION_PROMPT}\n\n<captured-error-evidence>\n${buildAgentPayload(payload)}\n</captured-error-evidence>\n\n${MULTI_LAYER_REMINDER}`;
}

const SOURCE_LABELS: Record<CapturedErrorSource, string> = {
  "supabase-postgrest": "Supabase error",
  "supabase-exception": "Supabase exception",
  "runtime-exception": "Runtime exception",
  "unhandled-rejection": "Unhandled promise rejection",
  "console-error": "Console error",
  "api-http": "Backend HTTP error",
  "api-network": "Backend network error",
  "react-render": "React render error",
  "agent-stream-error": "Server stream error",
  "agent-stream-warning": "Server stream warning",
  "agent-stream-tool-error": "Tool error",
  "agent-stream-provider-retry": "Provider retry failure",
  "agent-stream-record-failed": "Record ended in failed status",
  "agent-stream-data-error": "Server data error",
  "agent-stream-transport": "Stream transport error",
  "agent-stream-client-error": "Stream connection failure",
  "agent-stream-terminal-guard":
    "Stream held open after terminal (closed locally)",
  "media-durability": "Media durability violation",
  "reasoning-leak": "Reasoning leaked into answer text",
  "data-shape": "Data-shape contract violation",
  "org-resolution": "Org resolution fallback",
  "user-toast": "User-facing error toast",
  "marketing-crawler": "Marketing crawler",
  "redux-rejected": "Rejected action (thunk)",
  "content-ir": "Content IR parse/parity failure",
  "surface-writeback": "Surface writeback contract break",
  "markdown-delimiters": "Runaway delimiter in rendered markdown",
  assists: "Assist chip action failure",
  "layout-scroll-chain": "Content clipped — scroll chain broken",
  "agent-json-result": "Agent run produced no usable structured result",
  "unsaved-work": "Unsaved user work at risk",
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
  const lines: string[] = [`${sourceLabel(e.source)}: ${e.message}`];
  if (e.relation || e.operation !== "unknown") {
    lines.push(
      `Where: ${e.operation !== "unknown" ? e.operation : ""}${
        e.relation ? `${e.operation !== "unknown" ? " " : ""}${e.relation}` : ""
      }${e.schema ? ` (schema: ${e.schema})` : ""}`.trim(),
    );
  }
  if (e.code) lines.push(`Code: ${e.code}`);
  if (typeof e.status === "number") lines.push(`HTTP status: ${e.status}`);
  if (e.userMessage) lines.push(`User message: ${e.userMessage}`);
  if (e.details) lines.push(`Details: ${e.details}`);
  if (e.hint) lines.push(`Hint: ${e.hint}`);
  if (e.requestId) lines.push(`Request id: ${e.requestId}`);
  if (e.conversationId) lines.push(`Conversation id: ${e.conversationId}`);
  lines.push(`Route: ${e.route || "(unknown)"}`);
  lines.push(downgradeHint(e));
  if (e.count > 1) lines.push(`Occurrences: ${e.count}`);
  lines.push(`First: ${isoOrEmpty(e.firstAt)} · Last: ${isoOrEmpty(e.lastAt)}`);
  if (e.callSite) lines.push(`Call site:\n${e.callSite}`);
  if (e.stack) lines.push(`Stack:\n${e.stack}`);
  return lines.join("\n");
}

function capturedErrorToAgentHuman(e: CapturedError): string {
  const lines: string[] = [
    `${sourceLabel(e.source)}: ${sanitizeMessageForAi(e.message)}`,
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
  if (e.userMessage) lines.push(`User message: ${e.userMessage}`);
  if (e.details) lines.push(`Details: ${e.details}`);
  if (e.hint) lines.push(`Hint: ${e.hint}`);
  if (e.requestId) lines.push(`Request id: ${e.requestId}`);
  if (e.conversationId) lines.push(`Conversation id: ${e.conversationId}`);
  lines.push(`Route: ${e.route || "(unknown)"}`);
  lines.push(downgradeHint(e));
  if (e.count > 1) lines.push(`Occurrences: ${e.count}`);
  lines.push(`First: ${isoOrEmpty(e.firstAt)} · Last: ${isoOrEmpty(e.lastAt)}`);
  const callSite = sanitizeStackTextForAi(e.callSite);
  const stack = sanitizeStackTextForAi(e.stack);
  if (callSite) lines.push(`Call site:\n${callSite}`);
  if (stack) lines.push(`Stack:\n${stack}`);
  return lines.join("\n");
}

/** Agent (Copy for AI) payload for a single captured error. */
export function capturedErrorToAgentInput(e: CapturedError): AgentPayloadInput {
  const stub = buildDowngradeRuleStub(e);
  const summary = [
    capturedErrorToAgentHuman(e),
    "",
    `To change this error's visibility tier, add a rule to ${TIER_RULES_FILE}:`,
    stub,
  ].join("\n");

  const callSite = sanitizeStackTextForAi(e.callSite);
  const stack = sanitizeStackTextForAi(e.stack);

  return {
    kind: "app-error",
    location: LOCATION,
    description:
      "A single captured runtime error from the running app (any source). Stack traces omit minified Next.js chunk frames; use the plain Copy button for the full dump.",
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
      "request-id": e.requestId,
      "conversation-id": e.conversationId,
      "first-seen": isoOrEmpty(e.firstAt),
      "last-seen": isoOrEmpty(e.lastAt),
      "call-site": callSite,
      "tier-rule": e.tierRuleId,
      "downgrade-rules-file": TIER_RULES_FILE,
      "stacks-sanitized": "minified-chunk-frames-removed",
    },
    data: {
      source: e.source,
      tier: e.tier,
      tierRuleId: e.tierRuleId,
      tierReason: e.tierReason,
      message: sanitizeMessageForAi(e.message),
      userMessage: e.userMessage,
      code: e.code,
      details: e.details,
      hint: e.hint,
      status: e.status,
      requestId: e.requestId,
      conversationId: e.conversationId,
      operation: e.operation,
      schema: e.schema,
      relation: e.relation,
      route: e.route,
      url: e.url,
      callSite,
      stack,
      raw: sanitizeRawForAi(e.raw),
      downgrade: {
        rulesFile: TIER_RULES_FILE,
        suggestedRule: stub,
      },
    },
  };
}

/** Ready-to-paste investigation prompt for one captured error. */
export function capturedErrorToInvestigationPrompt(e: CapturedError): string {
  return buildErrorInvestigationPrompt(capturedErrorToAgentInput(e));
}

/** Agent (Copy for AI) payload for the entire captured-error set. */
export function capturedErrorsToAgentInput(
  list: CapturedError[],
): AgentPayloadInput {
  return {
    kind: "app-errors",
    location: LOCATION,
    description:
      "Every runtime error captured in this browser session, newest first, across all sources. Stack traces omit minified Next.js chunk frames; use the plain Copy button for the full dump.",
    attributes: {
      count: list.length,
      occurrences: list.reduce((sum, e) => sum + e.count, 0),
      red: list.filter((e) => e.tier === "red").length,
      orange: list.filter((e) => e.tier === "orange").length,
      yellow: list.filter((e) => e.tier === "yellow").length,
    },
    context: {
      "downgrade-rules-file": TIER_RULES_FILE,
      "stacks-sanitized": "minified-chunk-frames-removed",
    },
    data: list.map((e) => ({
      source: e.source,
      tier: e.tier,
      tierRuleId: e.tierRuleId,
      operation: e.operation,
      schema: e.schema,
      relation: e.relation,
      code: e.code,
      message: sanitizeMessageForAi(e.message),
      userMessage: e.userMessage,
      details: e.details,
      hint: e.hint,
      status: e.status,
      requestId: e.requestId,
      conversationId: e.conversationId,
      route: e.route,
      url: e.url,
      callSite: sanitizeStackTextForAi(e.callSite),
      stack: sanitizeStackTextForAi(e.stack),
      occurrences: e.count,
      firstSeen: isoOrEmpty(e.firstAt),
      lastSeen: isoOrEmpty(e.lastAt),
      raw: sanitizeRawForAi(e.raw),
    })),
  };
}

/** Ready-to-paste investigation prompt for the complete captured error set. */
export function capturedErrorsToInvestigationPrompt(
  list: CapturedError[],
): string {
  return buildErrorInvestigationPrompt(capturedErrorsToAgentInput(list));
}

/** Human-readable block for the entire captured-error set. */
export function capturedErrorsToHuman(list: CapturedError[]): string {
  if (list.length === 0) return "No errors captured.";
  return list
    .map((e, i) => `--- [${i + 1}] ---\n${capturedErrorToHuman(e)}`)
    .join("\n\n");
}
