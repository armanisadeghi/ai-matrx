import { createClient } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import { apiGet, apiPost } from "@/lib/api/typed-client";

export async function discoverXAccount(
  connectionId: string,
  organizationId: string,
) {
  return (
    await apiPost(
      "/social-oauth/x/discover",
      { connection_id: connectionId },
      { organizationId },
    )
  ).data;
}

export async function selectXAccount(
  connectionId: string,
  resourceRef: string,
  organizationId: string,
) {
  return (
    await apiPost(
      "/social-oauth/x/select",
      { connection_id: connectionId, resource_ref: resourceRef },
      { organizationId },
    )
  ).data;
}

export async function attachXAccount(
  connectionId: string,
  resourceRef: string,
  brandId: string,
  organizationId: string,
) {
  return (
    await apiPost(
      "/social-oauth/x/attach",
      {
        connection_id: connectionId,
        resource_ref: resourceRef,
        brand_id: brandId,
      },
      { organizationId },
    )
  ).data;
}

export async function refreshXAccess(
  connectionId: string,
  organizationId: string,
) {
  return (
    await apiPost(
      "/social-oauth/x/refresh",
      { connection_id: connectionId },
      { organizationId },
    )
  ).data;
}

export async function disconnectXAccount(
  connectionId: string,
  organizationId: string,
) {
  return (
    await apiPost(
      "/social-oauth/x/disconnect",
      { connection_id: connectionId },
      { organizationId },
    )
  ).data;
}

export async function getXConfig(organizationId: string) {
  return (await apiGet("/social-oauth/x/config", { organizationId })).data;
}

export async function syncXAccount(
  connectionId: string,
  brandId: string,
  organizationId: string,
) {
  const result = await createClient()
    .schema("social")
    .from("tracked_account")
    .select("id")
    .eq("brand_id", brandId)
    .eq("organization_id", organizationId)
    .contains("metadata", { x_connection_id: connectionId })
    .is("deleted_at", null);
  if (result.error)
    throw operationFailed("find your connected X brand account", result.error);
  if (result.data.length !== 1)
    throw new Error("Select your X account for this brand first.");
  return (
    await apiPost(
      "/social-oauth/x/sync",
      { connection_id: connectionId, tracked_account_id: result.data[0].id },
      { organizationId },
    )
  ).data;
}
