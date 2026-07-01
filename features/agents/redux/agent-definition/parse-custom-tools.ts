/**
 * Ingress validation for `custom_tools` (agent.definition / agent.template /
 * agent.definition_version JSONB, and the inline specs inside `tool_config`).
 *
 * The wire contract is the generated OpenAPI `CustomTool` schema
 * (types/python-generated/api-types.ts) — Python rejects anything else with a
 * 422 at execution time. Json → typed happens HERE, through validation, never
 * through assertion (type-safety skill). Non-conforming entries are excluded
 * and reported loudly via the Error Inspector (`data-shape` source): an
 * exclusion firing means a write path produced a bad shape — find and fix it.
 */

import type {
  CustomToolDefinition,
  CustomToolInputSchema,
  JsonSchemaProperty,
} from "@/features/agents/types/agent-api-types";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

const PROPERTY_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
  "null",
] as const;

type PropertyType = (typeof PROPERTY_TYPES)[number];

export function isJsonSchemaPropertyType(v: unknown): v is PropertyType {
  return (
    typeof v === "string" && (PROPERTY_TYPES as readonly string[]).includes(v)
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `type` may be a single literal, an array of literals, null, or absent. */
function isValidPropertyTypeField(t: unknown): boolean {
  if (t === undefined || t === null) return true;
  if (isJsonSchemaPropertyType(t)) return true;
  return Array.isArray(t) && t.every(isJsonSchemaPropertyType);
}

export function isJsonSchemaProperty(v: unknown): v is JsonSchemaProperty {
  if (!isRecord(v)) return false;
  if (!isValidPropertyTypeField(v.type)) return false;
  if (
    v.description !== undefined &&
    v.description !== null &&
    typeof v.description !== "string"
  ) {
    return false;
  }
  if (v.enum !== undefined && v.enum !== null && !Array.isArray(v.enum)) {
    return false;
  }
  if (v.items !== undefined && v.items !== null && !isJsonSchemaProperty(v.items)) {
    return false;
  }
  if (v.properties !== undefined && v.properties !== null) {
    if (!isRecord(v.properties)) return false;
    if (!Object.values(v.properties).every(isJsonSchemaProperty)) return false;
  }
  if (v.required !== undefined && v.required !== null) {
    if (!Array.isArray(v.required)) return false;
    if (!v.required.every((r) => typeof r === "string")) return false;
  }
  return true;
}

function parseInputSchema(v: unknown): CustomToolInputSchema | null {
  if (!isRecord(v)) return null;
  // `type` is a Pydantic constant defaulting to "object"; anything else is a
  // malformed schema the backend would reject.
  if (v.type !== undefined && v.type !== "object") return null;
  const schema: CustomToolInputSchema = { type: "object" };
  if (v.properties !== undefined) {
    if (!isRecord(v.properties)) return null;
    const properties: Record<string, JsonSchemaProperty> = {};
    for (const [key, prop] of Object.entries(v.properties)) {
      if (!isJsonSchemaProperty(prop)) return null;
      properties[key] = prop;
    }
    schema.properties = properties;
  }
  if (v.required !== undefined) {
    if (
      !Array.isArray(v.required) ||
      !v.required.every((r): r is string => typeof r === "string")
    ) {
      return null;
    }
    schema.required = v.required;
  }
  return schema;
}

/** Validate a single stored tool entry. Returns null when non-conforming. */
export function parseCustomTool(v: unknown): CustomToolDefinition | null {
  if (!isRecord(v)) return null;
  if (typeof v.name !== "string" || v.name.length === 0) return null;
  if (v.description !== undefined && typeof v.description !== "string") {
    return null;
  }
  const tool: CustomToolDefinition = {
    name: v.name,
    // Required on the wire; Pydantic default is "".
    description: typeof v.description === "string" ? v.description : "",
  };
  if (v.input_schema !== undefined && v.input_schema !== null) {
    const schema = parseInputSchema(v.input_schema);
    if (!schema) return null;
    tool.input_schema = schema;
  }
  return tool;
}

/**
 * Validate a stored `custom_tools` value. Conforming entries pass through;
 * non-conforming entries are EXCLUDED and reported (never silently coerced,
 * never passed on to hit Python as a 422 later).
 */
export function parseCustomTools(
  raw: unknown,
  context: { agentId?: string; relation: string },
): CustomToolDefinition[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) {
    reportViolation(context, "custom_tools is not an array", raw);
    return [];
  }
  const tools: CustomToolDefinition[] = [];
  for (const entry of raw) {
    const tool = parseCustomTool(entry);
    if (tool) {
      tools.push(tool);
    } else {
      reportViolation(context, "custom tool entry failed validation", entry);
    }
  }
  return tools;
}

function reportViolation(
  context: { agentId?: string; relation: string },
  message: string,
  offending: unknown,
): void {
  captureError({
    source: "data-shape",
    relation: context.relation,
    message: `${message} (agent ${context.agentId ?? "unknown"})`,
    details: JSON.stringify(offending)?.slice(0, 500),
    userMessage:
      "A custom tool on this agent is malformed and was skipped. Re-save the tool to repair it.",
  });
}
