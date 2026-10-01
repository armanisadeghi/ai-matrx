/**
 * Server-side shape detail read — RLS-scoped with the VIEWER'S JWT (never the
 * admin RPC: the studio shows exactly what the user is allowed to see; the
 * privilege-complete gather stays in admin/shape-doctor-server.ts).
 */

import "server-only";
import { cache } from "react";

import { createClient } from "@/utils/supabase/server";
import { kindTitleKeyFromMetadata } from "./instance-title";
import {
  GENERATED_CONTRACT_FAMILY_VALUES,
  kindFamilyFromMetadata,
} from "@/features/content-ir/registry/schema-source-kind-tables";
import type { Json } from "@/types/database.types";

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
export interface ShapeDetail {
  id: string;
  kind: string;
  label: string;
  isActive: boolean;
  publishedToWeb: boolean;
  version: number;
  updatedAt: string;
  fieldData: Json | null;
  emittedJsonSchema: Json | null;
  /** `metadata.title_key` — the per-kind instance-title override (or null). */
  titleKey: string | null;
  /** `metadata.loading_component` — loading-library slug (or null/generic). */
  loadingComponent: string | null;
  /**
   * Family-derived render-leg exemption (generated-contract families:
   * action_io/tool_io/workflow_io/agent_io). The manual per-row
   * `metadata.data_only` flag this used to read was eradicated 2026-08-27
   * (Arman's ruling) — never read here or anywhere else.
   */
  dataOnly: boolean;
  /**
   * `metadata.family` verbatim — the Gate tab's render-leg doctrine reads it
   * to decide whether a render leg even applies to this kind.
   */
  family: string | null;
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
export const getShapeDetail = cache(async function getShapeDetail(
  kindSlug: string,
): Promise<ShapeDetail | null> {
  // Metadata and pages render alongside their layout, so the layout's sign-in
  // gate cannot protect this read. Share the request's settled identity first;
  // a second unpinned claims check can spend another auth budget and crash.
  const session = await getSessionVerdict();
  if (!session.isAuthenticated) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
        .schema("content_ir")
        .from("kind_definition")
        .select(
          "id,kind,label,is_active,published_to_web,version,updated_at,data,emitted_json_schema,metadata,created_by",
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
    publishedToWeb: data.published_to_web,
    version: data.version,
    updatedAt: data.updated_at,
    fieldData: data.data,
    emittedJsonSchema: data.emitted_json_schema,
    titleKey: kindTitleKeyFromMetadata(data.metadata),
    loadingComponent: metadataString(data.metadata, "loading_component"),
    dataOnly: GENERATED_CONTRACT_FAMILY_VALUES.has(
      kindFamilyFromMetadata(data.metadata) ?? "",
    ),
    family: kindFamilyFromMetadata(data.metadata),
    isOwnedByViewer: data.created_by === session.user.id,
  };
});
