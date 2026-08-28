/**
 * The kind side of the served run form: everything `resolveVariantComponent`
 * needs to answer "which component renders this input", loaded ONCE for the
 * whole form.
 *
 * INPUT-SURFACE.md §"Presentation variants": the hint lives ON THE KIND as a
 * NAMED variant; the input only selects one by name. So the form reads the
 * kind registry — `content_ir.kind_definition.variants` plus the kind's
 * default EXTRACTION component (`content_ir.kind_component`, role `input`,
 * `is_default`) — and hands both to the shared resolver. It never invents a
 * component from anything written on the input.
 *
 * Direct supabase-js read, per platform doctrine (pure UI↔DB, no Python hop).
 * RLS is the ceiling. A read that fails does NOT take the form down: the
 * resolver's last rung (the value-type-derived default) still renders every
 * input, and the failure is reported to the caller so it can be shown rather
 * than swallowed.
 */

import { supabase } from "@/utils/supabase/client";
import type { VariantResolvableKind } from "@/features/content-ir/variants/kind-variants";
import type { ContextValueType } from "@/features/scope-system/redux/contextItemsSlice";

/** JSON Schema `type` → the storage value type the resolver's last rung reads. */
export function valueTypeFromJsonSchema(
  jsonSchema: Record<string, unknown> | null | undefined,
): ContextValueType {
  const type = jsonSchema?.type;
  switch (type) {
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    case "array":
      return "array";
    default:
      return "string";
  }
}

export interface KindSourceResult {
  /** kind slug → what the resolver reads from the kind. */
  kinds: Record<string, VariantResolvableKind>;
  /**
   * LOUD: the registry read failed. Every input still renders (the resolver
   * falls to its value-type default) but named variants cannot resolve, so
   * the surface must say so instead of quietly showing plain textareas.
   */
  error: string | null;
}

interface KindDefRow {
  id: string;
  kind: string;
  variants: unknown;
}

interface KindComponentRow {
  kind_definition_id: string;
  component_key: string;
}

/**
 * Load the registry rows for exactly the kinds this form addresses. Two
 * queries, both `.in(...)`-scoped — a run form addresses a handful of kinds,
 * never the catalog.
 */
export async function loadKindSources(
  kindSlugs: readonly string[],
): Promise<KindSourceResult> {
  const slugs = Array.from(new Set(kindSlugs)).filter(Boolean);
  if (slugs.length === 0) return { kinds: {}, error: null };

  const { data: defs, error: defError } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id,kind,variants")
    .in("kind", slugs)
    .is("deleted_at", null);

  if (defError) {
    return {
      kinds: {},
      error: `Could not read the kind registry (content_ir.kind_definition): ${defError.message}`,
    };
  }

  const rows = (defs ?? []) as KindDefRow[];
  const kinds: Record<string, VariantResolvableKind> = {};
  for (const row of rows) {
    // A duplicate slug is a data defect the registry reader already screams
    // about; here the first row wins so the form still renders.
    if (kinds[row.kind]) continue;
    kinds[row.kind] = { kind: row.kind, variants: row.variants };
  }

  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    const { data: components, error: componentError } = await supabase
      .schema("content_ir")
      .from("kind_component")
      .select("kind_definition_id,component_key")
      .in("kind_definition_id", ids)
      .eq("role", "input")
      .eq("platform", "web")
      .eq("is_default", true)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (componentError) {
      return {
        kinds,
        error: `Could not read the kinds' default input components (content_ir.kind_component): ${componentError.message}`,
      };
    }
    const byId = new Map(rows.map((r) => [r.id, r.kind]));
    for (const component of (components ?? []) as KindComponentRow[]) {
      const slug = byId.get(component.kind_definition_id);
      if (slug && kinds[slug]) {
        kinds[slug].defaultInputComponentKey = component.component_key;
      }
    }
  }

  const unknown = slugs.filter((s) => !kinds[s]);
  return {
    kinds,
    error:
      unknown.length > 0
        ? `No live content_ir.kind_definition row for kind${unknown.length > 1 ? "s" : ""} ${unknown
            .map((k) => `"${k}"`)
            .join(", ")} — a registry gap: every input IS a kind.`
        : null,
  };
}
