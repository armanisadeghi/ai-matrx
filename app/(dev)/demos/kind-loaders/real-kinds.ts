import "server-only";

/**
 * REAL kinds for the loader gallery — no invented rows.
 *
 * The gallery exists to answer two questions Arman actually asks: what does
 * each silhouette look like in each phase, and WHICH OF MY KINDS gets which
 * silhouette. The second question is only answerable against the live
 * registry, so this reads `content_ir.kind_definition` and resolves each kind
 * exactly the way the runtime does — declared slug when it names a real
 * library entry, otherwise derived from the kind's own emitted JSON Schema.
 *
 * The resolution is deliberately the SAME pure module the render path uses
 * (`infer-loading-slug`), not a second implementation, so what this page
 * shows and what a stream renders can never drift.
 */

import { createClient } from "@/utils/supabase/server";
import { inferLoadingSlugFromJsonSchema } from "@/features/content-ir/react/loading/infer-loading-slug";
import { isKnownKindLoadingSlug } from "@/features/content-ir/react/loading/kind-loading-slugs";

export interface RealKindRow {
  kind: string;
  label: string;
  /** The silhouette this kind actually resolves to (null = generic). */
  slug: string | null;
  origin: "declared" | "derived" | "generic";
  /** Declared but not a library slug — the defect the doctor reds. */
  invalidDeclared: string | null;
}

function readDeclared(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).loading_component;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Active kinds, newest first, resolved. Returns an empty list rather than
 * throwing — a demo page that 500s teaches nothing; the page says so instead.
 */
export async function loadRealKinds(limit = 60): Promise<{
  rows: RealKindRow[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("kind, label, metadata, emitted_json_schema")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) return { rows: [], error: error.message };

    const rows: RealKindRow[] = (data ?? []).map((row) => {
      const declared = readDeclared(row.metadata);
      if (declared && isKnownKindLoadingSlug(declared)) {
        return {
          kind: row.kind,
          label: row.label,
          slug: declared,
          origin: "declared" as const,
          invalidDeclared: null,
        };
      }
      const derived = inferLoadingSlugFromJsonSchema(row.emitted_json_schema);
      return {
        kind: row.kind,
        label: row.label,
        slug: derived,
        origin: derived ? ("derived" as const) : ("generic" as const),
        invalidDeclared: declared,
      };
    });

    return { rows, error: null };
  } catch (cause) {
    return {
      rows: [],
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
