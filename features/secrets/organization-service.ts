import { createClient } from "@/utils/supabase/client";
import type {
  OrganizationSecretContributeRequest,
  OrganizationSecretCreateRequest,
  OrganizationSecretPermissionsRequest,
  OrganizationSecretSummary,
  OrganizationSecretUpdateRequest,
} from "@/features/secrets/types";

function backendBase(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");

  const response = await fetch(`${backendBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      const text = await response.text();
      if (text) detail = text;
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function fetchOrganizationSecrets(
  organizationId: string,
): Promise<OrganizationSecretSummary[]> {
  const result = await request<{ secrets: OrganizationSecretSummary[] }>(
    `/api/organization-secrets/${organizationId}`,
  );
  return result.secrets;
}

export function createOrganizationSecret(
  organizationId: string,
  body: OrganizationSecretCreateRequest,
): Promise<OrganizationSecretSummary> {
  return request(`/api/organization-secrets/${organizationId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function contributeOrganizationSecret(
  organizationId: string,
  body: OrganizationSecretContributeRequest,
): Promise<OrganizationSecretSummary> {
  return request(`/api/organization-secrets/${organizationId}/contribute`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateOrganizationSecret(
  organizationId: string,
  secretId: string,
  body: OrganizationSecretUpdateRequest,
): Promise<OrganizationSecretSummary> {
  return request(`/api/organization-secrets/${organizationId}/${secretId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function syncOrganizationSecret(
  organizationId: string,
  secretId: string,
): Promise<OrganizationSecretSummary> {
  return request(`/api/organization-secrets/${organizationId}/${secretId}/sync`, {
    method: "POST",
  });
}

export function setOrganizationSecretPermissions(
  organizationId: string,
  secretId: string,
  body: OrganizationSecretPermissionsRequest,
): Promise<OrganizationSecretSummary> {
  return request(
    `/api/organization-secrets/${organizationId}/${secretId}/permissions`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export function deleteOrganizationSecret(
  organizationId: string,
  secretId: string,
): Promise<void> {
  return request(`/api/organization-secrets/${organizationId}/${secretId}`, {
    method: "DELETE",
  });
}
