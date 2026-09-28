"use client";

// Canonical browser-side CRUD for the staff Quick Math authoring screen.
// The database's platform_admin_all RLS policy is the authority boundary;
// this service never attempts to infer or widen that permission in the UI.

import { guardedUpdate, readAllRows } from "@ai-matrx/data/db";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { supabase } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";

export type MathProblemRow = Database["education"]["Tables"]["math_problems"]["Row"];
export type MathProblemInsert = Database["education"]["Tables"]["math_problems"]["Insert"];
export type MathProblemUpdate = Database["education"]["Tables"]["math_problems"]["Update"];

const education = () => supabase.schema("education");

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (hasStringMessage(error)) return error.message;
  return "Unknown database error";
}

function hasStringMessage(value: unknown): value is { message: string } {
  return value !== null && typeof value === "object" && "message" in value && typeof value.message === "string";
}

function throwQueryError(action: string, error: unknown): never {
  throw new Error(`Could not ${action}: ${describeError(error)}`);
}

export const mathProblemAdminService = {
  async list(): Promise<MathProblemRow[]> {
    try {
      return await readAllRows(
        ({ from, to }) =>
          education()
            .from("math_problems")
            .select("*")
            .is("deleted_at", null)
            .order("course_name")
            .order("topic_name")
            .order("module_name")
            .order("sort_order")
            .order("created_at", { ascending: false })
            .range(from, to),
        { label: "education.math_problems authoring list" },
      );
    } catch (error) {
      throwQueryError("load Quick Math problems", error);
    }
  },

  async create(input: Omit<MathProblemInsert, "organization_id">): Promise<MathProblemRow> {
    const organizationId = await ensureOrgId(undefined);
    const { data, error } = await education()
      .from("math_problems")
      .insert({ ...input, organization_id: organizationId })
      .select("*")
      .single();
    if (error) throwQueryError("create this Quick Math problem", error);
    return data;
  },

  async update(
    id: string,
    expectedVersion: number,
    patch: MathProblemUpdate,
  ): Promise<MathProblemRow> {
    try {
      const result = await guardedUpdate<MathProblemRow>({
        expectedVersion,
        applyUpdate: ({ expectedVersion: expected, nextVersion }) =>
          education()
            .from("math_problems")
            .update({ ...patch, version: nextVersion })
            .eq("id", id)
            .eq("version", expected)
            .is("deleted_at", null)
            .select("*")
            .maybeSingle(),
        fetchCurrent: () =>
          education()
            .from("math_problems")
            .select("*")
            .eq("id", id)
            .is("deleted_at", null)
            .maybeSingle(),
      });
      if (result.status === "conflict") {
        throw new Error("This problem changed elsewhere. Reload it before saving your edits.");
      }
      if (result.status === "not_found") {
        throw new Error("This problem is no longer available.");
      }
      return result.row;
    } catch (error) {
      throwQueryError("save this Quick Math problem", error);
    }
  },

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    try {
      const result = await guardedUpdate<MathProblemRow>({
        expectedVersion,
        applyUpdate: ({ expectedVersion: expected, nextVersion }) =>
          education()
            .from("math_problems")
            .update({ deleted_at: new Date().toISOString(), version: nextVersion })
            .eq("id", id)
            .eq("version", expected)
            .is("deleted_at", null)
            .select("*")
            .maybeSingle(),
        fetchCurrent: () =>
          education()
            .from("math_problems")
            .select("*")
            .eq("id", id)
            .is("deleted_at", null)
            .maybeSingle(),
      });
      if (result.status === "conflict") throw new Error("This problem changed elsewhere. Reload it before deleting.");
      if (result.status === "not_found") throw new Error("This problem is no longer available.");
    } catch (error) {
      throwQueryError("delete this Quick Math problem", error);
    }
  },
};

/** Runtime validation at the JSON editor boundary; JSON.parse returns unknown. */
export function parseJsonValue(value: string, field: string): Json {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isJsonValue(parsed)) {
      throw new Error(`${field} contains a value that cannot be stored as JSON.`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.includes("cannot be stored")) throw error;
    throw new Error(`${field} must be valid JSON: ${describeError(error)}`);
  }
}

function isJsonValue(value: unknown): value is Json {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return value !== null && typeof value === "object" && Object.values(value).every(isJsonValue);
}
