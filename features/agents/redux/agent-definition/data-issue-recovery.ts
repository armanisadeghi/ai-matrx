import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { AgentDefinitionDataIssue } from "@/features/agents/types/agent-definition.types";

export interface AgentDataReadContext {
  agentId?: string;
  relation: string;
}

interface RecordAgentDataIssueInput {
  context: AgentDataReadContext;
  field: string;
  message: string;
  recovery: string;
  offending: unknown;
  issues: AgentDefinitionDataIssue[];
  cause?: unknown;
}

function describeCause(cause: unknown): string | null {
  if (cause instanceof Error) return cause.message;
  if (cause === undefined) return null;
  return String(cause);
}

function boundedDetails(value: unknown): string {
  try {
    return (JSON.stringify(value) ?? String(value)).slice(0, 1_000);
  } catch {
    return "[value could not be serialized for diagnostics]";
  }
}

/**
 * Record one loud, render-safe recovery. The same issue list crosses the RSC
 * boundary with the definition, while the central error sink keeps the
 * producer defect observable outside this page.
 */
export function recordAgentDataIssue({
  context,
  field,
  message,
  recovery,
  offending,
  issues,
  cause,
}: RecordAgentDataIssueInput): void {
  const causeMessage = describeCause(cause);
  const technicalMessage = causeMessage
    ? `${message}: ${causeMessage}`
    : message;
  const issue: AgentDefinitionDataIssue = {
    field,
    message: technicalMessage,
    recovery,
  };

  if (
    !issues.some(
      (existing) =>
        existing.field === issue.field && existing.message === issue.message,
    )
  ) {
    issues.push(issue);
  }

  captureError({
    source: "data-shape",
    relation: context.relation,
    message: `${technicalMessage} (agent ${context.agentId ?? "unknown"})`,
    details: boundedDetails(offending),
    raw: cause,
    userMessage: recovery,
  });

  // Server Components do not retain the browser's module-level capture store,
  // so mirror the structured finding to the server log there. In the browser,
  // captureError is already the one durable sink and a console mirror would
  // create a lower-fidelity duplicate.
  if (typeof window === "undefined") {
    console.error(
      `[agent-definition] Recovered ${field} for agent ${context.agentId ?? "unknown"}: ${technicalMessage}. ${recovery}`,
      cause,
    );
  }
}

/** Parse one stored field independently; a bad sibling can never take it down. */
export function recoverAgentDataField<T>(args: {
  context: AgentDataReadContext;
  field: string;
  raw: unknown;
  parse: () => T;
  fallback: () => T;
  recovery: string;
  issues: AgentDefinitionDataIssue[];
}): T {
  try {
    return args.parse();
  } catch (cause) {
    recordAgentDataIssue({
      context: args.context,
      field: args.field,
      message: `${args.field} failed runtime validation`,
      recovery: args.recovery,
      offending: args.raw,
      issues: args.issues,
      cause,
    });
    return args.fallback();
  }
}
