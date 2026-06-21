/**
 * fetchToolRendererRow — load a tool's DB-stored renderer source.
 *
 * Reads the single active `tool_ui` row for a tool name. There is NO
 * `contract_version` / v1 / v2 branching here: every renderer consumes the
 * canonical `ToolRendererProps` contract, full stop. Returns `null` when no
 * active row exists or the row has no code — the caller treats that as "this
 * tool has no DB renderer" and falls back to the GenericRenderer.
 */
import { supabase } from "@/utils/supabase/client";
import { WEB_TOOL_UI_SURFACE } from "./surface";

export interface ToolRendererRow {
  inline_code: string;
  allowed_imports: string[];
  /** Author-declared label for the collapsed shell line (e.g. "Weather"). */
  display_name: string | null;
  /** Author-declared noun for the result tab/overlay (e.g. "entries"). */
  results_label: string | null;
  /** Author-declared subtitle code: `(entry, events) => string` (optional). */
  header_subtitle_code: string | null;
}

export async function fetchToolRendererRow(
  toolName: string,
): Promise<ToolRendererRow | null> {
  const { data, error } = await supabase
    .from("tool_ui")
    .select(
      "inline_code, allowed_imports, display_name, results_label, header_subtitle_code",
    )
    .eq("tool_name", toolName)
    .eq("surface_name", WEB_TOOL_UI_SURFACE)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    // A real query failure (network, RLS, malformed) is loud — a missing row
    // is NOT an error (maybeSingle returns null data, no error). Surfacing it
    // here lets the caller negative-cache and fall back without crashing chat.
    console.error(
      `[fetchToolRendererRow] failed to load tool_ui for "${toolName}":`,
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
    display_name:
      typeof data.display_name === "string" ? data.display_name : null,
    results_label:
      typeof data.results_label === "string" ? data.results_label : null,
    header_subtitle_code:
      typeof data.header_subtitle_code === "string"
        ? data.header_subtitle_code
        : null,
  };
}
