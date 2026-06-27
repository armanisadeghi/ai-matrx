/**
 * fetchEmitRendererRow — load a workflow node's DB-stored emit renderer source.
 *
 * Reads the single active `tool_ui` row whose `tool_name` matches the event's
 * `component_ref`, pinned to the workflow surface. There is NO contract / v1 /
 * v2 branching: every emit renderer consumes the canonical `EmitRendererProps`
 * contract, full stop. Returns `null` when no active row exists or the row has
 * no code — the caller treats that as "this node has no custom renderer" and
 * falls back to the `GenericEmitRenderer`.
 *
 * Mirrors `tool-call-visualization/db-renderer/fetchToolRendererRow.ts` (same
 * `tool_ui` table, same query shape), differing only in surface
 * (`WORKFLOW_EMIT_SURFACE`) and in NOT reading the tool-call shell-label
 * columns — an emit renderer has no collapsed-row label to carry.
 */
import { supabase } from "@/utils/supabase/client";
import { WORKFLOW_EMIT_SURFACE } from "./surface";

export interface EmitRendererRow {
  inline_code: string;
  allowed_imports: string[];
}

export async function fetchEmitRendererRow(
  componentRef: string,
): Promise<EmitRendererRow | null> {
  const { data, error } = await supabase
    .schema("tool").from("ui")
    .select("inline_code, allowed_imports")
    .eq("tool_name", componentRef)
    .eq("surface_name", WORKFLOW_EMIT_SURFACE)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    // A real query failure (network, RLS, malformed) is loud — a missing row
    // is NOT an error (maybeSingle returns null data, no error). Surfacing it
    // here lets the caller negative-cache and fall back without crashing.
    console.error(
      `[fetchEmitRendererRow] failed to load tool_ui for "${componentRef}":`,
      error,
    );
    return null;
  }

  if (!data || !data.inline_code) return null;

  const allowedImports = Array.isArray(data.allowed_imports)
    ? data.allowed_imports.filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return {
    inline_code: data.inline_code,
    allowed_imports: allowedImports,
  };
}
