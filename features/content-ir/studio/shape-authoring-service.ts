/**
 * Shape authoring service — the ONE browser mutation path for an existing
 * user-owned `content_ir.kind_definition` and its `kind_example` rows.
 *
 * Direct supabase-js is intentional: canonical RLS is the authorization
 * layer. Every mutation first proves `kind_definition.created_by` matches the
 * current user, then scopes the write to that definition. Definition updates
 * re-pin every live example to the trigger-bumped version immediately; leaving
 * examples silently stranded on an older version is never acceptable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";

export type ShapeWriteClient = SupabaseClient<Database>;
export type ShapeVisibility = Database["platform"]["Enums"]["visibility"];

export interface EditableShapeMetadata {
  titleKey: string | null;
  loadingComponent: string | null;
}

export interface UpdateOwnedShapeProfileArgs extends EditableShapeMetadata {
  definitionId: string;
  label: string;
  visibility: ShapeVisibility;
}

export interface ShapeProfileWriteResult {
  label: string;
  visibility: ShapeVisibility;
  version: number;
  metadata: Json;
  repinnedExampleCount: number;
}

export interface ShapeExampleWriteResult {
  id: string;
  label: string | null;
  description: string | null;
  isCanonical: boolean;
  validationStatus: string;
  kindVersion: number;
  data: Json;
  updatedAt: string;
}

interface OwnedDefinition {
  id: string;
  version: number;
  metadata: Json;
  organizationId: string;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isJsonObject(
  value: Json,
): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Merge only user-editable metadata keys while preserving every other key. */
export function mergeEditableShapeMetadata(
  metadata: Json,
  patch: EditableShapeMetadata,
): Json {
  const next: { [key: string]: Json | undefined } = isJsonObject(metadata)
    ? { ...metadata }
    : {};
  const titleKey = trimmedOrNull(patch.titleKey);
  const loadingComponent = trimmedOrNull(patch.loadingComponent);

  if (titleKey) next.title_key = titleKey;
  else delete next.title_key;

  if (loadingComponent) next.loading_component = loadingComponent;
  else delete next.loading_component;

  return next;
}

async function requireCurrentUserId(client: ShapeWriteClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error)
    throw new Error(`Failed to verify the signed-in user: ${error.message}`);
  if (!data.user) throw new Error("Not signed in — cannot edit this Shape.");
  return data.user.id;
}

async function fetchOwnedDefinition(
  client: ShapeWriteClient,
  definitionId: string,
  userId: string,
): Promise<OwnedDefinition> {
  const { data, error } = await client
    .schema("content_ir")
    .from("kind_definition")
    .select("id,version,metadata,organization_id")
    .eq("id", definitionId)
    .eq("created_by", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error)
    throw new Error(`Failed to load the owned Shape: ${error.message}`);
  if (!data) {
    throw new Error(
      "This Shape is not owned by the signed-in user, no longer exists, or is no longer editable.",
    );
  }
  return {
    id: data.id,
    version: data.version,
    metadata: data.metadata,
    organizationId: data.organization_id,
  };
}

function exampleResult(row: {
  id: string;
  label: string | null;
  description: string | null;
  is_canonical: boolean;
  validation_status: string;
  kind_version: number;
  data: Json;
  updated_at: string;
}): ShapeExampleWriteResult {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    isCanonical: row.is_canonical,
    validationStatus: row.validation_status,
    kindVersion: row.kind_version,
    data: row.data,
    updatedAt: row.updated_at,
  };
}

const EXAMPLE_RETURN_COLUMNS =
  "id,label,description,is_canonical,validation_status,kind_version,data,updated_at" as const;

/**
 * Update user-facing definition settings. The platform touch trigger bumps
 * `kind_definition.version`; this function then re-pins and revalidates every
 * live example before returning success.
 */
