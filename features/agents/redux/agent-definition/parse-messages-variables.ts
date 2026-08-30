/**
 * Runtime validation for authored agent messages and variable definitions read
 * from JSONB. Known fields follow the generated aidream schemas while
 * Pydantic `extra="allow"` fields are preserved verbatim after validation.
 */

import {
  VARIABLE_COMPONENT_TYPES,
  type AgentDefinition,
  type StructuredListBinding,
  type VariableAssignmentConfig,
  type VariableComponentType,
  type VariableCustomComponent,
  type VariableDefinition,
  type VariableResourceContextConfig,
  type VariableResourcePromotion,
} from "@/features/agents/types/agent-definition.types";
import type { components } from "@/types/python-generated/api-types";
import { isMessagePart } from "@/types/python-generated/stream-events";

type DefinitionMessage = AgentDefinition["messages"][number];
type DefinitionMessagePart = DefinitionMessage["content"][number];

type GeneratedVariableDefinition =
  components["schemas"]["AgentVariableDefinition"];
type GeneratedVariableComponent =
  components["schemas"]["VariableComponentSpec"];
type GeneratedContextItemBinding = components["schemas"]["ContextItemBinding"];
type GeneratedPicklistBinding = components["schemas"]["PicklistBinding"];
type GeneratedVariableAssignment =
  components["schemas"]["VariableAssignmentSpec"];

type VariableDefinitionKnownKey = keyof Pick<
  GeneratedVariableDefinition,
  | "name"
  | "defaultValue"
  | "helpText"
  | "required"
  | "customComponent"
  | "binding"
>;
type VariableComponentKnownKey =
  | keyof Pick<
      GeneratedVariableComponent,
      | "type"
      | "options"
      | "allowOther"
      | "toggleValues"
      | "min"
      | "max"
      | "step"
      | "structured_list"
      | "picklist"
      | "assignment"
    >
  | "resource_context"
  | "stash";
type ContextItemBindingKnownKey = keyof Pick<
  GeneratedContextItemBinding,
  "contextItemId" | "scopeTypeId" | "itemKey" | "onMissing"
>;
type PicklistBindingKnownKey = keyof Pick<
  GeneratedPicklistBinding,
  "listId" | "groupName" | "multiple"
>;
type VariableAssignmentKnownKey = keyof Pick<
  GeneratedVariableAssignment,
  "random"
>;

const VARIABLE_DEFINITION_KNOWN_KEYS: readonly VariableDefinitionKnownKey[] = [
  "name",
  "defaultValue",
  "helpText",
  "required",
  "customComponent",
  "binding",
];

const VARIABLE_COMPONENT_KNOWN_KEYS: readonly VariableComponentKnownKey[] = [
  "type",
  "options",
  "allowOther",
  "toggleValues",
  "min",
  "max",
  "step",
  "structured_list",
  "picklist",
  "assignment",
  "resource_context",
  "stash",
];

const CONTEXT_ITEM_BINDING_KNOWN_KEYS: readonly ContextItemBindingKnownKey[] = [
  "contextItemId",
  "scopeTypeId",
  "itemKey",
  "onMissing",
];

const PICKLIST_BINDING_KNOWN_KEYS: readonly PicklistBindingKnownKey[] = [
  "listId",
  "groupName",
  "multiple",
];

const VARIABLE_ASSIGNMENT_KNOWN_KEYS: readonly VariableAssignmentKnownKey[] = [
  "random",
];

const STASH_KNOWN_KEYS = [
  "options",
  "allowOther",
  "toggleValues",
  "min",
  "max",
  "step",
] as const;

const RESOURCE_CONTEXT_KNOWN_KEYS = ["promote", "exclude"] as const;
const RESOURCE_PROMOTION_KNOWN_KEYS = ["representation", "max_chars"] as const;
const MESSAGE_KNOWN_KEYS = ["role", "content"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVariableComponentType(
  value: unknown,
): value is VariableComponentType {
  return (
    typeof value === "string" &&
    VARIABLE_COMPONENT_TYPES.some((type) => type === value)
  );
}

function fail(path: string, expectation: string): never {
  throw new TypeError(`[agent-definition] ${path} ${expectation}`);
}

function copyOpaqueKeys(
  target: object,
  raw: Record<string, unknown>,
  knownKeys: readonly string[],
): void {
  for (const [key, value] of Object.entries(raw)) {
    if (!knownKeys.includes(key)) {
      Object.assign(target, { [key]: value });
    }
  }
}

function parseOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") fail(path, "must be a string or null");
  return value;
}

function parseOptionalBoolean(
  value: unknown,
  path: string,
): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") fail(path, "must be a boolean or null");
  return value;
}

function parseOptionalNumber(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be a finite number or null");
  }
  return value;
}

function parseOptionalStringArray(
  value: unknown,
  path: string,
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    fail(path, "must be an array of strings or null");
  }
  return value;
}

function parseOptionalToggleValues(
  value: unknown,
  path: string,
): [string, string] | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "string" ||
    typeof value[1] !== "string"
  ) {
    fail(path, "must contain exactly two string labels or be null");
  }
  return [value[0], value[1]];
}

