/**
 * Personal API keys — a key that IS the person, with their full access.
 *
 * Arman's ruling, 2026-09-29 ("case 1, dead simple"): no scopes, no app
 * registration. Contract: migrations/campaign/
 * tableapi1_a_person_can_hold_a_key_that_is_them.sql. Direct-to-Supabase per
 * the data-flow law — three SECURITY DEFINER doors on schema `iam`, identity
 * from auth.uid(). The full secret exists exactly once, in the create door's
 * response, and is never stored client- or server-side.
 *
 * The organization surface for SERVICE keys is the sibling
 * `features/organizations/apiKeysService.ts`; it filters personal keys out.
 *
 * The RPC results are typed locally: the generated database types may not yet
 * carry these functions, and generated types are never hand-edited.
 */

import { supabase } from "@/utils/supabase/client";

export interface PersonalApiKey {
  id: string;
  key_id: string;
  name: string;
  display_prefix: string;
  organization_id: string;
  organization_name: string | null;
  status: "active" | "revoked" | string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface CreatedPersonalApiKey {
  id: string;
  /** The full `mx_live_...` secret — shown ONCE, never recoverable. */
  api_key: string;
  key_id: string;
  kind: "personal";
  display_prefix: string;
  name: string;
  organization_id: string;
  status: string;
  expires_at: string | null;
  /** True when the organization's maximum key age shortened the expiry. */
  expiry_capped: boolean;
  created_at: string;
}

export interface RevokedPersonalApiKey {
  id: string;
  status: string;
  revoked_at: string | null;
}

/** The base URL a program calls with a personal key. */
export const PERSONAL_API_BASE_URL =
  "https://server.app.matrxserver.com/api/v1/tables";

// The generated client does not know these functions yet, so the call goes
// through a narrowly typed view of `rpc` rather than a cast at every site.
type LooseRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

function iamRpc(): LooseRpc {
  const iam = supabase.schema("iam") as unknown as { rpc: LooseRpc };
  return iam.rpc.bind(iam);
}

/** The database writes every refusal as a sentence for the person; pass it on. */
function fail(error: { message: string }): never {
  throw new Error(error.message);
}

export async function listPersonalApiKeys(): Promise<PersonalApiKey[]> {
  const { data, error } = await iamRpc()("personal_api_key_list");
  if (error) fail(error);
  return Array.isArray(data) ? (data as PersonalApiKey[]) : [];
}

export async function createPersonalApiKey(
  name: string,
  organizationId: string,
): Promise<CreatedPersonalApiKey> {
  const { data, error } = await iamRpc()("personal_api_key_create", {
    p_name: name,
    p_organization_id: organizationId,
  });
  if (error) fail(error);
  return data as CreatedPersonalApiKey;
}

export async function revokePersonalApiKey(
  id: string,
): Promise<RevokedPersonalApiKey> {
  const { data, error } = await iamRpc()("personal_api_key_revoke", {
    p_id: id,
  });
  if (error) fail(error);
  return data as RevokedPersonalApiKey;
}
