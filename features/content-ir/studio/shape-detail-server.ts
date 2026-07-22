/**
 * Server-side shape detail read — RLS-scoped with the VIEWER'S JWT (never the
 * admin RPC: the studio shows exactly what the user is allowed to see; the
 * privilege-complete gather stays in admin/shape-doctor-server.ts).
 */

import "server-only";

import { createClient } from "@/utils/supabase/server";
import { kindTitleKeyFromMetadata } from "./instance-title";
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
  /** `metadata.title_key` — the per-kind instance-title override (or null). */
  titleKey: string | null;
  /** `metadata.loading_component` — loading-library slug (or null/generic). */
  loadingComponent: string | null;
  /** True only when `created_by` is the viewer; grants do not imply ownership. */
  isOwnedByViewer: boolean;
}

function metadataString(metadata: Json, key: string): string | null {
  const record =
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  if (!record) return null;
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Null on missing / RLS-denied — the route 404s. Throws on a real DB error. */
export async function getShapeDetail(
  kindSlug: string,
): Promise<ShapeDetail | null> {
  const supabase = await createClient();
  const [{ data, error }, { data: auth, error: authError }] = await Promise.all(
    [
      supabase
        .schema("content_ir")
        .from("kind_definition")
        .select(
          "id,kind,label,is_active,visibility,version,updated_at,data,emitted_json_schema,metadata,created_by",
        )
        .eq("kind", kindSlug)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase.auth.getUser(),
    ],
  );
  if (error) {
    throw new Error(`Failed to load shape "${kindSlug}": ${error.message}`);
  }
  if (authError) {
    throw new Error(`Failed to verify the Shape viewer: ${authError.message}`);
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
    titleKey: kindTitleKeyFromMetadata(data.metadata),
    loadingComponent: metadataString(data.metadata, "loading_component"),
    isOwnedByViewer: Boolean(auth.user && data.created_by === auth.user.id),
  };
}
