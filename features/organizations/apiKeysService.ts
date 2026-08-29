/**
 * Organization API keys — the management surface's data layer.
 *
 * The API-key lane (ratified C16, 2026-08-29; design:
 * common-docs/projects/npm-package-extraction/API-KEY-LANE-DESIGN.md).
 * Direct-to-Supabase per the data-flow law: reads are RLS-backed table reads
 * on iam.api_keys; create/revoke go through the owner-gated SECURITY DEFINER
 * RPCs (iam.api_key_create / iam.api_key_revoke). The full secret exists
 * exactly once — in the create RPC's response — and is never stored client-
 * or server-side.
 */

import { supabase } from "@/utils/supabase/client";

export interface OrgApiKey {
  id: string;
  key_id: string;
  name: string;
  display_prefix: string;
  status: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface CreatedApiKey {
  id: string;
  /** The full `mx_live_...` secret — shown ONCE, never recoverable. */
  api_key: string;
  key_id: string;
  name: string;
  display_prefix: string;
  organization_id: string;
  expires_at: string | null;
}

export async function listOrgApiKeys(orgId: string): Promise<OrgApiKey[]> {
  const { data, error } = await supabase
    .schema("iam")
    .from("api_keys")
    .select(
      "id, key_id, name, display_prefix, status, last_used_at, expires_at, revoked_at, created_at",
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OrgApiKey[];
}

export async function createOrgApiKey(
  orgId: string,
  name: string,
  expiresAt?: string | null,
): Promise<CreatedApiKey> {
  const { data, error } = await supabase
    .schema("iam")
    .rpc("api_key_create", {
      p_organization_id: orgId,
      p_name: name,
      ...(expiresAt ? { p_expires_at: expiresAt } : {}),
    });
  if (error) throw new Error(error.message);
  return data as unknown as CreatedApiKey;
}

export async function revokeOrgApiKey(keyRowId: string): Promise<void> {
  const { error } = await supabase
    .schema("iam")
    .rpc("api_key_revoke", { p_id: keyRowId });
  if (error) throw new Error(error.message);
}
