/**
 * Moving a site between organizations — the client half of FOUND_DEFECTS D133.
 *
 * A site's `organization_id` is denormalized onto ~60 child tables, so this is
 * NEVER a client-side update. Both calls below are thin wrappers over the one
 * SECURITY DEFINER mutation path (`migrations/web_move_site_to_organization.sql`);
 * there is no second way to do this and there must never be one.
 */

import { createClient } from "@/utils/supabase/client";

export type BrandAction = "move_brand" | "detach" | "keep";

export interface MovePreviewTable {
  table: string;
  rows: number;
  reason?: string;
}

export interface MovePreviewBrand {
  id: string;
  name: string;
  organization_id: string;
  /** Live sibling sites under the same brand — moving it would take them too. */
  other_sites: number;
}

export interface SiteMovePreview {
  site_id: string;
  site_name: string;
  organization_id: string;
  moved_tables: MovePreviewTable[];
  preserved_tables: MovePreviewTable[];
  rows_moved: number;
  brand: MovePreviewBrand | null;
}

export interface SiteMoveResult {
  moved: boolean;
  reason?: string;
  site_id: string;
  site_name: string;
  from_organization_name?: string;
  organization_id: string;
  organization_name: string;
  moved_tables: MovePreviewTable[];
  preserved_tables: MovePreviewTable[];
  rows_moved: number;
  brand: {
    action: "moved" | "detached" | "kept";
    id: string;
    name: string;
    warning?: string;
  } | null;
}

export async function previewSiteOrganizationMove(
  siteId: string,
): Promise<SiteMovePreview> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("preview_site_organization_move", {
    p_site_id: siteId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as SiteMovePreview;
}

export interface MoveSiteInput {
  siteId: string;
  targetOrganizationId: string;
  /** Compare-and-swap on web.site.version, so a stale tab cannot move a site. */
  expectedVersion: number;
  /**
   * Required whenever the site's brand would be left in another organization —
   * a brand CONTAINS its sites and conveys access to them, so leaving one
   * behind keeps the old organization reading the moved site. The RPC refuses
   * rather than guessing.
   */
  brandAction?: BrandAction;
}

export async function moveSiteToOrganization(
  input: MoveSiteInput,
): Promise<SiteMoveResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("move_site_to_organization", {
    p_site_id: input.siteId,
    p_target_organization_id: input.targetOrganizationId,
    p_expected_version: input.expectedVersion,
    ...(input.brandAction ? { p_brand_action: input.brandAction } : {}),
  });
  if (error) throw new Error(error.message);
  return data as unknown as SiteMoveResult;
}
