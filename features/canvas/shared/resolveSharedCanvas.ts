/**
 * The ONE resolver for a shared canvas by URL param — server- and client-safe.
 *
 * `/canvas/shared/[param]` accepts two identifiers:
 *   - a canonical share-link token (`platform.share_links`, resolved through the
 *     anon `resolve_share_token` RPC — the token IS the authorization, and the
 *     registry's `public_columns` allowlist bounds what ships to the visitor);
 *   - a row UUID (the public-visibility lane: discovery-gallery items are
 *     anon-readable via `pub_read` RLS, so a public canvas needs no secret).
 *
 * The bespoke `canvas.shared_canvas_items.share_token` lane was converged onto
 * `platform.share_links` on 2026-08-12 (existing token values preserved, so old
 * URLs resolve here through the RPC). Never query a canvas by token directly.
 * See migrations/canvas_share_convergence_onto_share_links.sql.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveShareToken } from "@/utils/permissions/shareLinks";
import type { SharedCanvasItem } from "@/types/canvas-social";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveSharedCanvas(
  tokenOrId: string,
  client: SupabaseClient,
): Promise<SharedCanvasItem | null> {
  if (UUID_RE.test(tokenOrId)) {
    const { data } = await client
      .schema("canvas")
      .from("shared_canvas_items")
      .select("*")
      .is("deleted_at", null)
      .eq("id", tokenOrId)
      .maybeSingle();
    return (data as SharedCanvasItem | null) ?? null;
  }

  const resolved = await resolveShareToken(tokenOrId, client);
  if (
    !resolved.success ||
    resolved.resourceType !== "shared_canvas_item" ||
    !resolved.resource
  ) {
    return null;
  }
  return { id: resolved.resourceId, ...resolved.resource } as SharedCanvasItem;
}
