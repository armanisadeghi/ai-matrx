// features/scopes/service/entityRows.ts
//
// THE GENERIC "CREATE A NEW ONE" NOW GOES THROUGH THE GENERIC DOOR.
//
// `@ai-matrx/associations/core`'s `createEntityRowsService` writes the registered entity table
// DIRECTLY — `dataSource.schema(info.schema).from(info.table).insert(...)` over PostgREST. That
// was the one generic write path on the platform, and the doors-only ruling (VERIFIER-8 HIGH-3;
// `platform` and `iam` are not client-writable) broke it silently for EVERY token whose table
// those two schemas hold, one closure at a time, for forty-four tables before anybody looked.
// The failure surfaces as a 42501 in a picker toast, which is exactly the kind of breakage a
// release never notices.
//
// So the host binds these two names to `public.entity_row_create` / `public.entity_row_rename`
// instead — one registry-driven SECURITY DEFINER door that resolves schema, table and title
// column from `platform.entity_types` (the same registry the package's generated file is
// emitted from), decides on the one ladder, and stamps `created_by` from `auth.uid()`. It also
// refuses BY NAME two things the direct path attempted and failed at: a token that is access
// machinery, and a token whose table has no `organization_id` column — which is
// `iam.organizations`, where the direct path had been answering `42703 column organization_id
// does not exist` for as long as the picker has passed an org. Creating an organization is
// `public.org_create`.
//
// THE PACKAGE SHOULD ADOPT THIS. `entityRows.ts` in `@ai-matrx/associations` is where this
// belongs long-term (THE SAME-SESSION LAW); it is bound here because the door had to exist
// before the package could call it, and a host seam is the honest place to cut over while the
// package catches up. Until then the package's direct path is unused by this app.

import type { CreateEntityRowArgs, EntityRowResult } from "@ai-matrx/associations/core";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { supabase } from "@/utils/supabase/client";

export type { CreateEntityRowArgs, EntityRowResult } from "@ai-matrx/associations/core";

export async function createEntityRow(
  token: EntityTypeToken,
  args: CreateEntityRowArgs,
): Promise<EntityRowResult> {
  const { data, error } = await supabase.rpc("entity_row_create", {
    p_token: token,
    p_title: args.title,
    p_organization_id: args.orgId ?? "",
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { id?: string; title?: string } | null;
  if (!row?.id) return { ok: false, error: "The door returned no record." };
  return { ok: true, data: { id: row.id, title: row.title ?? args.title } };
}

export async function renameEntityRow(
  token: EntityTypeToken,
  id: string,
  title: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("entity_row_rename", {
    p_token: token,
    p_id: id,
    p_title: title,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
