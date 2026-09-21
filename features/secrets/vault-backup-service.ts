import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { resolveServiceBaseUrl } from "@/lib/api/resolve-service-url";
import { requireSelectedOrgId } from "@/lib/organizations/activeOrg";
import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";

import type { VaultExpectedActor } from "./vault-service";

export const MAX_BACKUP_UPLOAD_BYTES = 66 * 1024 * 1024;
const RESTORE_RUN_KEY = "matrx:vault-backup-restore:v1";

export interface VaultBackupRecordSummary {
  source_item_id: string;
  display_name: string;
  field_count: number;
  attachment_count: number;
}
export interface VaultBackupOmission {
  component: string;
  reason: string;
  count: number | null;
  source_item_id?: string | null;
}
export interface VaultBackupSummary {
  records: VaultBackupRecordSummary[];
  omissions: VaultBackupOmission[];
  record_count: number;
  field_count: number;
  attachment_count: number;
  attachment_bytes: number;
}
export interface VaultBackupDownloadPreview extends VaultBackupSummary {
  revision: string;
}
export interface VaultBackupRestorePreview extends VaultBackupSummary {
  envelope_digest: string;
  actor_id: string;
  organization_id: string;
  quarantined: boolean;
}
export interface VaultBackupRestoreRecordResult {
  source_item_id: string;
  item_id: string | null;
  status: "created" | "replayed" | "refused" | "retryable_failure";
  reason?: "alias_conflict" | null;
}
export interface VaultBackupRestoreResult {
  restore_run_id: string;
  results: VaultBackupRestoreRecordResult[];
  created: number;
  replayed: number;
  refused: number;
  retryable_failure: number;
}

export type VaultBackupErrorCode =
  | "recent_auth_required"
  | "preview_changed"
  | "limit_exceeded"
  | "context_changed"
  | "missing"
  | "busy"
  | "retryable"
  | "request_rejected"
  | "unreachable";

export class VaultBackupTransportError extends Error {
  constructor(public readonly code: VaultBackupErrorCode) {
    super(
      code === "recent_auth_required"
        ? "Confirm your current Matrx password, then retry this step."
        : code === "preview_changed"
          ? "The backup or account changed. Review it again before continuing."
          : code === "limit_exceeded"
            ? "This backup is too large. Select fewer credentials or use a smaller backup file."
            : code === "context_changed"
              ? "Your account or request organization changed. Start again from the current Vault."
              : code === "missing"
                ? "A selected credential is no longer available. Reload the Vault and review again."
                : code === "busy"
                  ? "Backup encryption is busy. Wait a moment, then retry."
                  : code === "retryable"
                    ? "The result could not be confirmed. Retry with the same restore run."
                    : code === "unreachable"
                      ? "The Vault backup service is unavailable. Try again when it is online."
                      : "The backup request was refused. Review the file and selections, then retry.",
    );
  }
}

function failureCode(status: number): VaultBackupErrorCode {
  if (status === 401) return "recent_auth_required";
  if (status === 403) return "context_changed";
  if (status === 404) return "missing";
  if (status === 409) return "preview_changed";
  if (status === 413) return "limit_exceeded";
  if (status === 429) return "busy";
  if ([408, 500, 502, 503, 504].includes(status)) return "retryable";
  return "request_rejected";
}

