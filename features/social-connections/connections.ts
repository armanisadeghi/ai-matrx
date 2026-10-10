import type { Tables } from "@/types/database.types";
import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { operationFailed } from "@/utils/errors";

export type SocialConnection = Pick<Tables<{ schema: "users" }, "integration_connections">,
  "id" | "provider" | "account_name" | "provider_subject" | "scopes" | "status" | "last_verified_at" | "last_error" | "metadata"
>;
export type SocialResource = Pick<Tables<{ schema: "users" }, "integration_connection_resources">,
  "id" | "connection_id" | "resource_ref" | "resource_type" | "display_name" | "metadata"
>;

/** Personal grants span all of the person's organizations; this read never narrows by the active org. */
export async function listSocialConnections(signal?: AbortSignal): Promise<SocialConnection[]> {
  const client = createClient();
  const { data: { user }, error } = await getClaimsUser(client);
  if (error || !user) throw operationFailed("verify your identity", error);
  const result = await client.schema("users").from("integration_connections")
    .select("id,provider,account_name,provider_subject,scopes,status,last_verified_at,last_error,metadata")
    .eq("provider", "x").eq("owner_type", "user").eq("owner_user_id", user.id)
    .is("deleted_at", null).order("updated_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  if (result.error) throw operationFailed("load your X accounts", result.error);
  return result.data;
}

export async function listSocialResources(connectionIds: string[], signal?: AbortSignal): Promise<SocialResource[]> {
  if (!connectionIds.length) return [];
  const result = await createClient().schema("users").from("integration_connection_resources")
    .select("id,connection_id,resource_ref,resource_type,display_name,metadata")
    .in("connection_id", connectionIds).eq("resource_type", "x_account").is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  if (result.error) throw operationFailed("load your X account selections", result.error);
  return result.data;
}
