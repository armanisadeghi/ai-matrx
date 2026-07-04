/**
 * OpenAI/provider JSON Schema → KindSchema converter + __kind injection.
 *
 * The strategic keystone: `buildAgentSchemaWithRenderBlockSupport` turns "a
 * user/agent defined an output schema" into "the platform has a render
 * contract for it" by injecting the `__kind` discriminator into the agent's
 * output schema (root + array items), so the model emits self-identifying
 * objects from then on.
 *
 * Moved from app/(dev)/demos/json-block-detector/schema-converter.ts.
 */

import {
  KIND_KEY,
  type FieldSchema,
  type KindSchema,
} from "../core/kind-schema.types";
import { formatBlockLabel } from "../core/schema-structure";

export type JsonSchemaNode = Record<string, unknown>;

export type ConversionProblem = {
  severity: "error" | "warning" | "info";
  path: string;
  message: string;
};

export type DroppedMetadata = {
  path: string;
  dropped: Record<string, unknown>;
};

export type FieldComparison = {
  field: string;
  aiPresent: boolean;
  blockPresent: boolean;
  aiSummary: string | null;
  blockSummary: string | null;
  status:
    | "match"
    | "ai_only"
    | "block_only"
    | "type_mismatch"
    | "ai_richer"
    | "block_richer";
  detail?: string;
};

/** One standalone flexible_data block schema row. */
export type BlockSchemaDraft = {
  slug: string;
  label: string;
  fields: Record<string, FieldSchema>;
};

export type ArrayItemKindBinding = {
  arrayField: string;
  itemKindSlug: string;
};

export type SchemaConversionResult = {
  schemaName: string | null;
  strict: boolean | null;
  /** Every block schema row required for the converted shape (1..n). */
  blockSchemas: BlockSchemaDraft[];
  /** OPTION 2 — same input shape with __kind injected for agent output. */
  agentSchemaWithKinds: unknown | null;
  problems: ConversionProblem[];
  droppedMetadata: DroppedMetadata[];
  comparisons: FieldComparison[];
};

export type SavePlanEntry = {
  draft: BlockSchemaDraft;
  existsInDb: boolean;
  willSave: boolean;
};

export type ItemKindRefCheck = {
  parentSlug: string;
  field: string;
  itemKind: string;
  satisfied: boolean;
  source: "batch" | "database" | "missing";
};

export type SavePlanValidation = {
  entries: SavePlanEntry[];
  itemKindRefs: ItemKindRefCheck[];
  newCount: number;
  canSave: boolean;
  errors: string[];
};