function parseStructuredListBinding(
  value: unknown,
  path: string,
): StructuredListBinding | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || typeof value.listId !== "string") {
    fail(path, "must be an object with a string listId");
  }

  const parsed: StructuredListBinding = { listId: value.listId };
  const groupName = parseOptionalString(value.groupName, `${path}.groupName`);
  const multiple = parseOptionalBoolean(value.multiple, `${path}.multiple`);
  if (groupName !== undefined) parsed.groupName = groupName;
  if (multiple !== undefined) parsed.multiple = multiple;
  copyOpaqueKeys(parsed, value, PICKLIST_BINDING_KNOWN_KEYS);
  return parsed;
}

function parseVariableAssignment(
  value: unknown,
  path: string,
): VariableAssignmentConfig | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) fail(path, "must be an object or null");

  const parsed: VariableAssignmentConfig = {};
  const random = parseOptionalBoolean(value.random, `${path}.random`);
  if (random !== undefined) parsed.random = random;
  copyOpaqueKeys(parsed, value, VARIABLE_ASSIGNMENT_KNOWN_KEYS);
  return parsed;
}

function parseResourcePromotion(
  value: unknown,
  path: string,
): VariableResourcePromotion {
  if (!isRecord(value) || typeof value.representation !== "string") {
    fail(path, "must be an object with a string representation");
  }

  const parsed: VariableResourcePromotion = {
    representation: value.representation,
  };
  const maxChars = parseOptionalNumber(value.max_chars, `${path}.max_chars`);
  if (maxChars !== undefined) parsed.max_chars = maxChars;
  copyOpaqueKeys(parsed, value, RESOURCE_PROMOTION_KNOWN_KEYS);
  return parsed;
}

function parseResourceContext(
  value: unknown,
  path: string,
): VariableResourceContextConfig | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) fail(path, "must be an object or null");

  const parsed: VariableResourceContextConfig = {};
  if (value.promote !== undefined && value.promote !== null) {
    if (!Array.isArray(value.promote)) {
      fail(`${path}.promote`, "must be an array or null");
    }
    parsed.promote = value.promote.map((item, index) =>
      parseResourcePromotion(item, `${path}.promote[${index}]`),
    );
  }
  const exclude = parseOptionalStringArray(value.exclude, `${path}.exclude`);
  if (exclude !== undefined) parsed.exclude = exclude;
  copyOpaqueKeys(parsed, value, RESOURCE_CONTEXT_KNOWN_KEYS);
  return parsed;
}

function parseComponentStash(
  value: unknown,
  path: string,
): NonNullable<VariableCustomComponent["stash"]> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) fail(path, "must be an object or null");

  const parsed: NonNullable<VariableCustomComponent["stash"]> = {};
  const options = parseOptionalStringArray(value.options, `${path}.options`);
  const allowOther = parseOptionalBoolean(
    value.allowOther,
    `${path}.allowOther`,
  );
  const toggleValues = parseOptionalToggleValues(
    value.toggleValues,
    `${path}.toggleValues`,
  );
  const min = parseOptionalNumber(value.min, `${path}.min`);
  const max = parseOptionalNumber(value.max, `${path}.max`);
  const step = parseOptionalNumber(value.step, `${path}.step`);
  if (options !== undefined) parsed.options = options;
  if (allowOther !== undefined) parsed.allowOther = allowOther;
  if (toggleValues !== undefined) parsed.toggleValues = toggleValues;
  if (min !== undefined) parsed.min = min;
  if (max !== undefined) parsed.max = max;
  if (step !== undefined) parsed.step = step;
  copyOpaqueKeys(parsed, value, STASH_KNOWN_KEYS);
  return parsed;
}

function parseVariableCustomComponent(
  value: unknown,
  path: string,
): VariableCustomComponent | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) fail(path, "must be an object or null");
  if (!isVariableComponentType(value.type)) {
    fail(path, "must have a supported string type");
  }

  const parsed: VariableCustomComponent = { type: value.type };
  const options = parseOptionalStringArray(value.options, `${path}.options`);
  const allowOther = parseOptionalBoolean(
    value.allowOther,
    `${path}.allowOther`,
  );
  const toggleValues = parseOptionalToggleValues(
    value.toggleValues,
    `${path}.toggleValues`,
  );
  const min = parseOptionalNumber(value.min, `${path}.min`);
  const max = parseOptionalNumber(value.max, `${path}.max`);
  const step = parseOptionalNumber(value.step, `${path}.step`);
  const structuredList = parseStructuredListBinding(
    value.structured_list,
    `${path}.structured_list`,
  );
  const picklist = parseStructuredListBinding(
    value.picklist,
    `${path}.picklist`,
  );
  const assignment = parseVariableAssignment(
    value.assignment,
    `${path}.assignment`,
  );
  const resourceContext = parseResourceContext(
    value.resource_context,
    `${path}.resource_context`,
  );
  const stash = parseComponentStash(value.stash, `${path}.stash`);

  if (options !== undefined) parsed.options = options;
  if (allowOther !== undefined) parsed.allowOther = allowOther;
  if (toggleValues !== undefined) parsed.toggleValues = toggleValues;
  if (min !== undefined) parsed.min = min;
  if (max !== undefined) parsed.max = max;
  if (step !== undefined) parsed.step = step;
  if (structuredList !== undefined) parsed.structured_list = structuredList;
  if (picklist !== undefined) parsed.picklist = picklist;
  if (assignment !== undefined) parsed.assignment = assignment;
  if (resourceContext !== undefined) parsed.resource_context = resourceContext;
  if (stash !== undefined) parsed.stash = stash;
  copyOpaqueKeys(parsed, value, VARIABLE_COMPONENT_KNOWN_KEYS);
  return parsed;
}

