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
import { isJsonObject } from "@/types/json";
import { operationFailed } from "@/utils/errors";

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

export interface ShareCapabilities {
  /** Whether the resource type can be made public (has a visibility/public column). */
  supportsPublic: boolean;
  /** Whether the resource type offers no-login share links (admin policy). */
  isLinkShareable: boolean;
  /** Verified physical storage for the public/private state; null means unsupported. */
  publicState:
    | {
        column: "visibility" | "card_visibility";
        kind: "enum";
      }
    | {
        column: string;
        kind: "boolean";
      }
    | null;
}

/**
 * What share affordances this resource type supports — drives which controls the
 * ShareModal shows (never render a toggle that would error on click). Admin-
 * editable, so read at runtime (not from the static registry mirror).
 */
export async function getShareCapabilities(
  resourceType: ResourceType,
): Promise<ShareCapabilities> {
  const { data, error } = await supabase.rpc("get_share_capabilities", {
    p_resource_type: resourceType,
  });
  if (error) {
    throw operationFailed("check this item's sharing options", error);
  }
  if (!isJsonObject(data)) {
    throw operationFailed("check this item's sharing options");
  }

  const column = data.public_state_column;
  const kind = data.public_state_kind;
  const publicState: ShareCapabilities["publicState"] =
    kind === "enum" && (column === "visibility" || column === "card_visibility")
      ? { column, kind }
      : kind === "boolean" && typeof column === "string"
        ? { column, kind }
        : null;

  return {
    supportsPublic: data.supports_public === true && publicState !== null,
    isLinkShareable: data.is_link_shareable === true,
    publicState,
  };
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

export interface ForkResult {
  success: boolean;
  error?: string;
  /** Path to open the caller's new copy in the app. */
  path?: string;
}

/**
 * "Save a copy & use it" — fork a SHARED resource into the current user's own
 * account so a recipient can continue/use it (chat takeover, study a set, take a
 * quiz). Requires auth.
 *
 * `shareToken` is the no-login share-link token, passed ONLY when the viewer is
 * on the `/s/[token]` link lane. The DB RPCs authorize a link fork solely on a
 * VALID, ACTIVE token for THAT resource (SECURITY FIX — a caller-independent
 * "any active link exists" check previously let a stranger fork a private
 * resource the moment its owner had ever minted one link). Public/link
 * visibility and explicit grants stay forkable token-less; the token is only
 * needed to authorize a private resource shared purely by no-login link. Returns
 * the path to the copy.
 */
export async function forkSharedResource(
  resourceType: string,
  resourceId: string,
  shareToken?: string,
): Promise<ForkResult> {
  try {
    if (resourceType === "conversation") {
      const { data, error } = await supabase.rpc("fork_shared_conversation", {
        p_conversation_id: resourceId,
        p_token: shareToken ?? undefined,
      });
      if (error) return { success: false, error: error.message };
      const r = data as {
        success: boolean;
        error?: string;
        conversation_id?: string;
      };
      return r?.success
        ? { success: true, path: `/chat/${r.conversation_id}` }
        : { success: false, error: r?.error };
    }
    if (resourceType === "fc_set") {
      const { data, error } = await supabase.rpc("fork_shared_flashcard_set", {
        p_set_id: resourceId,
        p_token: shareToken ?? undefined,
      });
      if (error) return { success: false, error: error.message };
      const r = data as { success: boolean; error?: string; set_id?: string };
      return r?.success
        ? { success: true, path: `/education/flashcards/${r.set_id}` }
        : { success: false, error: r?.error };
    }
    if (resourceType === "quiz_session") {
      const { data, error } = await supabase.rpc("fork_shared_quiz", {
        p_quiz_id: resourceId,
        p_token: shareToken ?? undefined,
      });
      if (error) return { success: false, error: error.message };
      const r = data as { success: boolean; error?: string; quiz_id?: string };
      // `fork_shared_quiz` returns a new `education.quiz_sessions` id, and there
      // is no route that opens one — `/quizzes/<id>` does not exist, and
      // `/education/quizzes/[id]` serves `education.assessment`, a different
      // record. Forking used to drop the user on a 404 immediately after a
      // successful copy; land them on the list until a session route exists
      // (FOUND_DEFECTS D139-adjacent, tracked in the no-dead-ends sweep).
      return r?.success
        ? { success: true, path: `/education/quizzes` }
        : { success: false, error: r?.error };
    }
    return { success: false, error: "This type can't be copied yet" };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to save copy",
    };
  }
}

/** Whether a resource type supports "save a copy & use it" (fork). */
export function isForkable(resourceType: string | undefined): boolean {
  return (
    resourceType === "conversation" ||
    resourceType === "fc_set" ||
    resourceType === "quiz_session"
  );
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
    return {
      success: false,
      error: "not_found",
      message: "This link is invalid.",
    };
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
