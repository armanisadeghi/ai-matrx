type JsonSchemaTypeName =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

type JsonSchemaStringFormat =
  | "date-time"
  | "time"
  | "date"
  | "duration"
  | "email"
  | "hostname"
  | "ipv4"
  | "ipv6"
  | "uuid";

type JsonSchemaDefinition = JsonSchema | boolean;

interface JsonSchema {
  type?: JsonSchemaTypeName | JsonSchemaTypeName[];
  description?: string;

  // --- enum / const ---
  enum?: unknown[];
  const?: unknown;

  // --- string constraints ---
  pattern?: string;
  format?: JsonSchemaStringFormat;

  // --- number / integer constraints ---
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;

  // --- array constraints ---
  items?: JsonSchemaDefinition | JsonSchemaDefinition[];
  minItems?: number;
  maxItems?: number;

  // --- object constraints ---
  properties?: Record<string, JsonSchemaDefinition>;
  required?: string[];
  additionalProperties?: JsonSchemaDefinition;

  // --- composition (only anyOf is supported) ---
  anyOf?: JsonSchemaDefinition[];

  // --- definitions & references ---
  $defs?: Record<string, JsonSchemaDefinition>;
  $ref?: string;
}

/** Top-level output schema that you author and then convert per-provider. */
export interface OutputSchema {
  /** Schema name — alphanumeric, underscores, dashes, max 64 chars. */
  name: string;
  description?: string;
  /** Must be a root-level object schema with additionalProperties: false. */
  schema: JsonSchema;
  /** When true, the provider must enforce the schema exactly. */
  strict?: boolean;
}