function parseContextItemBinding(
  value: unknown,
  path: string,
): VariableDefinition["binding"] {
  if (value === undefined || value === null) return undefined;
  if (
    !isRecord(value) ||
    typeof value.contextItemId !== "string" ||
    typeof value.scopeTypeId !== "string" ||
    typeof value.itemKey !== "string"
  ) {
    fail(
      path,
      "must contain string contextItemId, scopeTypeId, and itemKey fields",
    );
  }
  if (
    value.onMissing !== undefined &&
    value.onMissing !== null &&
    value.onMissing !== "empty" &&
    value.onMissing !== "skip" &&
    value.onMissing !== "error"
  ) {
    fail(`${path}.onMissing`, 'must be "empty", "skip", "error", or null');
  }

  const parsed: NonNullable<VariableDefinition["binding"]> = {
    contextItemId: value.contextItemId,
    scopeTypeId: value.scopeTypeId,
    itemKey: value.itemKey,
  };
  if (value.onMissing !== undefined && value.onMissing !== null) {
    parsed.onMissing = value.onMissing;
  }
  copyOpaqueKeys(parsed, value, CONTEXT_ITEM_BINDING_KNOWN_KEYS);
  return parsed;
}

function parseVariableDefinition(
  value: unknown,
  index: number,
): VariableDefinition {
  const path = `variable_definitions[${index}]`;
  if (!isRecord(value) || typeof value.name !== "string") {
    fail(path, "must be an object with a string name");
  }

  const parsed: VariableDefinition = {
    name: value.name,
    defaultValue: value.defaultValue === undefined ? null : value.defaultValue,
  };
  const helpText = parseOptionalString(value.helpText, `${path}.helpText`);
  const required = parseOptionalBoolean(value.required, `${path}.required`);
  const customComponent = parseVariableCustomComponent(
    value.customComponent,
    `${path}.customComponent`,
  );
  const binding = parseContextItemBinding(value.binding, `${path}.binding`);
  if (helpText !== undefined) parsed.helpText = helpText;
  if (required !== undefined) parsed.required = required;
  if (customComponent !== undefined) parsed.customComponent = customComponent;
  if (binding !== undefined) parsed.binding = binding;
  copyOpaqueKeys(parsed, value, VARIABLE_DEFINITION_KNOWN_KEYS);
  return parsed;
}

function isDefinitionMessageRole(
  value: unknown,
): value is DefinitionMessage["role"] {
  return value === "system" || value === "user" || value === "assistant";
}

function isDefinitionMessagePart(
  value: unknown,
): value is DefinitionMessagePart {
  if (!isMessagePart(value)) return false;
  return (
    value.type === "text" ||
    (value.type === "media" &&
      (value.kind === "image" ||
        value.kind === "audio" ||
        value.kind === "video" ||
        value.kind === "youtube" ||
        value.kind === "document"))
  );
}

/** Parse authored agent messages from an agent-definition JSONB field. */
export function parseAgentMessages(raw: unknown): AgentDefinition["messages"] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) fail("messages", "must be an array or null");

  return raw.map((value, messageIndex) => {
    const path = `messages[${messageIndex}]`;
    if (!isRecord(value)) fail(path, "must be an object");
    if (!isDefinitionMessageRole(value.role)) {
      fail(`${path}.role`, 'must be "system", "user", or "assistant"');
    }
    if (!Array.isArray(value.content)) {
      fail(`${path}.content`, "must be an array");
    }
    const content = value.content.map((part, partIndex) => {
      if (!isDefinitionMessagePart(part)) {
        fail(
          `${path}.content[${partIndex}]`,
          "must be a valid authored text or media message part",
        );
      }
      return part;
    });
    const parsed: DefinitionMessage = { role: value.role, content };
    copyOpaqueKeys(parsed, value, MESSAGE_KNOWN_KEYS);
    return parsed;
  });
}

/** Parse variable definitions from an agent-definition JSONB field. */
export function parseAgentVariableDefinitions(
  raw: unknown,
): AgentDefinition["variableDefinitions"] {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) {
    fail("variable_definitions", "must be an array or null");
  }
  return raw.map(parseVariableDefinition);
}
