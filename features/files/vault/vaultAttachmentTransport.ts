/**
 * Byte transport for encrypted Vault attachments.
 *
 * Vault files are intentionally not ordinary cloud files: the server stores
 * their bytes inside the credential encryption boundary. This module is the
 * one frontend entry point for moving those bytes; Vault feature code owns
 * only metadata and user intent.
 */
import { createClient } from "@/utils/supabase/client";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import {
  buildMatrxRequestUrl,
  parseHttpError,
  sendMatrxRequest,
} from "@ai-matrx/agents/matrx";
import { downloadFile } from "@ai-matrx/kit/download";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

export const MAX_VAULT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function backendBase(): string {
  return AIDREAM_PRODUCTION_URL;
}

async function authorizationHeader(
  method: string,
): Promise<Record<string, string>> {
  // ORG-GATE-AUDIT: THE GATE, never the bare kernel. Attaching or replacing a
  // Vault file with no organization selected asks, then continues this same
  // upload; a download read keeps the fail-closed refusal.
  const organizationId = await ensureOrgId(null);
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  return applyOrganizationContextHeader(
    { Authorization: `Bearer ${session.access_token}` },
    organizationId,
  );
}

/** Vault byte send: this module's own bearer + organization headers, the
 * core's URL assembly and send; a non-2xx throws the one classified
 * BackendApiError. */
async function vaultBytesRequest(
  path: string,
  init: RequestInit & { method: string },
): Promise<Response> {
  const response = await sendMatrxRequest(
    buildMatrxRequestUrl(backendBase(), `/api/vault/items/${path}`),
    { ...init, headers: await authorizationHeader(init.method) },
  );
  if (!response.ok) throw await parseHttpError(response);
  return response;
}

export async function uploadVaultAttachment<T>(
  itemId: string,
  file: File,
  metadata: { label: string; description?: string; handling: string },
): Promise<T> {
  if (file.size === 0) throw new Error("Choose a file that is not empty");
  if (file.size > MAX_VAULT_ATTACHMENT_BYTES) {
    throw new Error("Vault files must be 25 MB or smaller");
  }
  const form = new FormData();
  form.set("file", file);
  form.set("label", metadata.label);
  form.set("description", metadata.description ?? "");
  form.set("handling", metadata.handling);
  const response = await vaultBytesRequest(
    `${encodeURIComponent(itemId)}/attachments`,
    { method: "POST", body: form },
  );
  return (await response.json()) as T;
}

export async function replaceVaultAttachment<T>(
  itemId: string,
  attachmentId: string,
  file: File,
): Promise<T> {
  if (file.size === 0) throw new Error("Choose a file that is not empty");
  if (file.size > MAX_VAULT_ATTACHMENT_BYTES) {
    throw new Error("Vault files must be 25 MB or smaller");
  }
  const form = new FormData();
  form.set("file", file);
  const response = await vaultBytesRequest(
    `${encodeURIComponent(itemId)}/attachments/${encodeURIComponent(attachmentId)}/file`,
    { method: "PUT", body: form },
  );
  return (await response.json()) as T;
}

export async function downloadVaultAttachment(
  itemId: string,
  attachmentId: string,
  fallbackFileName: string,
): Promise<void> {
  const response = await vaultBytesRequest(
    `${encodeURIComponent(itemId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
    { method: "GET", cache: "no-store" },
  );
  const blob = await response.blob();
  downloadFile(fallbackFileName, blob, blob.type);
}
