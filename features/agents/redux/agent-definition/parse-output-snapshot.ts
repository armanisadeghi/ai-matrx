/**
 * Runtime ingress for agent output schemas and immutable version snapshots.
 *
 * Supabase correctly exposes JSON columns as `unknown`. This module validates
 * those values before they enter the typed agent-definition model; it never
 * asserts that a generated RPC row or JSON object already has a domain shape.
 */

import type {
  AgentDefinition,
  AgentVersionSnapshot,
  ModelTier,
  ModelTiers,
} from "@/features/agents/types/agent-definition.types";
import type { MatrxDirectivesConfig } from "@/features/agents/types/matrx-directives.types";
import type { SkillConfig } from "@/features/skills/types";
import { parseUiGates } from "@/lib/redux/slices/agent-settings/ui-gates";
import { parseCustomTools } from "./parse-custom-tools";
import {
  parseAgentMessages,
  parseAgentVariableDefinitions,
} from "./parse-messages-variables";
import {
  parseAgentContextPolicies,
  parseAgentSettings,
} from "./parse-settings-context";

const OUTPUT_SCHEMA_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

const JSON_SCHEMA_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null",
]);

const JSON_SCHEMA_STRING_FORMATS = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "uuid",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function fail(path: string, expected: string): never {
  throw new TypeError(`[agent-version-snapshot] ${path} must be ${expected}`);
}

function requiredField(
  record: Record<string, unknown>,
  key: string,
): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    fail(key, "present in the RPC row");
  }
  return record[key];
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = requiredField(record, key);
  if (typeof value !== "string") fail(key, "a string");
  return value;
}

function requiredNumber(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = requiredField(record, key);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(key, "a finite number");
  }
  return value;
}

function requiredBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean {
  const value = requiredField(record, key);
  if (typeof value !== "boolean") fail(key, "a boolean");
  return value;
}

function requiredStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] {
  const value = requiredField(record, key);
  if (!isStringArray(value)) fail(key, "an array of strings");
  return value;
}

function validateOptionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): void {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    fail(`${path}.${key}`, "a string");
  }
}

function validateOptionalNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
): void {
  const value = record[key];
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    fail(`${path}.${key}`, "a finite number");
  }
}

type SchemaNode = AgentDefinition["outputSchema"] extends infer Envelope | null
  ? Envelope extends { schema: infer Schema }
    ? Schema
    : never
  : never;
type SchemaDefinition = SchemaNode | boolean;

function parseSchemaDefinition(value: unknown, path: string): SchemaDefinition {
  if (typeof value === "boolean") return value;
  return parseSchemaNode(value, path);
}

function parseSchemaNode(value: unknown, path: string): SchemaNode {
  if (!isRecord(value)) fail(path, "a JSON Schema object");

  const type = value.type;
  if (type !== undefined) {
    const valid =
      (typeof type === "string" && JSON_SCHEMA_TYPES.has(type)) ||
      (Array.isArray(type) &&
        type.every(
          (entry) =>
            typeof entry === "string" && JSON_SCHEMA_TYPES.has(entry),
        ));
    if (!valid) fail(`${path}.type`, "a valid JSON Schema type or type array");
  }

  validateOptionalString(value, "description", path);
  validateOptionalString(value, "pattern", path);
  validateOptionalString(value, "$ref", path);

  if (
    value.format !== undefined &&
    (typeof value.format !== "string" ||
      !JSON_SCHEMA_STRING_FORMATS.has(value.format))
  ) {
    fail(`${path}.format`, "a supported JSON Schema string format");
  }

  for (const key of [
    "multipleOf",
    "maximum",
    "exclusiveMaximum",
    "minimum",
    "exclusiveMinimum",
    "minItems",
    "maxItems",
  ]) {
    validateOptionalNumber(value, key, path);
  }

  if (value.enum !== undefined && !Array.isArray(value.enum)) {
    fail(`${path}.enum`, "an array");
  }
  if (value.required !== undefined && !isStringArray(value.required)) {
    fail(`${path}.required`, "an array of strings");
  }

  const parsed: SchemaNode = {};
  Object.assign(parsed, value);

  if (value.items !== undefined) {
    parsed.items = Array.isArray(value.items)
      ? value.items.map((item, index) =>
          parseSchemaDefinition(item, `${path}.items[${index}]`),
        )
      : parseSchemaDefinition(value.items, `${path}.items`);
  }

  if (value.properties !== undefined) {
    if (!isRecord(value.properties)) {
      fail(`${path}.properties`, "an object of JSON Schemas");
    }
    const properties: Record<string, SchemaDefinition> = {};
    for (const [key, child] of Object.entries(value.properties)) {
      properties[key] = parseSchemaDefinition(
        child,
        `${path}.properties.${key}`,
      );
    }
    parsed.properties = properties;
  }

  if (value.additionalProperties !== undefined) {
    parsed.additionalProperties = parseSchemaDefinition(
      value.additionalProperties,
      `${path}.additionalProperties`,
    );
  }

  if (value.anyOf !== undefined) {
    if (!Array.isArray(value.anyOf)) fail(`${path}.anyOf`, "an array");
    parsed.anyOf = value.anyOf.map((child, index) =>
      parseSchemaDefinition(child, `${path}.anyOf[${index}]`),
    );
  }

  if (value.$defs !== undefined) {
    if (!isRecord(value.$defs)) {
      fail(`${path}.$defs`, "an object of JSON Schemas");
    }
    const definitions: Record<string, SchemaDefinition> = {};
    for (const [key, child] of Object.entries(value.$defs)) {
      definitions[key] = parseSchemaDefinition(child, `${path}.$defs.${key}`);
    }
    parsed.$defs = definitions;
  }

  return parsed;
}

