/**
 * flexible_data-backed schema source — the ONLY place the Block Schemas /
 * Sample Block Data category ids and flexible_data reads for kind schemas may
 * live (lint-enforced chokepoint). The registry consumes this; nothing else
 * touches the table for schema purposes.
 *
 * Moved from app/(dev)/demos/json-block-detector/flexible-data-service.ts.
 */

import type { Database, Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import {
  KIND_KEY,
  type FieldSchema,
  type KindSchema,
} from "../core/kind-schema.types";

/** Block Schemas category (`block-schemas` / "Block Schemas"). */
export const BLOCK_SCHEMAS_CATEGORY_ID = "671a423f-d350-4457-83e5-389eac70f287";

/** Sample Block Data category (`sample-block-data` / "Sample Block Data"). */
export const SAMPLE_BLOCK_DATA_CATEGORY_ID =
  "6f46917c-be9a-4763-b4dd-107546a3d282";

type FlexibleDataTable = Database["public"]["Tables"]["flexible_data"];
type FlexibleDataRow = FlexibleDataTable["Row"];
type FlexibleDataInsert = FlexibleDataTable["Insert"];
type FlexibleDataUpdate = FlexibleDataTable["Update"];
type Visibility = Database["platform"]["Enums"]["visibility"];

export type FlexibleDataRecord = Pick<
  FlexibleDataRow,
  | "id"
  | "label"
  | "slug"
  | "data"
  | "category_id"
  | "organization_id"
  | "visibility"
>;

export type CreateFlexibleDataInput = {
  categoryId: string;
  organizationId: string;
  label: string;
  slug: string;
  data: Record<string, unknown>;
  visibility?: Visibility;
};

export type UpdateFlexibleDataInput = {
  label?: string;
  slug?: string;
  data?: Record<string, unknown>;
  visibility?: Visibility;
};

export type BlockSchemaEntry = {
  id: string;
  label: string;
  slug: string;
  fields: Record<string, FieldSchema>;
};

export type BlockSchemaRegistry = {
  schemas: Record<string, KindSchema>;
  entries: BlockSchemaEntry[];
};

export type BlockSample = {
  id: string;
  label: string;
  slug: string;
  content: string;
  data: Record<string, unknown>;
};

export class FlexibleDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlexibleDataError";
  }
}

const LIST_COLUMNS =
  "id, label, slug, data, category_id, organization_id, visibility" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonObject(data: Record<string, unknown>): Json {
  return data as Json;
}

function assertFlexibleDataRecord(value: unknown): FlexibleDataRecord {
  if (!isRecord(value)) {
    throw new FlexibleDataError("flexible_data row has an unexpected shape.");
  }

  if (
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    (typeof value.slug !== "string" && value.slug !== null) ||
    (typeof value.category_id !== "string" && value.category_id !== null) ||
    typeof value.organization_id !== "string"
  ) {
    throw new FlexibleDataError(
      "flexible_data row is missing required fields.",
    );
  }

  return value as FlexibleDataRecord;
}

export async function listFlexibleData(
  categoryId: string,
): Promise<FlexibleDataRecord[]> {
  const { data, error } = await supabase
    .from("flexible_data")
    .select(LIST_COLUMNS)
    .eq("category_id", categoryId)
    .is("deleted_at", null)
    .order("slug");

  if (error) {
    throw new FlexibleDataError(
      `Failed to list flexible_data: ${error.message}`,
    );
  }

  if (!Array.isArray(data)) {
    throw new FlexibleDataError("flexible_data list returned invalid data.");
  }

  return data.map(assertFlexibleDataRecord);
}

export async function getFlexibleData(id: string): Promise<FlexibleDataRecord> {
  const { data, error } = await supabase
    .from("flexible_data")
    .select(LIST_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new FlexibleDataError(
      `Failed to get flexible_data: ${error.message}`,
    );
  }

  if (!data) {
    throw new FlexibleDataError(`flexible_data row "${id}" was not found.`);
  }

  return assertFlexibleDataRecord(data);
}

export async function createFlexibleData(
  input: CreateFlexibleDataInput,
): Promise<FlexibleDataRecord> {
  const payload: FlexibleDataInsert = {
    category_id: input.categoryId,
    organization_id: input.organizationId,
    label: input.label,
    slug: input.slug,
    data: toJsonObject(input.data),
    visibility: input.visibility ?? "private",
  };

  const { data, error } = await supabase
    .from("flexible_data")
    .insert(payload)
    .select(LIST_COLUMNS)
    .single();

  if (error) {
    throw new FlexibleDataError(
      `Failed to create flexible_data: ${error.message}`,
    );
  }

  return assertFlexibleDataRecord(data);
}

