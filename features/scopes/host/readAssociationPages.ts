import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";

export type PagedAssociationRpc = "assoc_for_entity" | "assoc_for_sources" | "assoc_for_targets" | "assoc_members_visible";

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string") throw new Error(`Missing association argument: ${name}`);
  return value;
}

function idsArg(args: Record<string, unknown>, name: string): string[] {
  const value = args[name];
  if (!Array.isArray(value) || !value.every((id): id is string => typeof id === "string")) {
    throw new Error(`Invalid association argument: ${name}`);
  }
  return value;
}

/** Page at the host port so every package consumer receives the complete edge list. */
export async function readAssociationPages(fn: PagedAssociationRpc, args: Record<string, unknown>) {
  if (fn === "assoc_for_entity") {
    const input = { p_type: stringArg(args, "p_type"), p_id: stringArg(args, "p_id") };
    return { data: await readAllRows(async ({ from, to }) => {
      const result = await supabase.rpc(fn, input, { count: "exact" })
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }).order("id").range(from, to);
      // Keep structured PostgREST codes for the package error classifier.
      if (result.error) throw result.error;
      return result;
    }, { label: fn }), error: null };
  }
  if (fn === "assoc_for_sources") {
    const input = {
      p_source_type: stringArg(args, "p_source_type"),
      p_source_ids: idsArg(args, "p_source_ids"),
      ...(typeof args.p_target_type === "string" ? { p_target_type: args.p_target_type } : {}),
    };
    return { data: await readAllRows(async ({ from, to }) => {
      const result = await supabase.rpc(fn, input, { count: "exact" })
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }).order("id").range(from, to);
      // Keep structured PostgREST codes for the package error classifier.
      if (result.error) throw result.error;
      return result;
    }, { label: fn }), error: null };
  }
  const input = { p_target_type: stringArg(args, "p_target_type"), p_target_ids: idsArg(args, "p_target_ids") };
  return { data: await readAllRows(async ({ from, to }) => {
      const result = await supabase.rpc(fn, input, { count: "exact" })
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }).order("id").range(from, to);
      // Keep structured PostgREST codes for the package error classifier.
      if (result.error) throw result.error;
      return result;
    }, { label: fn }), error: null };
}
