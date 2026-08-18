export type SchemaExampleKind = "minimum" | "defaults" | "full";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function propertyValue(
  name: string,
  schemaValue: unknown,
  kind: SchemaExampleKind,
  rootSchema: JsonObject,
): unknown {
  let schema = asObject(schemaValue) ?? {};
  if (typeof schema.$ref === "string" && schema.$ref.startsWith("#/$defs/")) {
    const definition = asObject(rootSchema.$defs)?.[
      schema.$ref.slice("#/$defs/".length)
    ];
    schema = asObject(definition) ?? schema;
  }
  if (Array.isArray(schema.anyOf)) {
    schema =
      schema.anyOf
        .map(asObject)
        .find((candidate) => candidate?.type !== "null") ?? schema;
  }
  if (
    "default" in schema &&
    (kind !== "full" ||
      (schema.type !== "array" && schema.type !== "object"))
  ) {
    return schema.default;
  }
  if ("const" in schema) return schema.const;
  const choices = Array.isArray(schema.enum) ? schema.enum : [];
  if (choices.length > 0) return choices[0];

  const rawType = schema.type;
  const type = Array.isArray(rawType)
    ? rawType.find((candidate) => candidate !== "null")
    : rawType;
  if (type === "object" || asObject(schema.properties)) {
    return buildSchemaExample(schema, kind, rootSchema);
  }
  if (type === "array") {
    return kind === "full" && schema.items
      ? [propertyValue("item", schema.items, kind, rootSchema)]
      : [];
  }
  if (type === "boolean") return false;
  if (type === "integer" || type === "number") return 0;
  if (schema.format === "uuid") return "00000000-0000-0000-0000-000000000000";
  return `<${name}>`;
}

/** Derive copy-ready examples from the server's JSON Schema without noun-specific code. */
export function buildSchemaExample(
  schemaValue: unknown,
  kind: SchemaExampleKind,
  rootSchemaValue: unknown = schemaValue,
): JsonObject {
  const schema = asObject(schemaValue) ?? {};
  const rootSchema = asObject(rootSchemaValue) ?? schema;
  const properties = asObject(schema.properties) ?? {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );

  const output: JsonObject = {};
  for (const [name, propertySchema] of Object.entries(properties)) {
    const property = asObject(propertySchema) ?? {};
    const include =
      kind === "full" ||
      (kind === "minimum" && required.has(name)) ||
      (kind === "defaults" && "default" in property);
    if (include) {
      output[name] = propertyValue(name, property, kind, rootSchema);
    }
  }
  return output;
}

export function isJsonSchema(value: unknown): value is JsonObject {
  const schema = asObject(value);
  return schema !== null && asObject(schema.properties) !== null;
}
