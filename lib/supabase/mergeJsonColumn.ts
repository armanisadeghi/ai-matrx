/**
 * Host adapter for @ai-matrx/data's optimistic JSON-column merge.
 *
 * This repository deliberately regenerates database JSON columns as `unknown`,
 * while the portable package correctly accepts only JSON. Validate that one
 * host boundary with Zod, then hand the package a proven JSON object. Feature
 * callers remain honest about database ingress and cannot bypass validation
 * with assertions.
 */
import { z } from "zod";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  mergeJsonColumn as mergeJsonColumnBase,
  type MergeJsonColumnResult,
  type VersionedRow,
} from "@ai-matrx/data/db";

const jsonObjectSchema = z.record(z.string(), z.json().optional());

interface MaybeSingleResponse<Row> {
  data: Row | null;
  error: PostgrestError | null;
}

/** Open host-side JSON before the package boundary validates it recursively. */
export type JsonObject = Record<string, unknown>;

export interface MergeJsonColumnArgs<Row extends VersionedRow> {
  fetchCurrent: () => PromiseLike<MaybeSingleResponse<Row>>;
  readColumn: (row: Row) => unknown;
  merge: (current: JsonObject) => JsonObject;
  applyUpdate: (next: {
    value: JsonObject;
    expectedVersion: number;
    nextVersion: number;
  }) => PromiseLike<MaybeSingleResponse<Row>>;
  attempts?: number;
}

/** Normalize unknown database JSON to a recursively validated object. */
export function asJsonObject(value: unknown): JsonObject {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function mergeJsonColumn<Row extends VersionedRow>(
  args: MergeJsonColumnArgs<Row>,
): Promise<MergeJsonColumnResult<Row>> {
  return mergeJsonColumnBase<Row>({
    fetchCurrent: args.fetchCurrent,
    readColumn: (row) => {
      const parsed = jsonObjectSchema.safeParse(args.readColumn(row));
      return parsed.success ? parsed.data : null;
    },
    merge: (current) => jsonObjectSchema.parse(args.merge(current)),
    applyUpdate: ({ value, expectedVersion, nextVersion }) =>
      args.applyUpdate({ value, expectedVersion, nextVersion }),
    attempts: args.attempts,
  });
}
