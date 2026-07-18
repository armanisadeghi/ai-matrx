/**
 * Server-side shape detail read — RLS-scoped with the VIEWER'S JWT (never the
 * admin RPC: the studio shows exactly what the user is allowed to see; the
 * privilege-complete gather stays in admin/shape-doctor-server.ts).
 */

import "server-only";

import { createClient } from "@/utils/supabase/server";
import type { Json } from "@/types/database.types";

export interface ShapeDetail {
  id: string;
  kind: string;
  label: string;
  isActive: boolean;
  visibility: string;
  version: number;
  updatedAt: string;
  fieldData: Json | null;
  emittedJsonSchema: Json | null;
}

/** Null on missing / RLS-denied — the route 404s. Throws on a real DB error. */
export async function getShapeDetail(
  kindSlug: string,
): Promise<ShapeDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select(
      "id,kind,label,is_active,visibility,version,updated_at,data,emitted_json_schema",
    )
    .eq("kind", kindSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load shape "${kindSlug}": ${error.message}`);
  }
  if (!data) return null;
  return {
    id: data.id,
    kind: data.kind,
    label: data.label,
    isActive: data.is_active,
    visibility: data.visibility,
    version: data.version,
    updatedAt: data.updated_at,
    fieldData: data.data,
    emittedJsonSchema: data.emitted_json_schema,
  };
}
