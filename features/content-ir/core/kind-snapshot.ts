/**
 * Compliant snapshot builder — the guarantee that a renderer always receives
 * a well-formed, schema-shaped object even mid-stream.
 *
 * ZERO DATA LOSS: unknown keys are NOT merged into the snapshot value (they
 * would be indistinguishable from schema fields). They are returned on the
 * residue channel and re-merged only at wire-serialization time via
 * `mergeResidueIntoValue`.
 */

import { isEmptyResidue, type IrResidue } from "./ir-types";
import {
  KIND_KEY,
  type FieldSchema,
  type KindSchema,
} from "./kind-schema.types";

/** Placeholder for a required field not yet received during streaming. */
export function emptyValueForFieldSchema(field: FieldSchema): unknown {
  if (field.nullable) return null;

  switch (field.type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "json":
      // Any JSON value — null is the honest "nothing arrived yet" member.
      return null;
    case "string[]":
    case "number[]":
    case "boolean[]":
    case "json[]":
    case "array":
      return [];
    case "object":
    case "inline_object":
    case "record":
      return {};
    case "enum":
      return "";
    case "union":
      if (field.scalars.includes("string")) return "";
      if (field.scalars.includes("number")) return 0;
      if (field.scalars.includes("boolean")) return false;
      // Kinds-only object union — an empty object is the least-wrong stub.
      return {};
    default:
      return null;
  }
}

export interface CompliantKindSnapshot {
  /** Schema fields + __kind only. Required-but-missing fields hold typed placeholders. */
  value: Record<string, unknown>;
  /** Unknown keys + missing optionals. Null when both channels are empty. */
  residue: IrResidue | null;
}

export function buildCompliantKindSnapshot(
  schema: KindSchema,
  partial: Record<string, unknown>,
): CompliantKindSnapshot {
  const value: Record<string, unknown> = {
    [KIND_KEY]: schema.kind,
  };
  const optionalMissing: string[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
    if (fieldName in partial && partial[fieldName] !== undefined) {
      value[fieldName] = partial[fieldName];
    } else if (fieldSchema.required) {
      value[fieldName] = emptyValueForFieldSchema(fieldSchema);
    } else {
      optionalMissing.push(fieldName);
    }
  }

  let extra: Record<string, unknown> | null = null;
  for (const [fieldName, fieldValue] of Object.entries(partial)) {
    if (fieldName === KIND_KEY) continue;
    if (fieldName in schema.fields) continue;
    if (extra === null) extra = {};
    extra[fieldName] = fieldValue;
  }

  const residue: IrResidue = {
    extra,
    optionalMissing: optionalMissing.length > 0 ? optionalMissing : null,
    notices: null,
  };

  return { value, residue: isEmptyResidue(residue) ? null : residue };
}

/**
 * Wire/round-trip form: schema fields + unknown keys back together, exactly
 * as the source carried them. `residue.extra` wins nothing — snapshot value
 * and extras are disjoint by construction.
 */
export function mergeResidueIntoValue(
  value: Record<string, unknown>,
  residue: IrResidue | null,
): Record<string, unknown> {
  if (!residue?.extra) return value;
  return { ...value, ...residue.extra };
}