export async function updateOwnedShapeProfile(
  client: ShapeWriteClient,
  args: UpdateOwnedShapeProfileArgs,
): Promise<ShapeProfileWriteResult> {
  const userId = await requireCurrentUserId(client);
  const current = await fetchOwnedDefinition(client, args.definitionId, userId);
  const label = args.label.trim();
  if (!label) throw new Error("Shape name cannot be empty.");

  const metadata = mergeEditableShapeMetadata(current.metadata, args);
  const { data: updated, error: updateError } = await client
    .schema("content_ir")
    .from("kind_definition")
    .update({
      label,
      visibility: args.visibility,
      metadata,
      updated_by: userId,
    })
    .eq("id", current.id)
    .eq("created_by", userId)
    .eq("version", current.version)
    .select("label,visibility,version,metadata")
    .maybeSingle();
  if (updateError) {
    throw new Error(`Failed to update the Shape: ${updateError.message}`);
  }
  if (!updated) {
    throw new Error(
      "The Shape changed while you were editing it. Refresh the page and try again.",
    );
  }

  const { data: repinned, error: repinError } = await client
    .schema("content_ir")
    .from("kind_example")
    .update({ kind_version: updated.version, updated_by: userId })
    .eq("kind_definition_id", current.id)
    .is("deleted_at", null)
    .neq("kind_version", updated.version)
    .select("id,validation_status");
  if (repinError) {
    throw new Error(
      `The Shape profile saved as v${updated.version}, but its examples could not be re-pinned: ${repinError.message}. Refresh before making more changes.`,
    );
  }
  const failed = (repinned ?? []).filter(
    (row) => row.validation_status !== "passed",
  );
  if (failed.length > 0) {
    throw new Error(
      `The Shape profile saved as v${updated.version}, but ${failed.length} example${failed.length === 1 ? "" : "s"} failed revalidation. Fix the flagged example data before using this Shape.`,
    );
  }

  return {
    label: updated.label,
    visibility: updated.visibility,
    version: updated.version,
    metadata: updated.metadata,
    repinnedExampleCount: repinned?.length ?? 0,
  };
}

export interface CreateOwnedShapeExampleArgs {
  definitionId: string;
  data: unknown;
  label?: string | null;
  description?: string | null;
}

/** Insert an authored example; the first live example becomes canonical. */
export async function createOwnedShapeExample(
  client: ShapeWriteClient,
  args: CreateOwnedShapeExampleArgs,
): Promise<ShapeExampleWriteResult> {
  const userId = await requireCurrentUserId(client);
  const definition = await fetchOwnedDefinition(
    client,
    args.definitionId,
    userId,
  );
  const { count, error: countError } = await client
    .schema("content_ir")
    .from("kind_example")
    .select("id", { count: "exact", head: true })
    .eq("kind_definition_id", definition.id)
    .is("deleted_at", null);
  if (countError) {
    throw new Error(
      `Failed to inspect existing examples: ${countError.message}`,
    );
  }

  const { data: row, error } = await client
    .schema("content_ir")
    .from("kind_example")
    .insert({
      kind_definition_id: definition.id,
      kind_version: definition.version,
      organization_id: definition.organizationId,
      created_by: userId,
      data: args.data as Json,
      label: trimmedOrNull(args.label),
      description: trimmedOrNull(args.description),
      is_canonical: (count ?? 0) === 0,
      source: "authored",
    })
    .select(EXAMPLE_RETURN_COLUMNS)
    .single();
  if (error) throw new Error(`Failed to create the example: ${error.message}`);
  return exampleResult(row);
}

export interface UpdateOwnedShapeExampleArgs extends CreateOwnedShapeExampleArgs {
  exampleId: string;
}