const METADATA_KEYS = new Set([
  "description",
  "title",
  "default",
  "examples",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "const",
  "additionalProperties",
  "$schema",
  "$id",
  "deprecated",
  "readOnly",
  "writeOnly",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fieldSchemaSummary(field: FieldSchema): string {
  if (field.type === "enum") {
    return `enum(${field.values.join("|")})${field.required ? "*" : ""}`;
  }
  if (field.type === "array") {
    return `array<${field.itemKinds.join("|")}>${field.required ? "*" : ""}`;
  }
  if (field.type === "inline_object") {
    return `inline{${Object.keys(field.fields).join(",")}}${field.required ? "*" : ""}`;
  }
  if (field.type === "object") {
    return `object:${field.kind}${field.required ? "*" : ""}`;
  }
  if (field.type === "union") {
    return `union(${field.scalars.join("|")})${field.required ? "*" : ""}`;
  }
  return `${field.type}${field.required ? "*" : ""}${field.nullable ? "?" : ""}`;
}

function resolvePrimaryType(node: JsonSchemaNode): {
  type: string | null;
  nullable: boolean;
} {
  const raw = node.type;
  if (typeof raw === "string") {
    return { type: raw === "integer" ? "number" : raw, nullable: false };
  }
  if (Array.isArray(raw)) {
    const types = raw.filter((t): t is string => typeof t === "string");
    const nullable = types.includes("null");
    const primary =
      types.find((t) => t !== "null") ??
      (nullable && types.length === 1 ? "null" : null);
    if (primary === "integer") {
      return { type: "number", nullable };
    }
    return { type: primary ?? null, nullable };
  }
  if (node.enum) return { type: "string", nullable: false };
  if (node.properties) return { type: "object", nullable: false };
  if (node.items) return { type: "array", nullable: false };
  return { type: null, nullable: false };
}

function collectDropped(node: JsonSchemaNode, path: string): DroppedMetadata[] {
  const dropped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (METADATA_KEYS.has(key)) {
      dropped[key] = value;
    }
  }

  if (Object.keys(dropped).length > 0) {
    return [{ path, dropped }];
  }
  return [];
}

function synthesizeItemKindSlug(schemaName: string, fieldName: string): string {
  const base = fieldName.endsWith("ies")
    ? `${fieldName.slice(0, -3)}y`
    : fieldName.endsWith("s")
      ? fieldName.slice(0, -1)
      : fieldName;
  return `${schemaName}_${base}`;
}

function makeKindJsonSchemaProperty(
  kindSlug: string,
  strict: boolean,
): JsonSchemaNode {
  const base: JsonSchemaNode = {
    type: "string",
    description: "Block discriminator for render pipeline.",
  };
  if (strict) {
    return { ...base, const: kindSlug };
  }
  return { ...base, enum: [kindSlug] };
}

/**
 * Inject the `__kind` discriminator into one object schema (const when
 * strict, enum otherwise; `__kind` prepended to required; strict also pins
 * additionalProperties:false). Shared with the REVERSE converter
 * (kind-to-json-schema.ts) so both directions stamp identical discriminators.
 */
export function injectKindIntoObjectSchema(
  objectSchema: JsonSchemaNode,
  kindSlug: string,
  strict: boolean,
): JsonSchemaNode {
  const clone = deepClone(objectSchema);
  const properties: Record<string, unknown> = isRecord(clone.properties)
    ? { ...clone.properties }
    : {};

  properties[KIND_KEY] = makeKindJsonSchemaProperty(kindSlug, strict);

  const required = Array.isArray(clone.required)
    ? clone.required.filter((k): k is string => typeof k === "string")
    : [];
  const nextRequired = required.includes(KIND_KEY)
    ? required
    : [KIND_KEY, ...required];

  return {
    ...clone,
    properties,
    required: nextRequired,
    ...(strict ? { additionalProperties: false } : {}),
  };
}

function injectKindsIntoRootSchema(
  rootSchema: JsonSchemaNode,
  rootKindSlug: string,
  arrayBindings: ArrayItemKindBinding[],
  strict: boolean,
): JsonSchemaNode {
  let updated = injectKindIntoObjectSchema(rootSchema, rootKindSlug, strict);

  if (!isRecord(updated.properties)) {
    return updated;
  }

  const properties = { ...updated.properties };

  for (const binding of arrayBindings) {
    const fieldNode = properties[binding.arrayField];
    if (!isRecord(fieldNode)) continue;

    const items = fieldNode.items;
    const itemNode = Array.isArray(items) ? items[0] : items;
    if (!isRecord(itemNode)) continue;

    const updatedItem = injectKindIntoObjectSchema(
      itemNode,
      binding.itemKindSlug,
      strict,
    );

    properties[binding.arrayField] = {
      ...fieldNode,
      items: updatedItem,
    };
  }

  return { ...updated, properties };
}

export function buildAgentSchemaWithRenderBlockSupport(
  input: unknown,
  rootKindSlug: string,
  arrayBindings: ArrayItemKindBinding[],
  strict: boolean,
): unknown | null {
  if (!isRecord(input)) return null;

  const normalized = normalizeAiSchemaInput(input);
  if (!normalized.rootSchema) return null;

  const updatedRoot = injectKindsIntoRootSchema(
    normalized.rootSchema,
    rootKindSlug,
    arrayBindings,
    strict,
  );

  if (isRecord(input.schema) && typeof input.name === "string") {
    return {
      ...deepClone(input),
      schema: updatedRoot,
    };
  }

  if (isRecord(input.json_schema)) {
    const inner = buildAgentSchemaWithRenderBlockSupport(
      input.json_schema,
      rootKindSlug,
      arrayBindings,
      strict,
    );
    return inner ? { ...deepClone(input), json_schema: inner } : null;
  }

  if (typeof input.name === "string") {
    return {
      ...deepClone(input),
      schema: updatedRoot,
    };
  }

  return updatedRoot;
}

type ConvertContext = {
  schemaName: string;
  strict: boolean;
  problems: ConversionProblem[];
  droppedMetadata: DroppedMetadata[];
  blockSchemas: BlockSchemaDraft[];
  arrayBindings: ArrayItemKindBinding[];
};

function convertProperty(
  fieldName: string,
  node: JsonSchemaNode,
  required: boolean,
  path: string,
  ctx: ConvertContext,
): FieldSchema | null {
  ctx.droppedMetadata.push(...collectDropped(node, path));

  if (typeof node.$ref === "string") {
    ctx.problems.push({
      severity: "error",
      path,
      message: `$ref is not supported ("${node.$ref}"). Inline the schema manually.`,
    });
    return null;
  }

  if (Array.isArray(node.anyOf) || Array.isArray(node.oneOf)) {
    const variants = (node.anyOf ?? node.oneOf) as JsonSchemaNode[];
    const scalarTypes = new Set<"string" | "number" | "boolean">();
    for (const variant of variants) {
      const { type, nullable } = resolvePrimaryType(variant);
      if (type === "string" || type === "number" || type === "boolean") {
        scalarTypes.add(type);
      }
      if (nullable) {
        return {
          required: required || undefined,
          nullable: true,
          type: "string",
        };
      }
    }
    if (scalarTypes.size > 0) {
      ctx.problems.push({
        severity: "warning",
        path,
        message: `Converted anyOf/oneOf to union of scalars: ${[...scalarTypes].join(", ")}.`,
      });
      return {
        required: required || undefined,
        type: "union",
        scalars: [...scalarTypes],
      };
    }
    ctx.problems.push({
      severity: "error",
      path,
      message:
        "anyOf/oneOf with non-scalar variants cannot be converted automatically.",
    });
    return null;
  }

  if (Array.isArray(node.allOf)) {
    ctx.problems.push({
      severity: "warning",
      path,
      message: "allOf merged using first object branch only.",
    });
    const objectBranch = (node.allOf as JsonSchemaNode[]).find(
      (b) => b.properties,
    );
    if (objectBranch) {
      return convertProperty(fieldName, objectBranch, required, path, ctx);
    }
  }

  const { type, nullable } = resolvePrimaryType(node);

  if (type === "string") {
    if (Array.isArray(node.enum)) {
      const values = node.enum.filter(
        (v): v is string => typeof v === "string",
      );
      if (values.length !== node.enum.length) {
        ctx.problems.push({
          severity: "warning",
          path,
          message: "Enum contains non-string values; non-strings dropped.",
        });
      }
      return {
        required: required || undefined,
        nullable: nullable || undefined,
        type: "enum",
        values,
      };
    }
    return {
      required: required || undefined,
      nullable: nullable || undefined,
      type: "string",
    };
  }

  if (type === "number") {
    return {
      required: required || undefined,
      nullable: nullable || undefined,
      type: "number",
    };
  }

  if (type === "boolean") {
    return {
      required: required || undefined,
      nullable: nullable || undefined,
      type: "boolean",
    };
  }

  if (type === "array") {
    const items = node.items;
    if (!items) {
      ctx.problems.push({
        severity: "error",
        path,
        message: "Array field is missing items schema.",
      });
      return null;
    }

    const itemNode = Array.isArray(items) ? items[0] : items;
    if (!isRecord(itemNode)) {
      ctx.problems.push({
        severity: "error",
        path,
        message: "Array items schema must be an object.",
      });
      return null;
    }

    const itemType = resolvePrimaryType(itemNode).type;

    if (itemType === "string") {
      return {
        required: required || undefined,
        nullable: nullable || undefined,
        type: "string[]",
      };
    }
    if (itemType === "number") {
      return {
        required: required || undefined,
        nullable: nullable || undefined,
        type: "number[]",
      };
    }
    if (itemType === "boolean") {
      return {
        required: required || undefined,
        nullable: nullable || undefined,
        type: "boolean[]",
      };
    }

    if (itemType === "object" && isRecord(itemNode.properties)) {
      // Items that already carry a `__kind` const/enum DECLARE their kind —
      // honor it instead of synthesizing a slug. This is what lets the
      // reverse converter (kind-to-json-schema.ts) round-trip: an exported
      // schema's array items name their real kind (e.g. "math_solution"),
      // not a derived one ("math_problem_solution").
      const declaredItemKind = readBlockKindFromProperties(itemNode.properties);
      const itemKindSlug =
        declaredItemKind ?? synthesizeItemKindSlug(ctx.schemaName, fieldName);
      const itemRequired = new Set(
        Array.isArray(itemNode.required)
          ? itemNode.required.filter((k): k is string => typeof k === "string")
          : [],
      );
      const itemFields: Record<string, FieldSchema> = {};

      for (const [propName, propNode] of Object.entries(itemNode.properties)) {
        if (!isRecord(propNode)) continue;
        if (propName === KIND_KEY) continue;
        const converted = convertProperty(
          propName,
          propNode,
          itemRequired.has(propName),
          `${path}[].${propName}`,
          ctx,
        );
        if (converted) {
          itemFields[propName] = converted;
        }
      }

      const alreadyHasBlockKind =
        propNameIsBlockKind(itemNode.properties) || itemRequired.has(KIND_KEY);

      ctx.arrayBindings.push({
        arrayField: fieldName,
        itemKindSlug,
      });

      // Two arrays may declare the SAME item kind — one draft per slug.
      if (!ctx.blockSchemas.some((draft) => draft.slug === itemKindSlug)) {
        ctx.blockSchemas.push({
          slug: itemKindSlug,
          label: declaredItemKind
            ? formatBlockLabel(itemKindSlug)
            : formatBlockLabel(`${ctx.schemaName}_${fieldName}_item`),
          fields: itemFields,
        });
      }

      if (!alreadyHasBlockKind) {
        ctx.problems.push({
          severity: "warning",
          path: `${path}[]`,
          message: `Array "${fieldName}" items need __kind:"${itemKindSlug}" at runtime (OPTION 1: server injects, OPTION 2: use agent schema with __kind).`,
        });
      }

      return {
        required: required || undefined,
        nullable: nullable || undefined,
        type: "array",
        itemKinds: [itemKindSlug],
      };
    }

    ctx.problems.push({
      severity: "error",
      path,
      message: `Unsupported array items type "${itemType ?? "unknown"}".`,
    });
    return null;
  }

  if (type === "object" && isRecord(node.properties)) {
    const nestedRequired = new Set(
      Array.isArray(node.required)
        ? node.required.filter((k): k is string => typeof k === "string")
        : [],
    );
    const nestedFields: Record<string, FieldSchema> = {};

    for (const [propName, propNode] of Object.entries(node.properties)) {
      if (!isRecord(propNode)) continue;
      const converted = convertProperty(
        propName,
        propNode,
        nestedRequired.has(propName),
        `${path}.${propName}`,
        ctx,
      );
      if (converted) {
        nestedFields[propName] = converted;
      }
    }

    const referencedKind = readBlockKindFromProperties(node.properties);

    if (referencedKind) {
      return {
        required: required || undefined,
        nullable: nullable || undefined,
        type: "object",
        kind: referencedKind,
      };
    }

    return {
      required: required || undefined,
      nullable: nullable || undefined,
      type: "inline_object",
      fields: nestedFields,
    };
  }

  ctx.problems.push({
    severity: "error",
    path,
    message: `Unsupported or missing JSON Schema type at "${path}".`,
  });
  return null;
}

function propNameIsBlockKind(properties: Record<string, unknown>): boolean {
  return KIND_KEY in properties;
}

function readBlockKindFromProperties(
  properties: Record<string, unknown>,
): string | null {
  const kindProp = properties[KIND_KEY];
  if (!isRecord(kindProp)) return null;
  if (typeof kindProp.const === "string") return kindProp.const;
  if (Array.isArray(kindProp.enum) && typeof kindProp.enum[0] === "string") {
    return kindProp.enum[0];
  }
  return null;
}

export function normalizeAiSchemaInput(input: unknown): {
  name: string | null;
  strict: boolean | null;
  rootSchema: JsonSchemaNode | null;
  parseErrors: string[];
} {
  const parseErrors: string[] = [];

  if (!isRecord(input)) {
    return {
      name: null,
      strict: null,
      rootSchema: null,
      parseErrors: ["Input must be a JSON object."],
    };
  }

  if (isRecord(input.json_schema)) {
    return normalizeAiSchemaInput(input.json_schema);
  }

  if (isRecord(input.schema) && typeof input.name === "string") {
    return {
      name: input.name,
      strict: typeof input.strict === "boolean" ? input.strict : null,
      rootSchema: input.schema,
      parseErrors: [],
    };
  }

  if (input.type === "object" || input.properties) {
    const name =
      typeof input.name === "string"
        ? input.name
        : typeof input.title === "string"
          ? input.title
          : null;
    return {
      name,
      strict: typeof input.strict === "boolean" ? input.strict : null,
      rootSchema: input,
      parseErrors: [],
    };
  }

  parseErrors.push(
    "Expected OpenAI output_schema shape { name, schema } or a root JSON Schema object.",
  );
  return { name: null, strict: null, rootSchema: null, parseErrors };
}

type ConversionCore = {
  schemaName: string | null;
  strict: boolean | null;
  blockSchemas: BlockSchemaDraft[];
  problems: ConversionProblem[];
  droppedMetadata: DroppedMetadata[];
};

export function convertAiSchemaToBlockFields(
  schemaName: string,
  rootSchema: JsonSchemaNode,
  strict: boolean,
): ConversionCore {
  const ctx: ConvertContext = {
    schemaName,
    strict,
    problems: [],
    droppedMetadata: [],
    blockSchemas: [],
    arrayBindings: [],
  };

  ctx.droppedMetadata.push(...collectDropped(rootSchema, ""));

  if (rootSchema.type !== "object" && !rootSchema.properties) {
    ctx.problems.push({
      severity: "error",
      path: "",
      message: "Root schema must be type object with properties.",
    });
    return emptyConversionResult(schemaName, strict, ctx);
  }

  const required = new Set(
    Array.isArray(rootSchema.required)
      ? rootSchema.required.filter((k): k is string => typeof k === "string")
      : [],
  );

  const convertedFields: Record<string, FieldSchema> = {};
  const properties = rootSchema.properties;
  if (!isRecord(properties)) {
    ctx.problems.push({
      severity: "error",
      path: "",
      message: "Root schema is missing properties.",
    });
    return emptyConversionResult(schemaName, strict, ctx);
  }

  for (const [fieldName, fieldNode] of Object.entries(properties)) {
    if (!isRecord(fieldNode)) continue;
    if (fieldName === KIND_KEY) continue;
    const converted = convertProperty(
      fieldName,
      fieldNode,
      required.has(fieldName),
      fieldName,
      ctx,
    );
    if (converted) {
      convertedFields[fieldName] = converted;
    }
  }

  const rootHasKind = propNameIsBlockKind(properties) || required.has(KIND_KEY);

  if (!rootHasKind) {
    ctx.problems.push({
      severity: "warning",
      path: "",
      message: `Root object needs __kind:"${schemaName}" at runtime (OPTION 1: server injects, OPTION 2: use agent schema with __kind).`,
    });
  }

  const rootDraft: BlockSchemaDraft = {
    slug: schemaName,
    label: formatBlockLabel(schemaName),
    fields: convertedFields,
  };

  ctx.blockSchemas.unshift(rootDraft);

  if (typeof rootSchema.additionalProperties === "boolean") {
    ctx.droppedMetadata.push({
      path: "",
      dropped: { additionalProperties: rootSchema.additionalProperties },
    });
  }

  if (strict) {
    ctx.droppedMetadata.push({
      path: "",
      dropped: { strict },
    });
  }

  return {
    schemaName,
    strict,
    blockSchemas: ctx.blockSchemas,
    problems: ctx.problems,
    droppedMetadata: ctx.droppedMetadata,
  };
}

function emptyConversionResult(
  schemaName: string,
  strict: boolean,
  ctx: Pick<ConvertContext, "problems" | "droppedMetadata" | "blockSchemas">,
): ConversionCore {
  return {
    schemaName,
    strict,
    blockSchemas: ctx.blockSchemas,
    problems: ctx.problems,
    droppedMetadata: ctx.droppedMetadata,
  };
}

function compareFieldSchemas(
  aiField: FieldSchema | undefined,
  blockField: FieldSchema | undefined,
  fieldName: string,
): FieldComparison {
  const aiPresent = aiField !== undefined;
  const blockPresent = blockField !== undefined;
  const aiSummary = aiField ? fieldSchemaSummary(aiField) : null;
  const blockSummary = blockField ? fieldSchemaSummary(blockField) : null;

  if (aiPresent && blockPresent) {
    if (aiSummary === blockSummary) {
      return {
        field: fieldName,
        aiPresent,
        blockPresent,
        aiSummary,
        blockSummary,
        status: "match",
      };
    }

    const aiRicher =
      (aiField?.type === "enum" && blockField?.type === "string") ||
      (aiField?.type === "inline_object" &&
        blockField?.type !== "inline_object");

    const blockRicher =
      (blockField?.type === "enum" && aiField?.type === "string") ||
      (blockField?.required && !aiField?.required);

    return {
      field: fieldName,
      aiPresent,
      blockPresent,
      aiSummary,
      blockSummary,
      status: aiRicher
        ? "ai_richer"
        : blockRicher
          ? "block_richer"
          : "type_mismatch",
      detail:
        aiSummary !== blockSummary
          ? `${aiSummary} vs ${blockSummary}`
          : undefined,
    };
  }

  if (aiPresent) {
    return {
      field: fieldName,
      aiPresent,
      blockPresent,
      aiSummary,
      blockSummary,
      status: "ai_only",
    };
  }

  return {
    field: fieldName,
    aiPresent,
    blockPresent,
    aiSummary,
    blockSummary,
    status: "block_only",
  };
}

export function compareWithExistingKindSchema(
  convertedFields: Record<string, FieldSchema>,
  existing: KindSchema | null,
): FieldComparison[] {
  if (!existing) return [];

  const allFields = new Set([
    ...Object.keys(convertedFields),
    ...Object.keys(existing.fields),
  ]);

  return [...allFields]
    .sort()
    .map((field) =>
      compareFieldSchemas(
        convertedFields[field],
        existing.fields[field],
        field,
      ),
    );
}

export function runSchemaConversion(
  input: unknown,
  existingSchemas: Record<string, KindSchema>,
): SchemaConversionResult & { parseErrors: string[] } {
  const normalized = normalizeAiSchemaInput(input);
  if (!normalized.rootSchema || !normalized.name) {
    return {
      schemaName: normalized.name,
      strict: normalized.strict,
      blockSchemas: [],
      agentSchemaWithKinds: null,
      problems: [],
      droppedMetadata: [],
      comparisons: [],
      parseErrors: normalized.parseErrors.length
        ? normalized.parseErrors
        : ["Schema name and root schema are required."],
    };
  }

  const strict = normalized.strict ?? false;
  const core = convertAiSchemaToBlockFields(
    normalized.name,
    normalized.rootSchema,
    strict,
  );

  const existing = existingSchemas[normalized.name] ?? null;
  const rootDraft = core.blockSchemas[0];
  const comparisons = rootDraft
    ? compareWithExistingKindSchema(rootDraft.fields, existing)
    : [];

  const problems = [...core.problems];
  if (!existing) {
    problems.push({
      severity: "info",
      path: "",
      message: `No existing block schema with slug "${normalized.name}".`,
    });
  }

  const agentSchemaWithKinds = buildAgentSchemaWithRenderBlockSupport(
    input,
    normalized.name,
    collectArrayBindingsFromDrafts(core.blockSchemas, normalized.name),
    strict,
  );

  return {
    ...core,
    agentSchemaWithKinds,
    comparisons,
    problems,
    parseErrors: [],
  };
}

function collectArrayBindingsFromDrafts(
  drafts: BlockSchemaDraft[],
  rootSlug: string,
): ArrayItemKindBinding[] {
  const root = drafts.find((d) => d.slug === rootSlug);
  if (!root) return [];

  const bindings: ArrayItemKindBinding[] = [];
  for (const [fieldName, field] of Object.entries(root.fields)) {
    if (field.type !== "array") continue;
    for (const itemKind of field.itemKinds) {
      bindings.push({ arrayField: fieldName, itemKindSlug: itemKind });
    }
  }
  return bindings;
}

export function validateBlockSchemaSavePlan(
  blockSchemas: BlockSchemaDraft[],
  existingSlugs: string[],
  hasConversionErrors: boolean,
): SavePlanValidation {
  const errors: string[] = [];
  const normalizedExisting = new Set(
    existingSlugs.map((s) => s.trim().toLowerCase()),
  );
  const batchSlugs = new Set<string>();
  const itemKindRefs: ItemKindRefCheck[] = [];

  for (const draft of blockSchemas) {
    const slug = draft.slug.trim();
    const normalized = slug.toLowerCase();

    if (!slug) {
      errors.push("Every block schema must have a non-empty slug.");
      continue;
    }

    if (batchSlugs.has(normalized)) {
      errors.push(`Duplicate slug in conversion batch: "${slug}".`);
    }
    batchSlugs.add(normalized);
  }

  const entries: SavePlanEntry[] = blockSchemas.map((draft) => {
    const existsInDb = normalizedExisting.has(draft.slug.trim().toLowerCase());
    return {
      draft,
      existsInDb,
      willSave: !existsInDb,
    };
  });

  for (const draft of blockSchemas) {
    for (const [fieldName, field] of Object.entries(draft.fields)) {
      if (field.type !== "array") continue;
      for (const itemKind of field.itemKinds) {
        const inBatch = batchSlugs.has(itemKind.trim().toLowerCase());
        const inDb = normalizedExisting.has(itemKind.trim().toLowerCase());
        const satisfied = inBatch || inDb;
        itemKindRefs.push({
          parentSlug: draft.slug,
          field: fieldName,
          itemKind,
          satisfied,
          source: inBatch ? "batch" : inDb ? "database" : "missing",
        });
        if (!satisfied) {
          errors.push(
            `"${draft.slug}".${fieldName} references itemKind "${itemKind}" — not in this batch and not in DB.`,
          );
        }
      }
    }
  }

  const newCount = entries.filter((e) => e.willSave).length;

  if (newCount === 0 && blockSchemas.length > 0) {
    errors.push("All block schema slugs already exist in the database.");
  }

  if (hasConversionErrors) {
    errors.push("Resolve conversion errors before saving.");
  }

  return {
    entries,
    itemKindRefs,
    newCount,
    canSave: errors.length === 0 && newCount > 0,
    errors,
  };
}

export function fieldsToDbPayload(
  fields: Record<string, FieldSchema>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(fields)) as Record<string, unknown>;
}

export function isDuplicateBlockSlug(
  slug: string,
  entries: Array<{ slug: string }>,
): boolean {
  const normalized = slug.trim().toLowerCase();
  return entries.some((e) => e.slug.trim().toLowerCase() === normalized);
}
