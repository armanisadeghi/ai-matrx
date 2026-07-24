/**
 * Kind content-block persistence — the client seam for storing a DERIVED
 * teaching block (from `kind-content-block-generator.ts`) into
 * `public.content_blocks`.
 *
 * Two authorization worlds, ONE generator feeding both:
 *   - admin (platform kinds): the block lives in the system org, which no user
 *     can write via RLS, so it goes through the `is_super_admin()`-gated
 *     `content_ir.admin_upsert_kind_content_block` RPC (upsert by the globally
 *     unique block_id — create AND regenerate in one call).
 *   - owner (user shapes on /shapes): RLS already permits the owner to write
 *     their own block, so those surfaces use the canonical
 *     agent-content-blocks redux thunks directly (no RPC).
 *
 * This module owns only the admin RPC path; the owner path stays on the
 * canonical thunks it already shares with the rest of the shortcuts system.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
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
 * Store (or update in place) a content block for a USER-OWNED shape via the
 * canonical agent-content-blocks API at user scope — RLS already lets the owner
 * write their own block, so no RPC. Upserts by the deterministic block_id
 * (unique per user because kind slugs are globally unique) so regenerate never
 * duplicates.
 */
export async function ownerUpsertKindContentBlock(
  block: GeneratedContentBlock,
): Promise<void> {
  const listRes = await fetch("/api/agent-content-blocks?scope=user", {
    method: "GET",
  });
  if (!listRes.ok) {
    throw new Error(`Failed to load your content blocks (${listRes.status}).`);
  }
  const list = (await listRes.json()) as { data?: Array<{ id: string; block_id: string }> };
  const existing = (list.data ?? []).find((r) => r.block_id === block.blockId);

  const fields = {
    block_id: block.blockId,
    label: block.label,
    description: block.description,
    icon_name: block.iconName,
    template: block.template,
    is_active: true,
  };

  const res = existing
    ? await fetch(`/api/agent-content-blocks/${existing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      })
    : await fetch("/api/agent-content-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "user", ...fields }),
      });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(
      (detail as { details?: string; error?: string }).details ??
        (detail as { error?: string }).error ??
        `Failed to store the content block (${res.status}).`,
    );
  }
}