/** Parse the nullable `agent.definition.output_schema` JSON envelope. */
export function parseAgentOutputSchema(
  raw: unknown,
): AgentDefinition["outputSchema"] {
  if (raw === null) return null;
  if (!isRecord(raw)) fail("output_schema", "null or an object");
  if (typeof raw.name !== "string" || !OUTPUT_SCHEMA_NAME.test(raw.name)) {
    fail(
      "output_schema.name",
      "1-64 letters, numbers, underscores, or dashes",
    );
  }
  if (raw.description !== undefined && typeof raw.description !== "string") {
    fail("output_schema.description", "a string");
  }
  if (raw.strict !== undefined && typeof raw.strict !== "boolean") {
    fail("output_schema.strict", "a boolean");
  }

  const schema = parseSchemaNode(raw.schema, "output_schema.schema");
  const parsed: NonNullable<AgentDefinition["outputSchema"]> = {
    name: raw.name,
    schema,
  };
  Object.assign(parsed, raw);
  parsed.name = raw.name;
  parsed.schema = schema;
  return parsed;
}

function parseModelTiers(raw: unknown): ModelTiers | null {
  if (raw === null) return null;
  if (!isRecord(raw) || typeof raw.default !== "string") {
    fail("model_tiers", "null or an object with a string default");
  }

  const parsed: ModelTiers = { default: raw.default };
  if (raw.flexible !== undefined) {
    if (typeof raw.flexible !== "boolean") {
      fail("model_tiers.flexible", "a boolean");
    }
    parsed.flexible = raw.flexible;
  }
  if (raw.tiers !== undefined) {
    if (!isRecord(raw.tiers)) fail("model_tiers.tiers", "an object");
    const tiers: Record<string, ModelTier> = {};
    for (const [key, value] of Object.entries(raw.tiers)) {
      if (!isRecord(value) || typeof value.modelId !== "string") {
        fail(`model_tiers.tiers.${key}.modelId`, "a string");
      }
      if (value.label !== undefined && typeof value.label !== "string") {
        fail(`model_tiers.tiers.${key}.label`, "a string");
      }
      const tier: ModelTier = { modelId: value.modelId };
      if (value.label !== undefined) tier.label = value.label;
      tiers[key] = tier;
    }
    parsed.tiers = tiers;
  }
  return parsed;
}

function parseNullableRecord(
  raw: unknown,
  path: string,
): Record<string, unknown> | null {
  if (raw === null) return null;
  if (!isRecord(raw)) fail(path, "null or an object");
  return raw;
}