/** Replace an owned example's payload/details and read the trigger verdict. */
export async function updateOwnedShapeExample(
  client: ShapeWriteClient,
  args: UpdateOwnedShapeExampleArgs,
): Promise<ShapeExampleWriteResult> {
  const userId = await requireCurrentUserId(client);
  const definition = await fetchOwnedDefinition(
    client,
    args.definitionId,
    userId,
  );
  const { data: row, error } = await client
    .schema("content_ir")
    .from("kind_example")
    .update({
      data: args.data as Json,
      label: trimmedOrNull(args.label),
      description: trimmedOrNull(args.description),
      kind_version: definition.version,
      updated_by: userId,
    })
    .eq("id", args.exampleId)
    .eq("kind_definition_id", definition.id)
    .is("deleted_at", null)
    .select(EXAMPLE_RETURN_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Failed to update the example: ${error.message}`);
  if (!row) throw new Error("The example no longer exists or is not editable.");
  return exampleResult(row);
}

/**
 * Soft-delete a non-canonical example. Canonical deletion is deliberately
 * refused until another example is promoted, preserving R4's canonical row.
 */
export async function softDeleteOwnedShapeExample(
  client: ShapeWriteClient,
  definitionId: string,
  exampleId: string,
): Promise<void> {
  const userId = await requireCurrentUserId(client);
  await fetchOwnedDefinition(client, definitionId, userId);
  const { data, error } = await client
    .schema("content_ir")
    .from("kind_example")
    .update({ deleted_at: new Date().toISOString(), updated_by: userId })
    .eq("id", exampleId)
    .eq("kind_definition_id", definitionId)
    .eq("is_canonical", false)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Failed to delete the example: ${error.message}`);
  if (!data) {
    throw new Error(
      "The canonical example cannot be deleted. Make another example canonical first.",
    );
  }
}

/** Promote one example to canonical, rolling the previous flag back on error. */
export async function makeOwnedShapeExampleCanonical(
  client: ShapeWriteClient,
  definitionId: string,
  exampleId: string,
): Promise<void> {
  const userId = await requireCurrentUserId(client);
  await fetchOwnedDefinition(client, definitionId, userId);
  const { data: previous, error: readError } = await client
    .schema("content_ir")
    .from("kind_example")
    .select("id")
    .eq("kind_definition_id", definitionId)
    .eq("is_canonical", true)
    .is("deleted_at", null);
  if (readError) {
    throw new Error(
      `Failed to inspect the canonical example: ${readError.message}`,
    );
  }

  const previousIds = (previous ?? []).map((row) => row.id);
  if (previousIds.includes(exampleId)) return;

  const { error: clearError } = await client
    .schema("content_ir")
    .from("kind_example")
    .update({ is_canonical: false, updated_by: userId })
    .eq("kind_definition_id", definitionId)
    .eq("is_canonical", true)
    .is("deleted_at", null);
  if (clearError) {
    throw new Error(
      `Failed to replace the canonical example: ${clearError.message}`,
    );
  }

  const { data: promoted, error: promoteError } = await client
    .schema("content_ir")
    .from("kind_example")
    .update({ is_canonical: true, updated_by: userId })
    .eq("id", exampleId)
    .eq("kind_definition_id", definitionId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (promoteError || !promoted) {
    let rollbackError: string | null = null;
    if (previousIds.length > 0) {
      const { error } = await client
        .schema("content_ir")
        .from("kind_example")
        .update({ is_canonical: true, updated_by: userId })
        .in("id", previousIds);
      rollbackError = error?.message ?? null;
    }
    throw new Error(
      `Failed to make the example canonical: ${promoteError?.message ?? "example no longer exists"}.${rollbackError ? ` Restoring the previous canonical example also failed: ${rollbackError}.` : " The previous canonical example was restored."}`,
    );
  }
}

/**
 * Fix-the-sample retry used by the schema-proposal creation dialog. Kept in
 * this canonical service so post-create and ongoing authoring never fork the
 * same example-data update primitive.
 */
export async function updateShapeExampleSample(
  client: ShapeWriteClient,
  exampleId: string,
  sample: unknown,
): Promise<string> {
  const { data, error } = await client
    .schema("content_ir")
    .from("kind_example")
    .update({ data: sample as Json })
    .eq("id", exampleId)
    .select("validation_status")
    .single();
  if (error) throw new Error(`Failed to update the example: ${error.message}`);
  return data.validation_status;
}
