/**
 * Share links — the canonical no-login sharing service.
 *
 * A share link is an opaque token that lets ANYONE (no sign-in) view a specific
 * resource. The token is the authorization: the anon-callable
 * `resolve_share_token` RPC (SECURITY DEFINER) bypasses `iam.has_access` and
 * returns the resource content. Minting/listing/revoking are owner-gated.
 *
 * Every write routes through a SECURITY DEFINER RPC — never touch
 * `platform.share_links` directly from the client. See
 * `migrations/share_links_canonical_system.sql` and features/sharing/FEATURE.md.
 */
import { supabase } from "@/utils/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResourceType } from "./registry";
import type { PermissionLevel } from "./types";

export interface ShareLink {
  id: string;
  token: string;
  permissionLevel: PermissionLevel;
  label: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  isActive: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export interface ResolvedShareToken {
  success: boolean;
  /** Machine error code when success=false (not_found | revoked | expired | exhausted | gone | unknown_type). */
  error?: string;
  /** Human-readable message when success=false. */
  message?: string;
  resourceType?: string;
  resourceId?: string;
  permissionLevel?: PermissionLevel;
  displayLabel?: string;
  urlPathTemplate?: string;
  /** The resource row as JSON (internal/heavy columns stripped). */
  resource?: Record<string, unknown>;
}

interface CreateShareLinkOptions {
  resourceType: ResourceType;
  resourceId: string;
  permissionLevel?: PermissionLevel;
  expiresAt?: string | null;
  maxUses?: number | null;
  label?: string | null;
}

/** Build the absolute share URL for a token. */
export function shareLinkUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/s/${token}`;
}

/** Mint a share link for a resource (owner-only). Returns the token + URL. */
export async function createShareLink(
  options: CreateShareLinkOptions,
): Promise<{ success: boolean; token?: string; url?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("create_share_link", {
      p_resource_type: options.resourceType,
      p_resource_id: options.resourceId,
      p_permission_level: options.permissionLevel ?? "viewer",
      p_expires_at: options.expiresAt ?? undefined,
      p_max_uses: options.maxUses ?? undefined,
      p_label: options.label ?? undefined,
    });
    if (error) return { success: false, error: error.message };
    const res = data as { success: boolean; token?: string; error?: string };
    if (!res?.success || !res.token) {
      return { success: false, error: res?.error ?? "Failed to create link" };
    }
    return { success: true, token: res.token, url: shareLinkUrl(res.token) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create link",
    };
  }
}

/** List a resource's share links (owner-only). */
export async function listShareLinks(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ShareLink[]> {
  const { data, error } = await supabase.rpc("list_share_links", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
  });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    token: r.token as string,
    permissionLevel: r.permission_level as PermissionLevel,
    label: (r.label as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    maxUses: (r.max_uses as number | null) ?? null,
    useCount: (r.use_count as number) ?? 0,
    isActive: (r.is_active as boolean) ?? false,
    createdAt: (r.created_at as string | null) ?? null,
    lastUsedAt: (r.last_used_at as string | null) ?? null,
  }));
}

/** Revoke (deactivate) a share link by id (owner-only). */
export async function revokeShareLink(
  linkId: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("revoke_share_link", {
    p_link_id: linkId,
  });
  if (error) return { success: false, error: error.message };
  const res = data as { success: boolean; error?: string };
  return { success: !!res?.success, error: res?.error };
}

/**
 * Resolve a share token to its resource. Anon-safe. Pass a server client from a
 * Server Component (public `/s/[token]` route); defaults to the browser client.
 */
export async function resolveShareToken(
  token: string,
  client: SupabaseClient = supabase as unknown as SupabaseClient,
): Promise<ResolvedShareToken> {
  const { data, error } = await client.rpc("resolve_share_token", {
    p_token: token,
  });
  if (error) {
    return { success: false, error: "not_found", message: "This link is invalid." };
  }
  const res = data as Record<string, unknown>;
  return {
    success: !!res?.success,
    error: res?.error as string | undefined,
    message: res?.message as string | undefined,
    resourceType: res?.resource_type as string | undefined,
    resourceId: res?.resource_id as string | undefined,
    permissionLevel: res?.permission_level as PermissionLevel | undefined,
    displayLabel: res?.display_label as string | undefined,
    urlPathTemplate: res?.url_path_template as string | undefined,
    resource: res?.resource as Record<string, unknown> | undefined,
  };
}