function parseSkillConfig(raw: unknown): SkillConfig | null {
  if (raw === null) return null;
  if (!isRecord(raw)) fail("skill_config", "null or an object");
  if (!isStringArray(raw.included)) {
    fail("skill_config.included", "an array of strings");
  }
  if (!isStringArray(raw.listed)) {
    fail("skill_config.listed", "an array of strings");
  }
  if (!isStringArray(raw.forbidden)) {
    fail("skill_config.forbidden", "an array of strings");
  }
  if (typeof raw.disabled !== "boolean") {
    fail("skill_config.disabled", "a boolean");
  }
  return {
    included: raw.included,
    listed: raw.listed,
    forbidden: raw.forbidden,
    disabled: raw.disabled,
  };
}

function parseMatrxDirectives(raw: unknown): MatrxDirectivesConfig {
  if (!isRecord(raw)) fail("matrx_actions", "an object");
  if (raw.actions !== undefined && !isStringArray(raw.actions)) {
    fail("matrx_actions.actions", "an array of strings");
  }
  if (
    raw.apply_policy !== undefined &&
    raw.apply_policy !== "auto" &&
    raw.apply_policy !== "ask" &&
    raw.apply_policy !== "off"
  ) {
    fail('matrx_actions.apply_policy', '"auto", "ask", or "off"');
  }
  if (raw.auto_apply !== undefined && typeof raw.auto_apply !== "boolean") {
    fail("matrx_actions.auto_apply", "a boolean");
  }
  if (raw.allow !== undefined && !isStringArray(raw.allow)) {
    fail("matrx_actions.allow", "an array of strings");
  }
  if (raw.directive !== undefined && typeof raw.directive !== "string") {
    fail("matrx_actions.directive", "a string");
  }
  const parsed: MatrxDirectivesConfig = {};
  Object.assign(parsed, raw);
  return parsed;
}

/**
 * Parse one generated `agx_get_version_snapshot` row. Every scalar is checked
 * against the generated RPC contract and every JSON field crosses a runtime
 * parser before the domain object is returned.
 */
export function parseAgentVersionSnapshot(raw: unknown): AgentVersionSnapshot {
  if (!isRecord(raw)) fail("RPC row", "an object");

  const versionId = requiredString(raw, "version_id");
  const parseContext = {
    agentId: versionId,
    relation: "agx_get_version_snapshot",
  };

  return {
    version_id: versionId,
    version_number: requiredNumber(raw, "version_number"),
    agent_type: requiredString(raw, "agent_type"),
    name: requiredString(raw, "name"),
    description: requiredString(raw, "description"),
    messages: parseAgentMessages(requiredField(raw, "messages")),
    variable_definitions: parseAgentVariableDefinitions(
      requiredField(raw, "variable_definitions"),
    ),
    model_id: requiredString(raw, "model_id"),
    model_tiers: parseModelTiers(requiredField(raw, "model_tiers")),
    settings: parseAgentSettings(requiredField(raw, "settings"), parseContext),
    output_schema: parseAgentOutputSchema(
      requiredField(raw, "output_schema"),
    ),
    tools: requiredStringArray(raw, "tools"),
    custom_tools: parseCustomTools(requiredField(raw, "custom_tools"), parseContext),
    context_policies: parseAgentContextPolicies(
      requiredField(raw, "context_policies"),
      parseContext,
    ),
    auto_context_disabled: requiredBoolean(raw, "auto_context_disabled"),
    category: requiredString(raw, "category"),
    tags: requiredStringArray(raw, "tags"),
    is_active: requiredBoolean(raw, "is_active"),
    changed_at: requiredString(raw, "changed_at"),
    change_note: requiredString(raw, "change_note"),
    mcp_servers: requiredStringArray(raw, "mcp_servers"),
    tool_config: parseNullableRecord(
      requiredField(raw, "tool_config"),
      "tool_config",
    ),
    skill_config: parseSkillConfig(requiredField(raw, "skill_config")),
    matrx_actions: parseMatrxDirectives(requiredField(raw, "matrx_actions")),
    ui_gates: parseUiGates(requiredField(raw, "ui_gates")),
    default_rag_boost: requiredNumber(raw, "default_rag_boost"),
    rag_awareness_mode: requiredString(raw, "rag_awareness_mode"),
    input_kind: requiredString(raw, "input_kind"),
  };
}