async function authorizedRequest(
  path: string,
  body: object,
  expectedActor: VaultExpectedActor,
  signal?: AbortSignal,
): Promise<Response> {
  const organizationId = requireSelectedOrgId();
  if (organizationId !== expectedActor.organizationId)
    throw new VaultBackupTransportError("context_changed");
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token)
    throw new VaultBackupTransportError("context_changed");
  const {
    data: { user },
    error,
  } = await getClaimsUser(supabase, session.access_token);
  if (error || !user || user.id !== expectedActor.userId)
    throw new VaultBackupTransportError("context_changed");
  const headers = applyOrganizationContextHeader(
    {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    organizationId,
  );
  let response: Response;
  try {
    response = await fetch(
      `${resolveServiceBaseUrl("aidream")}/api/vault${path}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
      },
    );
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new VaultBackupTransportError("unreachable");
  }
  const actualOrganizationId = requireSelectedOrgId();
  const {
    data: { user: currentUser },
  } = await getClaimsUser(supabase, session.access_token);
  if (
    !currentUser ||
    currentUser.id !== expectedActor.userId ||
    actualOrganizationId !== expectedActor.organizationId
  )
    throw new VaultBackupTransportError("context_changed");
  if (!response.ok)
    throw new VaultBackupTransportError(failureCode(response.status));
  return response;
}

async function postJson<T>(
  path: string,
  body: object,
  actor: VaultExpectedActor,
  signal?: AbortSignal,
): Promise<T> {
  const response = await authorizedRequest(path, body, actor, signal);
  return (await response.json()) as T;
}

export function previewVaultBackup(
  itemIds: string[],
  actor: VaultExpectedActor,
  signal?: AbortSignal,
): Promise<VaultBackupDownloadPreview> {
  return postJson("/backups/preview", { item_ids: itemIds }, actor, signal);
}

export async function downloadVaultBackup(
  body: {
    item_ids: string[];
    revision: string;
    passphrase: string;
    accept_omissions: boolean;
  },
  actor: VaultExpectedActor,
  signal?: AbortSignal,
): Promise<Blob> {
  return (
    await authorizedRequest("/backups/download", body, actor, signal)
  ).blob();
}

export function previewVaultBackupRestore(
  envelopeBase64: string,
  passphrase: string,
  actor: VaultExpectedActor,
  signal?: AbortSignal,
): Promise<VaultBackupRestorePreview> {
  return postJson(
    "/backups/restore/preview",
    { envelope_base64: envelopeBase64, passphrase },
    actor,
    signal,
  );
}

export function restoreVaultBackup(
  body: {
    envelope_base64: string;
    passphrase: string;
    expected_digest: string;
    preview_actor_id: string;
    preview_organization_id: string;
    restore_run_id: string;
    accept_omissions: boolean;
  },
  actor: VaultExpectedActor,
  signal?: AbortSignal,
): Promise<VaultBackupRestoreResult> {
  return postJson("/backups/restore", body, actor, signal);
}

export function readBackupFile(
  file: File,
  signal?: AbortSignal,
): Promise<string> {
  if (file.size > MAX_BACKUP_UPLOAD_BYTES)
    throw new VaultBackupTransportError("limit_exceeded");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", abort);
    reader.onerror = () => {
      cleanup();
      reject(new VaultBackupTransportError("request_rejected"));
    };
    reader.onabort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    reader.onload = () => {
      cleanup();
      const result = reader.result;
      if (typeof result !== "string" || !result.includes(",")) {
        reject(new VaultBackupTransportError("request_rejected"));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

interface StoredRestoreRun {
  digest: string;
  actorId: string;
  organizationId: string;
  runId: string;
}
function readStoredRestoreRun(): StoredRestoreRun | null {
  try {
    const raw = sessionStorage.getItem(RESTORE_RUN_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("digest" in value) ||
      !("actorId" in value) ||
      !("organizationId" in value) ||
      !("runId" in value) ||
      typeof value.digest !== "string" ||
      typeof value.actorId !== "string" ||
      typeof value.organizationId !== "string" ||
      typeof value.runId !== "string"
    ) {
      sessionStorage.removeItem(RESTORE_RUN_KEY);
      return null;
    }
    return value as StoredRestoreRun;
  } catch {
    sessionStorage.removeItem(RESTORE_RUN_KEY);
    return null;
  }
}
function writeRestoreRun(
  preview: VaultBackupRestorePreview,
  runId: string,
): string {
  sessionStorage.setItem(
    RESTORE_RUN_KEY,
    JSON.stringify({
      digest: preview.envelope_digest,
      actorId: preview.actor_id,
      organizationId: preview.organization_id,
      runId,
    } satisfies StoredRestoreRun),
  );
  return runId;
}
export function restoreRunForPreview(
  preview: VaultBackupRestorePreview,
): string {
  const stored = readStoredRestoreRun();
  if (
    stored?.digest === preview.envelope_digest &&
    stored.actorId === preview.actor_id &&
    stored.organizationId === preview.organization_id
  )
    return stored.runId;
  return writeRestoreRun(preview, crypto.randomUUID());
}
export function startNewRestoreRun(preview: VaultBackupRestorePreview): string {
  return writeRestoreRun(preview, crypto.randomUUID());
}
export function clearRestoreRunForContext(actor: VaultExpectedActor): void {
  const stored = readStoredRestoreRun();
  if (
    stored &&
    (stored.actorId !== actor.userId ||
      stored.organizationId !== actor.organizationId)
  )
    sessionStorage.removeItem(RESTORE_RUN_KEY);
}
export function clearStoredRestoreRun(): void {
  sessionStorage.removeItem(RESTORE_RUN_KEY);
}
