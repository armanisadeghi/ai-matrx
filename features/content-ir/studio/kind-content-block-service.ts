/**
 * Kind content-block persistence — the client seam for storing a DERIVED
 * teaching block (from `kind-content-block-generator.ts`) into
 * `skill.render_definition` (the canonical content/render-block table; the
 * old public content_blocks table is retired — see scripts/dead-relations.json).
 *
 * Two authorization worlds, ONE generator feeding both:
 *   - admin (platform kinds): the block lives in the system org, which no user
 *     can write via RLS, so it goes through the `is_super_admin()`-gated
 *     `content_ir.admin_upsert_kind_content_block` RPC (upsert by the globally
 *     unique block_id — create AND regenerate in one call; writes
 *     skill.render_definition with block_type 'render_kind').
 *   - owner (user shapes on /shapes): RLS already permits the owner to write
 *     their own block, so that path is a direct supabase upsert-by-block_id
 *     below (same table, same block_type).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as browserSupabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Database } from "@/types/database.types";
import type { GeneratedContentBlock } from "@/features/content-ir/registry/kind-content-block-generator";

export interface AdminUpsertContentBlockResult {
  id: string;
  blockId: string;
  label: string;
  isActive: boolean;
}

/**
 * Store (or regenerate in place) a platform kind's teaching content block.
 * Super-admin only — the RPC raises `42501` for anyone else, surfaced verbatim.
 */
export async function adminUpsertKindContentBlock(
  client: SupabaseClient<Database>,
  args: { kindDefinitionId: string; block: GeneratedContentBlock },
): Promise<AdminUpsertContentBlockResult> {
  const { kindDefinitionId, block } = args;
  const { data, error } = await client
    .schema("content_ir")
    .rpc("admin_upsert_kind_content_block", {
      p_kind_definition_id: kindDefinitionId,
      p_block_id: block.blockId,
      p_label: block.label,
      p_description: block.description,
      p_icon_name: block.iconName,
      p_template: block.template,
      p_metadata: { tier: block.tier },
    });
  if (error) {
    throw new Error(error.message);
  }
  const row =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return {
    id: typeof row.id === "string" ? row.id : "",
    blockId: typeof row.block_id === "string" ? row.block_id : block.blockId,
    label: typeof row.label === "string" ? row.label : block.label,
    isActive: row.is_active === true,
  };
}

/**
 * Store (or update in place) a content block for a USER-OWNED shape — a
 * direct supabase upsert into `skill.render_definition`. RLS already lets the
 * owner write their own block, so no RPC. Upserts by the deterministic
 * block_id (globally unique among live rows because kind slugs are globally
 * unique) so regenerate never duplicates.
 */
export async function ownerUpsertKindContentBlock(
  block: GeneratedContentBlock,
): Promise<void> {
  const { data: userData } = await browserSupabase.auth.getUser();
  const userId = userData?.user?.id ?? null;

  const { data: existing, error: findError } = await browserSupabase
    .schema("skill")
    .from("render_definition")
    .select("id")
    .eq("block_id", block.blockId)
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) {
    throw new Error(
      `Failed to look up your content block: ${findError.message}`,
    );
  }

  const fields = {
    block_id: block.blockId,
    label: block.label,
    description: block.description,
    icon_name: block.iconName,
    template: block.template,
    block_type: "render_kind",
    is_active: true,
    metadata: { tier: block.tier, generated: true },
  };

  const { error } = existing
    ? await browserSupabase
        .schema("skill")
        .from("render_definition")
        .update(fields)
        .eq("id", existing.id)
    : await browserSupabase
        .schema("skill")
        .from("render_definition")
        .insert({
          ...fields,
          organization_id: await ensureOrgId(undefined),
          created_by: userId,
          visibility: "personal",
        });
  if (error) {
    throw new Error(`Failed to store the content block: ${error.message}`);
  }
}