export async function updateFlexibleData(
  id: string,
  input: UpdateFlexibleDataInput,
): Promise<FlexibleDataRecord> {
  const payload: FlexibleDataUpdate = {};

  if (input.label !== undefined) payload.label = input.label;
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.data !== undefined) payload.data = toJsonObject(input.data);
  if (input.visibility !== undefined) payload.visibility = input.visibility;

  const { data, error } = await supabase
    .from("flexible_data")
    .update(payload)
    .eq("id", id)
    .is("deleted_at", null)
    .select(LIST_COLUMNS)
    .single();

  if (error) {
    throw new FlexibleDataError(
      `Failed to update flexible_data: ${error.message}`,
    );
  }

  return assertFlexibleDataRecord(data);
}

export async function deleteFlexibleData(id: string): Promise<void> {
  const { error } = await supabase
    .from("flexible_data")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    throw new FlexibleDataError(
      `Failed to delete flexible_data: ${error.message}`,
    );
  }
}

function parseScalarArrayType(
  type: string,
): "string[]" | "number[]" | "boolean[]" | null {
  if (type === "string[]" || type === "number[]" || type === "boolean[]") {
    return type;
  }
  return null;
}

function parseScalarType(type: string): "string" | "number" | "boolean" | null {
  if (type === "string" || type === "number" || type === "boolean") {
    return type;
  }
  return null;
}

function parseFieldSchema(raw: unknown, context: string): FieldSchema {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    throw new FlexibleDataError(
      `${context}: field schema must be an object with a string "type".`,
    );
  }

  const base = {
    required: raw.required === true ? true : undefined,
    nullable: raw.nullable === true ? true : undefined,
  };

  const scalarType = parseScalarType(raw.type);
  if (scalarType) {
    return { ...base, type: scalarType };
  }

  const scalarArrayType = parseScalarArrayType(raw.type);
  if (scalarArrayType) {
    return { ...base, type: scalarArrayType };
  }

  switch (raw.type) {
    case "array": {
      if (!Array.isArray(raw.itemKinds)) {
        throw new FlexibleDataError(
          `${context}: array field requires string[] "itemKinds".`,
        );
      }
      const itemKinds = raw.itemKinds.filter(
        (item): item is string => typeof item === "string",
      );
      if (itemKinds.length !== raw.itemKinds.length) {
        throw new FlexibleDataError(
          `${context}: array "itemKinds" must contain only strings.`,
        );
      }
      return { ...base, type: "array", itemKinds };
    }

    case "object": {
      if (typeof raw.kind !== "string" || !raw.kind.trim()) {
        throw new FlexibleDataError(
          `${context}: object field requires string "kind".`,
        );
      }
      return { ...base, type: "object", kind: raw.kind };
    }

    case "inline_object": {
      if (!isRecord(raw.fields)) {
        throw new FlexibleDataError(
          `${context}: inline_object field requires object "fields".`,
        );
      }
      const fields: Record<string, FieldSchema> = {};
      for (const [name, fieldRaw] of Object.entries(raw.fields)) {
        fields[name] = parseFieldSchema(fieldRaw, `${context}.${name}`);
      }
      return { ...base, type: "inline_object", fields };
    }

    case "record": {
      const values = parseScalarType(
        typeof raw.values === "string" ? raw.values : "",
      );
      if (!values) {
        throw new FlexibleDataError(
          `${context}: record field requires scalar "values" (string | number | boolean).`,
        );
      }
      return { ...base, type: "record", values };
    }

    case "enum": {
      if (!Array.isArray(raw.values)) {
        throw new FlexibleDataError(
          `${context}: enum field requires string[] "values".`,
        );
      }
      const values = raw.values.filter(
        (item): item is string => typeof item === "string",
      );
      if (values.length !== raw.values.length) {
        throw new FlexibleDataError(
          `${context}: enum "values" must contain only strings.`,
        );
      }
      return { ...base, type: "enum", values };
    }

    case "union": {
      if (!Array.isArray(raw.scalars)) {
        throw new FlexibleDataError(
          `${context}: union field requires "scalars" array.`,
        );
      }
      const scalars = raw.scalars.filter(
        (item): item is "string" | "number" | "boolean" =>
          item === "string" || item === "number" || item === "boolean",
      );
      if (scalars.length !== raw.scalars.length) {
        throw new FlexibleDataError(
          `${context}: union "scalars" must be string | number | boolean.`,
        );
      }
      return { ...base, type: "union", scalars };
    }

    default:
      throw new FlexibleDataError(
        `${context}: unsupported field type "${raw.type}".`,
      );
  }
}

