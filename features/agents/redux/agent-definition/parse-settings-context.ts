/**
 * Runtime ingress validation for agent settings and context-policy JSONB.
 *
 * Settings are deliberately open: model providers can add opaque parameters
 * before the frontend knows their names. The durable contract is therefore a
 * JSON object, not a closed copy of the generated LLMParams schema. Context
 * policies have a known structural contract, so every known field is checked
 * while still preserving JSON-safe extension fields allowed by Python.
 */

import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type {
  ContextObjectType,
  ContextPolicy,
  ContextPolicyPersist,
} from "@/features/agents/types/agent-api-types";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { JsonValue } from "@/types/json";

interface ParseContext {
  agentId?: string;
  relation: string;
}

function isJsonValue(
  value: unknown,
  ancestors: WeakSet<object> = new WeakSet<object>(),
): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;

  if (ancestors.has(value)) return false;
  ancestors.add(value);

  let valid: boolean;
  if (Array.isArray(value)) {
    valid = value.every((entry) => isJsonValue(entry, ancestors));
  } else {
    const prototype = Object.getPrototypeOf(value);
    valid =
      (prototype === Object.prototype || prototype === null) &&
      Object.values(value).every((entry) => isJsonValue(entry, ancestors));
  }

  ancestors.delete(value);
  return valid;
}

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  return !Array.isArray(value) && isJsonValue(value) && value !== null;
}

function isOptionalString(value: JsonValue | undefined): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalBoolean(value: JsonValue | undefined): boolean {
  return value === undefined || value === null || typeof value === "boolean";
}

function isContextObjectType(
  value: JsonValue | undefined,
): value is ContextObjectType {
  return (
    value === "text" ||
    value === "file_url" ||
    value === "json" ||
    value === "db_ref" ||
    value === "user" ||
    value === "org" ||
    value === "workspace" ||
    value === "project" ||
    value === "task" ||
    value === "variable"
  );
}

function isContextPolicyPersist(
  value: JsonValue | undefined,
): value is ContextPolicyPersist {
  return value === "auto" || value === "never" || value === "client";
}

function parsePolicySource(
  raw: JsonValue | undefined,
): Record<string, JsonValue> | null {
  if (!isJsonRecord(raw)) return null;

  const kind = raw.kind;
  if (typeof kind !== "string" || kind.length === 0) return null;
  if (!isOptionalString(raw.id)) return null;
  if (!isOptionalString(raw.field)) return null;
  if (!isOptionalString(raw.scope_type_id)) return null;
  if (!isOptionalString(raw.item_key)) return null;
  if (!isOptionalString(raw.on_missing)) return null;
  if (
    raw.extra !== undefined &&
    raw.extra !== null &&
    !isJsonRecord(raw.extra)
  ) {
    return null;
  }

  const source: Record<string, JsonValue> = { ...raw, kind };
  for (const field of [
    "id",
    "field",
    "scope_type_id",
    "item_key",
    "on_missing",
    "extra",
  ]) {
    if (source[field] === null) delete source[field];
  }
  return source;
}

function parseContextPolicy(raw: unknown): ContextPolicy | null {
  if (!isJsonRecord(raw)) return null;

  const key = raw.key;
  const type = raw.type;
  if (typeof key !== "string" || key.length === 0) return null;
  if (!isContextObjectType(type)) return null;
  if (!isOptionalString(raw.label)) return null;
  if (!isOptionalString(raw.description)) return null;
  if (!isOptionalString(raw.summary_agent_id)) return null;
  if (!isOptionalBoolean(raw.mutable)) return null;
  if (
    raw.max_inline_chars !== undefined &&
    raw.max_inline_chars !== null &&
    (typeof raw.max_inline_chars !== "number" ||
      !Number.isInteger(raw.max_inline_chars) ||
      raw.max_inline_chars < 0)
  ) {
    return null;
  }
  if (
    raw.persist !== undefined &&
    raw.persist !== null &&
    !isContextPolicyPersist(raw.persist)
  ) {
    return null;
  }

  let source: Record<string, JsonValue> | undefined;
  if (raw.source !== undefined && raw.source !== null) {
    const parsedSource = parsePolicySource(raw.source);
    if (!parsedSource) return null;
    source = parsedSource;
  }
  if (raw.persist === "auto" && !source) return null;

  const policy: Record<string, JsonValue> = { ...raw, key, type };
  for (const field of [
    "label",
    "description",
    "max_inline_chars",
    "summary_agent_id",
    "mutable",
    "persist",
    "source",
  ]) {
    if (policy[field] === null) delete policy[field];
  }
  if (source) policy.source = source;

  return { ...policy, key, type };
}

/** Parse the open, provider-extensible settings JSONB object. */
export function parseAgentSettings(
  raw: unknown,
  context: ParseContext,
): AgentDefinition["settings"] {
  if (raw === null || raw === undefined) return {};
  if (isJsonRecord(raw)) return raw;

  reportViolation(context, "settings is not a JSON object", raw);
  return {};
}

/** Parse stored context policies, excluding and reporting malformed entries. */
export function parseAgentContextPolicies(
  raw: unknown,
  context: ParseContext,
): AgentDefinition["contextPolicies"] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) {
    reportViolation(context, "context_policies is not an array", raw);
    return [];
  }

  const policies: AgentDefinition["contextPolicies"] = [];
  for (const entry of raw) {
    const policy = parseContextPolicy(entry);
    if (policy) {
      policies.push(policy);
    } else {
      reportViolation(context, "context policy entry failed validation", entry);
    }
  }
  return policies;
}

function reportViolation(
  context: ParseContext,
  message: string,
  offending: unknown,
): void {
  captureError({
    source: "data-shape",
    relation: context.relation,
    message: `${message} (agent ${context.agentId ?? "unknown"})`,
    details: JSON.stringify(offending)?.slice(0, 500),
    userMessage:
      "Part of this agent definition is malformed and was excluded. Re-save the agent to repair it.",
  });
}
