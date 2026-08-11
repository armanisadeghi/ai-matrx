/**
 * Byte transport for encrypted Vault attachments.
 *
 * Vault files are intentionally not ordinary cloud files: the server stores
 * their bytes inside the credential encryption boundary. This module is the
 * one frontend entry point for moving those bytes; Vault feature code owns
 * only metadata and user intent.
 */
import { createClient } from "@/utils/supabase/client";

export const MAX_VAULT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function backendBase(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com"
  );
}

async function authorizationHeader(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  return { Authorization: `Bearer ${session.access_token}` };
}

async function responseError(response: Response): Promise<Error> {
  let detail = "";
  try {
    const body = (await response.json()) as { detail?: unknown };
    detail =
      typeof body.detail === "string" ? body.detail : JSON.stringify(body);
  } catch {
    detail = await response.text().catch(() => "");
  }
  return new Error(detail || `HTTP ${response.status}`);
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
  const response = await fetch(
    `${backendBase()}/api/vault/items/${encodeURIComponent(itemId)}/attachments`,
    { method: "POST", headers: await authorizationHeader(), body: form },
  );
  if (!response.ok) throw await responseError(response);
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
  const response = await fetch(
    `${backendBase()}/api/vault/items/${encodeURIComponent(itemId)}/attachments/${encodeURIComponent(attachmentId)}/file`,
    { method: "PUT", headers: await authorizationHeader(), body: form },
  );
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
}

export async function downloadVaultAttachment(
  itemId: string,
  attachmentId: string,
  fallbackFileName: string,
): Promise<void> {
  const response = await fetch(
    `${backendBase()}/api/vault/items/${encodeURIComponent(itemId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
    { headers: await authorizationHeader(), cache: "no-store" },
  );
  if (!response.ok) throw await responseError(response);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fallbackFileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}