function parseBlockSchemaRow(row: FlexibleDataRecord): BlockSchemaEntry {
  if (!row.slug?.trim()) {
    throw new FlexibleDataError(
      `Block schema "${row.label}" (${row.id}) is missing slug.`,
    );
  }

  if (!isRecord(row.data)) {
    throw new FlexibleDataError(
      `Block schema "${row.slug}" data must be a JSON object of field definitions.`,
    );
  }

  const fields: Record<string, FieldSchema> = {};
  for (const [fieldName, fieldRaw] of Object.entries(row.data)) {
    fields[fieldName] = parseFieldSchema(
      fieldRaw,
      `block schema "${row.slug}".${fieldName}`,
    );
  }

  return {
    id: row.id,
    label: row.label,
    slug: row.slug,
    fields,
  };
}

export function buildBlockSchemaRegistry(
  rows: FlexibleDataRecord[],
): BlockSchemaRegistry {
  const schemas: Record<string, KindSchema> = {};
  const entries: BlockSchemaEntry[] = [];

  for (const row of rows) {
    const entry = parseBlockSchemaRow(row);
    if (schemas[entry.slug]) {
      throw new FlexibleDataError(
        `Duplicate block schema slug "${entry.slug}" in flexible_data.`,
      );
    }

    schemas[entry.slug] = {
      kind: entry.slug,
      fields: entry.fields,
    };
    entries.push(entry);
  }

  return { schemas, entries };
}

export async function listBlockSchemas(
  categoryId: string,
): Promise<BlockSchemaRegistry> {
  const rows = await listFlexibleData(categoryId);
  return buildBlockSchemaRegistry(rows);
}

/** Cold-tier single-row fetch: one kind schema by slug, null when absent. */
export async function getBlockSchemaBySlug(
  slug: string,
): Promise<KindSchema | null> {
  const { data, error } = await supabase
    .from("flexible_data")
    .select(LIST_COLUMNS)
    .eq("category_id", BLOCK_SCHEMAS_CATEGORY_ID)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new FlexibleDataError(
      `Failed to fetch block schema "${slug}": ${error.message}`,
    );
  }

  if (!data) return null;

  const entry = parseBlockSchemaRow(assertFlexibleDataRecord(data));
  return { kind: entry.slug, fields: entry.fields };
}

export function getBlockSchemaSlugs(
  schemas: Record<string, KindSchema>,
): string[] {
  return Object.keys(schemas);
}

function parseBlockSampleRow(row: FlexibleDataRecord): BlockSample {
  if (!row.slug?.trim()) {
    throw new FlexibleDataError(
      `Sample "${row.label}" (${row.id}) is missing slug.`,
    );
  }

  if (!isRecord(row.data)) {
    throw new FlexibleDataError(
      `Sample "${row.slug}" data must be a JSON object payload.`,
    );
  }

  if (typeof row.data[KIND_KEY] !== "string") {
    throw new FlexibleDataError(
      `Sample "${row.slug}" data must include string "${KIND_KEY}".`,
    );
  }

  return {
    id: row.id,
    label: row.label,
    slug: row.slug,
    data: row.data,
    content: JSON.stringify(row.data, null, 2),
  };
}

export function buildBlockSampleList(
  rows: FlexibleDataRecord[],
): BlockSample[] {
  const seenSlugs = new Set<string>();
  const samples: BlockSample[] = [];

  for (const row of rows) {
    const sample = parseBlockSampleRow(row);
    if (seenSlugs.has(sample.slug)) {
      throw new FlexibleDataError(
        `Duplicate sample slug "${sample.slug}" in flexible_data.`,
      );
    }
    seenSlugs.add(sample.slug);
    samples.push(sample);
  }

  return samples;
}

export async function listBlockSamples(
  categoryId: string,
): Promise<BlockSample[]> {
  const rows = await listFlexibleData(categoryId);
  return buildBlockSampleList(rows);
}
