/**
 * Unified Credential Vault — ONE service module for both principals.
 *
 * Trust boundary (PLAN.md "Frontend trust boundary"):
 *  - Masked metadata (items, fields, catalog definitions) is read DIRECTLY
 *    from Supabase under RLS with explicit column lists — never through
 *    aidream, never `select *` (the ciphertext column is unreadable by
 *    client roles and must never be requested).
 *  - EVERY value-bearing or mutating operation goes to aidream
 *    `/api/vault/*` — the only decryption + audit boundary.
 *
 * Replaces the deleted personal/org duplicate stacks
 * (`service.ts` / `organization-service.ts`).
 */
import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { makeAssertData } from "@/utils/errors";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import {
  ensureOrganizationContext,
  ensureOrganizationForRequest,
} from "@/lib/organization/organization-gate";
import {
  downloadVaultAttachment as downloadVaultAttachmentBytes,
  replaceVaultAttachment as replaceVaultAttachmentBytes,
  uploadVaultAttachment,
} from "@/features/files/vault/vaultAttachmentTransport";
import { credentialDefinitionSchema } from "@/features/admin/applications/catalogs/schemas";
import {
  CREDENTIAL_ITEM_COLUMNS,
  VAULT_ATTACHMENT_COLUMNS,
  VAULT_FIELD_COLUMNS,
  normalizeNonSecretFields,
  normalizeExecutionPurpose,
  normalizeVaultHandling,
  normalizeWireField,
  normalizeWireItem,
  normalizeWireAttachment,
  toPrincipalIn,
  type CredentialDefinition,
  type CredentialItemMaskedRow,
  type VaultAttachment,
  type VaultAttachmentMaskedRow,
  type VaultAttachmentUpdateRequest,
  type VaultAttachmentWire,
  type VaultAccessMode,
  type VaultAssignRequest,
  type VaultAssignResponse,
  type VaultAuditEntry,
  type VaultCapabilities,
  type VaultDestinationCheck,
  type VaultField,
  type VaultFieldIn,
  type VaultFieldMaskedRow,
  type VaultFieldMetadataRequest,
  type VaultFieldWire,
  type VaultGrant,
  type VaultGrantee,
  type VaultImportEnvRequest,
  type VaultItem,
  type VaultItemCreateRequest,
  type VaultItemUpdateRequest,
  type VaultItemWire,
  type VaultPrincipal,
  type VaultPasswordHistoryResponse,
  type VaultPasswordHistoryRevealResponse,
  type VaultPasswordHistoryRestoreResponse,
  type VaultRevealResponse,
  type VaultScope,
  type VaultTransferResponse,
} from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import {
  emptyReadAlarm,
  holdingsDoorIsAbsent,
  type Holdings,
  type HoldingRow,
} from "./empty-read";
import type { components } from "@/types/python-generated/api-types";

const assertVaultData = makeAssertData("load your vault");

// ── aidream /api/vault client ─────────────────────────────────────────────

function backendBase(): string {
  return AIDREAM_PRODUCTION_URL;
}

export type VaultExpectedActor = {
  userId: string;
  organizationId: string;
};

export type VaultLoginCsvPreviewRequest =
  components["schemas"]["VaultLoginCsvPreviewRequest"];
export type VaultLoginCsvPreviewResponse =
  components["schemas"]["VaultLoginCsvPreviewResponse"];
export type VaultLoginCsvDownloadRequest =
  components["schemas"]["VaultLoginCsvDownloadRequest"];
export type VaultVerifiedExportActor = VaultExpectedActor & {
  email: string;
};

export type VaultRestoreResult = Pick<
  components["schemas"]["VaultRestoreResponse"],
  | "restored_fields"
  | "restored_attachments"
  | "restored_native_passkeys"
  | "already_restored"
  | "notice"
>;

export class VaultIdentityConfirmationError extends Error {
  constructor(
    public readonly code:
      "credentials_rejected" | "context_changed" | "identity_unverified",
  ) {
    super(code);
  }
}

export class VaultRecentAuthRequiredError extends Error {
  constructor() {
    super(
      "Confirm your identity with your current Matrx password, then try showing or copying this value again.",
    );
  }
}

/** The history chain advanced after the person reviewed it. A caller must
 * reload its value-free timeline before asking them to confirm again. */
export class VaultPasswordHistoryConflictError extends Error {
  constructor() {
    super("Password history changed. Refresh the timeline and try again.");
  }
}

export class VaultRestoreTransportError extends Error {
  constructor(
    public readonly code:
      | "recent_auth_required"
      | "context_changed"
      | "retryable"
      | "native_recovery_unavailable"
      | "request_rejected",
  ) {
    super(
      code === "recent_auth_required"
        ? "Confirm your identity before restoring this credential."
        : code === "context_changed"
          ? "Your account or request organization changed. Review this credential again."
          : code === "retryable"
            ? "We could not confirm whether this credential was restored. Retry with this same recovery record."
            : code === "native_recovery_unavailable"
              ? "Native passkey recovery is currently unavailable. Reload Trash and try again; your retained recovery data is preserved."
              : "This credential could not be restored. Review its recovery details and try again.",
    );
  }
}

export class VaultLoginExportTransportError extends Error {
  constructor(
    public readonly code:
      | "recent_auth_required"
      | "preview_stale"
      | "export_unavailable"
      | "missing_or_forbidden"
      | "limit_exceeded"
      | "context_changed"
      | "request_rejected"
      | "unreachable",
  ) {
    super(
      code === "recent_auth_required"
        ? "Confirm your identity before exporting selected logins."
        : code === "preview_stale"
          ? "Your selected logins changed. Review the current selection again."
          : code === "export_unavailable"
            ? "These selected logins cannot be exported right now. Review the preview and try again."
            : code === "missing_or_forbidden"
              ? "One or more selected logins are no longer available. Reload your Vault and select them again."
              : code === "limit_exceeded"
                ? "This selection exceeds the Vault export limit. Reduce the selection and try again."
                : code === "context_changed"
                  ? "Your account or request organization changed. Start the export again."
                  : code === "unreachable"
                    ? "Vault export is unavailable. Try again when the service is online."
                    : "Vault export could not be completed. Review the selection and try again.",
    );
  }
}

export class VaultImportTransportError extends Error {
  constructor(
    public readonly code:
      | "context_changed"
      | "idempotency_key_conflict"
      | "idempotency_result_removed"
      | "request_rejected"
      | "retryable",
  ) {
    super(
      code === "context_changed"
        ? "Your account or request organization changed. Review the import again before continuing."
        : code === "retryable"
          ? "The import could not be confirmed. Retry this row with the same import session."
          : code === "idempotency_key_conflict"
            ? "This import retry key conflicts with a different request."
            : code === "idempotency_result_removed"
              ? "The import result is no longer available to confirm."
              : "This import row was rejected. Review the row without exposing its values.",
    );
  }
}

/**
 * The active organization as an IDENTITY READ — never asks. The export/import
 * actor freeze and every re-check after it compare this value before and after
 * a send; opening the picker mid-comparison would change the very thing being
 * compared, so these reads go through the gate NON-interactively (fail-closed,
 * exactly as before).
 */
function readActiveOrganizationForIdentity(): Promise<string> {
  return ensureOrganizationContext({ interactive: false });
}

async function authHeaders(
  expectedActor?: VaultExpectedActor,
  contextError: () => Error = () =>
    new VaultImportTransportError("context_changed"),
  method = "GET",
): Promise<{
  organizationId: string;
  headers: Record<string, string>;
}> {
  // ORG-GATE-AUDIT: ordinary transport goes through THE GATE — saving,
  // rotating or deleting a secret with no organization selected asks, then
  // continues this same request; a background read keeps the fail-closed
  // refusal. An actor-frozen send never asks (see readActiveOrganizationForIdentity).
  const initialOrganizationId = expectedActor
    ? null
    : await ensureOrganizationForRequest({ method });
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  // Verify the exact bearer token that will be sent. Resolving identity without
  // that token races a session replacement and can bind one user's identity to
  // another user's Authorization header. The verification is LOCAL (WebCrypto
  // against the project JWKS) — as trusted as the auth-server round trip was,
  // with no network call.
  const {
    data: { user },
    error: userError,
  } = await getClaimsUser(supabase, session.access_token);
  if (userError || !user) throw new Error("Not signed in");
  // Imports reread request context after final auth await; ordinary transport
  // keeps its existing fail-before-auth behavior.
  const organizationId =
    initialOrganizationId ?? (await readActiveOrganizationForIdentity());
  if (
    expectedActor &&
    (expectedActor.userId !== user.id ||
      expectedActor.organizationId !== organizationId)
  ) {
    throw contextError();
  }
  return {
    organizationId,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  };
}

/** The export dialog freezes this identity before preview/download and checks it
 * again after every response. Email is display-only and is never caller input. */
export async function getVaultExportActor(): Promise<VaultVerifiedExportActor> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  const {
    data: { user },
    error,
  } = await getClaimsUser(supabase, session.access_token);
  if (error || !user || !user.email) throw new Error("Not signed in");
  return {
    userId: user.id,
    organizationId: await readActiveOrganizationForIdentity(),
    email: user.email,
  };
}

/** Confirm a password without retaining it in application state. The caller
 * owns the uncontrolled input and clears it before and after this call. */
export async function confirmVaultPasswordIdentity(
  expectedActor: VaultVerifiedExportActor,
  password: string,
  getActor: () => Promise<VaultVerifiedExportActor> = getVaultExportActor,
): Promise<VaultVerifiedExportActor> {
  let before: VaultVerifiedExportActor;
  try {
    before = await getActor();
  } catch {
    throw new VaultIdentityConfirmationError("context_changed");
  }
  if (
    before.userId !== expectedActor.userId ||
    before.organizationId !== expectedActor.organizationId
  ) {
    throw new VaultIdentityConfirmationError("context_changed");
  }
  const supabase = createClient();
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: expectedActor.email,
    password,
  });
  if (signInError || !data.user || !data.session) {
    throw new VaultIdentityConfirmationError("credentials_rejected");
  }
  const { data: claimData, error: claimsError } = await supabase.auth.getClaims(
    data.session.access_token,
  );
  let actual: VaultVerifiedExportActor;
  try {
    actual = await getActor();
  } catch {
    throw new VaultIdentityConfirmationError("context_changed");
  }
  if (
    actual.userId !== expectedActor.userId ||
    actual.organizationId !== expectedActor.organizationId
  ) {
    throw new VaultIdentityConfirmationError("context_changed");
  }
  if (
    claimsError ||
    data.user.id !== expectedActor.userId ||
    !hasFreshPasswordAmr(claimData?.claims)
  ) {
    throw new VaultIdentityConfirmationError("identity_unverified");
  }
  return actual;
}

function hasFreshPasswordAmr(claims: unknown): boolean {
  if (!claims || typeof claims !== "object" || !("amr" in claims)) return false;
  const { amr } = claims;
  if (!Array.isArray(amr)) return false;
  const now = Math.floor(Date.now() / 1_000);
  return amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const value = entry as Record<string, unknown>;
    return (
      value.method === "password" &&
      typeof value.timestamp === "number" &&
      Number.isFinite(value.timestamp) &&
      value.timestamp > 0 &&
      value.timestamp <= now &&
      now - value.timestamp <= 900
    );
  });
}

async function assertVaultExportActor(
  expectedActor: VaultExpectedActor,
): Promise<void> {
  const actual = await getVaultExportActor();
  if (
    actual.userId !== expectedActor.userId ||
    actual.organizationId !== expectedActor.organizationId
  ) {
    throw new VaultLoginExportTransportError("context_changed");
  }
}

async function assertVaultRestoreActor(
  expectedActor: VaultExpectedActor,
): Promise<void> {
  const actual = await getVaultExportActor();
  if (
    actual.userId !== expectedActor.userId ||
    actual.organizationId !== expectedActor.organizationId
  ) {
    throw new VaultRestoreTransportError("context_changed");
  }
}

async function exportFailureCode(
  resp: Response,
): Promise<VaultLoginExportTransportError["code"]> {
  // The structured recent-auth code is intentionally the only detail the
  // browser reads. Never match server prose, which is neither a stable wire
  // contract nor a safe place for sensitive diagnostics.
  if (resp.status === 401) {
    try {
      const body: unknown = await resp.json();
      if (
        body &&
        typeof body === "object" &&
        "code" in body &&
        body.code === "recent_auth_required"
      ) {
        return "recent_auth_required";
      }
    } catch {
      // An unparseable response is not evidence of the reauthentication gate.
    }
    return "request_rejected";
  }
  if (resp.status === 404) return "missing_or_forbidden";
  if (resp.status === 413) return "limit_exceeded";
  if (resp.status === 409) {
    try {
      const body: unknown = await resp.json();
      if (
        body &&
        typeof body === "object" &&
        "code" in body &&
        body.code === "preview_stale"
      ) {
        return "preview_stale";
      }
    } catch {
      // The status is still a safe value-free export failure.
    }
    return "export_unavailable";
  }
  return resp.status >= 500 ? "unreachable" : "request_rejected";
}

async function vaultExportResponse(
  path: string,
  body: VaultLoginCsvPreviewRequest | VaultLoginCsvDownloadRequest,
  expectedActor: VaultExpectedActor,
  signal?: AbortSignal,
): Promise<Response> {
  const { organizationId, headers: auth } = await authHeaders(
    expectedActor,
    () => new VaultLoginExportTransportError("context_changed"),
  );
  const headers = applyOrganizationContextHeader(auth, organizationId);
  let resp: Response;
  try {
    resp = await fetch(`${backendBase()}/api/vault${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new VaultLoginExportTransportError("unreachable");
  }
  await assertVaultExportActor(expectedActor);
  if (!resp.ok)
    throw new VaultLoginExportTransportError(await exportFailureCode(resp));
  return resp;
}

export async function previewVaultLoginCsv(
  body: VaultLoginCsvPreviewRequest,
  expectedActor: VaultExpectedActor,
  signal?: AbortSignal,
): Promise<VaultLoginCsvPreviewResponse> {
  const response = await vaultExportResponse(
    "/exports/login-csv/preview",
    body,
    expectedActor,
    signal,
  );
  return (await response.json()) as VaultLoginCsvPreviewResponse;
}

/** Returns bytes only to the caller's event handler. Do not store the Blob. */
export async function downloadVaultLoginCsv(
  body: VaultLoginCsvDownloadRequest,
  expectedActor: VaultExpectedActor,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await vaultExportResponse(
    "/exports/login-csv",
    body,
    expectedActor,
    signal,
  );
  await assertVaultExportActor(expectedActor);
  return response.blob();
}

function restoreFailureCode(
  status: number,
  body: unknown,
): VaultRestoreTransportError["code"] {
  if (
    status === 403 &&
    body &&
    typeof body === "object" &&
    "code" in body &&
    body.code === "recent_auth_required"
  ) {
    return "recent_auth_required";
  }
  if (
    status === 503 &&
    body &&
    typeof body === "object" &&
    "detail" in body &&
    body.detail &&
    typeof body.detail === "object" &&
    "code" in body.detail &&
    body.detail.code === "native_passkeys_unavailable"
  ) {
    return "native_recovery_unavailable";
  }
  return "request_rejected";
}

function isVaultRestoreResult(value: unknown): value is VaultRestoreResult {
  if (!value || typeof value !== "object") return false;
  const restoredFields =
    "restored_fields" in value ? value.restored_fields : null;
  const restoredAttachments =
    "restored_attachments" in value ? value.restored_attachments : null;
  const restoredNativePasskeys =
    "restored_native_passkeys" in value ? value.restored_native_passkeys : null;
  const alreadyRestored =
    "already_restored" in value ? value.already_restored : null;
  const notice = "notice" in value ? value.notice : null;
  return (
    typeof restoredFields === "number" &&
    Number.isInteger(restoredFields) &&
    restoredFields >= 0 &&
    typeof restoredAttachments === "number" &&
    Number.isInteger(restoredAttachments) &&
    restoredAttachments >= 0 &&
    (restoredNativePasskeys === 0 || restoredNativePasskeys === 1) &&
    typeof alreadyRestored === "boolean" &&
    notice === "sharing_and_automatic_use_off"
  );
}

/** Restore a Vault aggregate through its authenticated server boundary. */
export async function restoreVaultItem(
  itemId: string,
  deletionId: string,
  expectedActor: VaultExpectedActor,
  signal?: AbortSignal,
): Promise<VaultRestoreResult> {
  const { organizationId, headers: auth } = await authHeaders(
    expectedActor,
    () => new VaultRestoreTransportError("context_changed"),
  );
  const headers = applyOrganizationContextHeader(auth, organizationId);
  let response: Response;
  try {
    response = await fetch(
      `${backendBase()}/api/vault/items/${encodeURIComponent(itemId)}/restore`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ deletion_id: deletionId }),
        signal,
        cache: "no-store",
      },
    );
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new VaultRestoreTransportError("retryable");
  }
  await assertVaultRestoreActor(expectedActor);
  if (!response.ok) {
    if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // The status remains enough to distinguish a safe exact retry.
      }
      const code = restoreFailureCode(response.status, body);
      if (code === "native_recovery_unavailable") {
        throw new VaultRestoreTransportError(code);
      }
      throw new VaultRestoreTransportError("retryable");
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // The HTTP status still provides the safe retry distinction above.
    }
    throw new VaultRestoreTransportError(
      restoreFailureCode(response.status, body),
    );
  }
  const body: unknown = await response.json();
  if (!isVaultRestoreResult(body)) {
    throw new VaultRestoreTransportError("request_rejected");
  }
  return {
    restored_fields: body.restored_fields,
    restored_attachments: body.restored_attachments,
    restored_native_passkeys: body.restored_native_passkeys,
    already_restored: body.already_restored,
    notice: body.notice,
  };
}

type FrozenVaultImport = {
  idempotencyKey: string;
  expectedActor: VaultExpectedActor;
};

async function vaultFetch<T>(
  path: string,
  init?: RequestInit,
  frozenImport?: FrozenVaultImport,
): Promise<T> {
  const { organizationId, headers: auth } = await authHeaders(
    frozenImport?.expectedActor,
    undefined,
    init?.method ?? "GET",
  );
  const suppliedHeaders = Object.fromEntries(
    new Headers(init?.headers).entries(),
  );
  const headers = applyOrganizationContextHeader(
    { ...auth, ...suppliedHeaders },
    organizationId,
  );
  let resp: Response;
  try {
    resp = await fetch(`${backendBase()}/api/vault${path}`, {
      ...init,
      headers,
    });
  } catch {
    if (frozenImport) throw new VaultImportTransportError("retryable");
    throw new Error(
      "Vault service unreachable — value operations need the backend online",
    );
  }
  if (!resp.ok) {
    if (frozenImport) {
      if ([408, 429, 500, 502, 503, 504].includes(resp.status))
        throw new VaultImportTransportError("retryable");
      if (resp.status === 401) {
        throw new VaultImportTransportError("context_changed");
      }
      let receiptCode: unknown = null;
      try {
        const body: unknown = await resp.json();
        receiptCode =
          body && typeof body === "object" && "error" in body
            ? (body.error as { code?: unknown } | null)?.code
            : null;
      } catch {
        // An unreadable error body cannot prove a receipt-specific condition.
      }
      if (resp.status === 403 && receiptCode === "idempotency_context_denied")
        throw new VaultImportTransportError("context_changed");
      if (resp.status === 409 && receiptCode === "idempotency_key_conflict")
        throw new VaultImportTransportError("idempotency_key_conflict");
      if (resp.status === 410 && receiptCode === "idempotency_result_removed")
        throw new VaultImportTransportError("idempotency_result_removed");
      throw new VaultImportTransportError("request_rejected");
    }
    if (resp.status === 409 && path.endsWith("/password-history/restore")) {
      throw new VaultPasswordHistoryConflictError();
    }
    if (
      resp.status === 401 &&
      (path.endsWith("/reveal") || path.endsWith("/password-history/restore"))
    ) {
      let body: unknown;
      try {
        body = await resp.json();
      } catch {
        // Authentication failures outside the recency gate stay generic.
      }
      const detail =
        body && typeof body === "object" && "detail" in body
          ? body.detail
          : null;
      const recentAuthCode =
        detail && typeof detail === "object" && "code" in detail
          ? detail.code
          : null;
      if (
        recentAuthCode === "recent_auth_required" ||
        (typeof detail === "string" &&
          (detail.startsWith("recent authentication is required") ||
            detail.startsWith("authentication within the last ")))
      ) {
        throw new VaultRecentAuthRequiredError();
      }
    }
    throw new Error(`Vault request failed (${resp.status})`);
  }
  if (resp.status === 204) return undefined as T;
  try {
    return (await resp.json()) as T;
  } catch (cause) {
    if (frozenImport) throw new VaultImportTransportError("retryable");
    throw cause;
  }
}

/** Advisory destination validation. It never reads a response body and callers
 * must never make Vault saving depend on a remote site's availability. */
export function checkVaultDestination(
  url: string,
): Promise<VaultDestinationCheck> {
  return vaultFetch<VaultDestinationCheck>("/destination/check", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

type VaultItemCreateOptions =
  FrozenVaultImport | { idempotencyKey?: never; expectedActor?: never };

function isFrozenVaultImport(
  options: VaultItemCreateOptions,
): options is FrozenVaultImport {
  return (
    typeof options.idempotencyKey === "string" &&
    options.idempotencyKey.trim().length > 0 &&
    Boolean(options.expectedActor)
  );
}

export function createVaultItem(
  body: VaultItemCreateRequest,
  options?: VaultItemCreateOptions,
): Promise<VaultItem> {
  if (options && !isFrozenVaultImport(options))
    return Promise.reject(new VaultImportTransportError("request_rejected"));
  return vaultFetch<VaultItemWire>(
    "/items",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: options
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined,
    },
    options,
  ).then(normalizeWireItem);
}

/** Freeze actor + request organization at confirmation, then recheck both at every send. */
export async function getVaultImportActor(): Promise<VaultExpectedActor> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await getClaimsUser(supabase);
  if (error || !user) throw new Error("Not signed in");
  const organizationId = await readActiveOrganizationForIdentity();
  return { userId: user.id, organizationId };
}

export async function importVaultEnv(
  body: VaultImportEnvRequest,
): Promise<{ items: VaultItem[]; count: number }> {
  const resp = await vaultFetch<{ items: VaultItemWire[]; count: number }>(
    "/items/import-env",
    { method: "POST", body: JSON.stringify(body) },
  );
  return { items: resp.items.map(normalizeWireItem), count: resp.count };
}

export function getVaultItem(itemId: string): Promise<VaultItem> {
  return vaultFetch<VaultItemWire>(`/items/${encodeURIComponent(itemId)}`).then(
    normalizeWireItem,
  );
}

export function updateVaultItem(
  itemId: string,
  body: VaultItemUpdateRequest,
): Promise<VaultItem> {
  return vaultFetch<VaultItemWire>(`/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }).then(normalizeWireItem);
}

export function deleteVaultItem(itemId: string): Promise<void> {
  return vaultFetch<void>(`/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

export function addVaultAttachment(
  itemId: string,
  file: File,
  metadata: { label: string; description?: string; handling: string },
): Promise<VaultAttachment> {
  return uploadVaultAttachment<VaultAttachmentWire>(
    itemId,
    file,
    metadata,
  ).then(normalizeWireAttachment);
}

export function updateVaultAttachment(
  itemId: string,
  attachmentId: string,
  body: VaultAttachmentUpdateRequest,
): Promise<VaultAttachment> {
  return vaultFetch<VaultAttachmentWire>(
    `/items/${encodeURIComponent(itemId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  ).then(normalizeWireAttachment);
}

export function replaceVaultAttachment(
  itemId: string,
  attachmentId: string,
  file: File,
): Promise<VaultAttachment> {
  return replaceVaultAttachmentBytes<VaultAttachmentWire>(
    itemId,
    attachmentId,
    file,
  ).then(normalizeWireAttachment);
}

export function deleteVaultAttachment(
  itemId: string,
  attachmentId: string,
): Promise<void> {
  return vaultFetch<void>(
    `/items/${encodeURIComponent(itemId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );
}

export function downloadVaultAttachment(
  itemId: string,
  attachmentId: string,
  fileName: string,
): Promise<void> {
  return downloadVaultAttachmentBytes(itemId, attachmentId, fileName);
}

export function addVaultField(
  itemId: string,
  field: VaultFieldIn,
): Promise<VaultField> {
  return vaultFetch<VaultFieldWire>(
    `/items/${encodeURIComponent(itemId)}/fields`,
    { method: "POST", body: JSON.stringify(field) },
  ).then(normalizeWireField);
}

export function updateVaultFieldValue(
  itemId: string,
  fieldId: string,
  value: string,
): Promise<VaultField> {
  return vaultFetch<VaultFieldWire>(
    `/items/${encodeURIComponent(itemId)}/fields/${encodeURIComponent(fieldId)}/value`,
    { method: "PUT", body: JSON.stringify({ value }) },
  ).then(normalizeWireField);
}

/** Metadata-only field PATCH (inject flag, env alias set/clear, description,
 *  handling, editable, is_active). Requires `can_edit`; the server enforces
 *  the one-way seal door (403 on any change away from `sealed`). */
export function updateVaultFieldMetadata(
  itemId: string,
  fieldId: string,
  body: VaultFieldMetadataRequest,
): Promise<VaultField> {
  return vaultFetch<VaultFieldWire>(
    `/items/${encodeURIComponent(itemId)}/fields/${encodeURIComponent(fieldId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  ).then(normalizeWireField);
}

export function deleteVaultField(
  itemId: string,
  fieldId: string,
): Promise<void> {
  return vaultFetch<void>(
    `/items/${encodeURIComponent(itemId)}/fields/${encodeURIComponent(fieldId)}`,
    { method: "DELETE" },
  );
}

/** Explicit reveal of ONE `revealable` field. The response is the only
 *  plaintext-bearing shape — keep it component-local with an auto-clear. */
export function revealVaultField(
  itemId: string,
  fieldKey: string,
): Promise<VaultRevealResponse> {
  return vaultFetch<VaultRevealResponse>(
    `/items/${encodeURIComponent(itemId)}/reveal`,
    { method: "POST", body: JSON.stringify({ field_key: fieldKey }) },
  );
}

/** Metadata only. This intentionally bypasses query caches and never asks
 * Supabase for history, whose classified rows are server-owned. */
export function fetchVaultPasswordHistory(
  itemId: string,
  beforeRevision?: number,
): Promise<VaultPasswordHistoryResponse> {
  const query = beforeRevision ? `?before_revision=${beforeRevision}` : "";
  return vaultFetch<VaultPasswordHistoryResponse>(
    `/items/${encodeURIComponent(itemId)}/password-history${query}`,
    { cache: "no-store" },
  );
}

/** Explicitly reveal one historical password state. Keep its plaintext in a
 * transient component holder; no caller may cache or copy it automatically. */
export function revealVaultPasswordHistory(
  itemId: string,
  fieldId: string,
  revision: number,
): Promise<VaultPasswordHistoryRevealResponse> {
  return vaultFetch<VaultPasswordHistoryRevealResponse>(
    `/items/${encodeURIComponent(itemId)}/password-history/reveal`,
    {
      method: "POST",
      body: JSON.stringify({ field_id: fieldId, revision }),
      cache: "no-store",
    },
  );
}

/** Restore a recorded predecessor as a new current password revision. The
 * endpoint is no-store and returns metadata only. */
export function restoreVaultPasswordHistory(
  itemId: string,
  fieldId: string,
  revision: number,
  expectedHistoryRevision: number,
): Promise<VaultPasswordHistoryRestoreResponse> {
  return vaultFetch<VaultPasswordHistoryRestoreResponse>(
    `/items/${encodeURIComponent(itemId)}/password-history/restore`,
    {
      method: "POST",
      body: JSON.stringify({
        field_id: fieldId,
        revision,
        expected_history_revision: expectedHistoryRevision,
      }),
      cache: "no-store",
    },
  );
}

/** Browser-facing resolution of non-sealed fields ({item_id/field_key: value}).
 *  Used to show `visible` fields; sealed is structurally refused upstream. */
export function resolveVaultFields(
  refs: { item_id: string; field_key: string }[],
): Promise<Record<string, string>> {
  return vaultFetch<{ values: Record<string, string> }>("/resolve", {
    method: "POST",
    body: JSON.stringify({ refs }),
  }).then((r) => r.values);
}

export function rotateVaultItem(
  itemId: string,
  values: Record<string, string>,
): Promise<VaultItem> {
  return vaultFetch<VaultItemWire>(
    `/items/${encodeURIComponent(itemId)}/rotate`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    },
  ).then(normalizeWireItem);
}

/**
 * Organization access-mode flip ONLY (`all_members` ↔ `restricted`).
 *
 * This is the legacy REPLACE-the-whole-set path: it deletes and recreates
 * every grant, and drops all grantees when `all_members` is sent. Personal
 * sharing MUST use the per-recipient operations below — that is what stops a
 * share edit from silently revoking someone it never loaded.
 */
export function setVaultAccessMode(
  itemId: string,
  accessMode: VaultAccessMode,
  grantees: VaultGrantee[] = [],
): Promise<VaultItem> {
  return vaultFetch<VaultItemWire>(
    `/items/${encodeURIComponent(itemId)}/share`,
    {
      method: "PUT",
      body: JSON.stringify({ access_mode: accessMode, grantees }),
    },
  ).then(normalizeWireItem);
}

// ── Grants: one recipient at a time ───────────────────────────────────────

/** Current recipients. The share panel MUST load these before rendering. */
export function fetchVaultGrants(itemId: string): Promise<VaultGrant[]> {
  return vaultFetch<{ grants: VaultGrant[]; count: number }>(
    `/items/${encodeURIComponent(itemId)}/grants`,
  ).then((r) => r.grants);
}

/** Share with ONE person by exact email. Others are untouched. */
export function addVaultGrant(
  itemId: string,
  body: { recipient_email: string; can_use?: boolean; can_manage?: boolean },
): Promise<VaultGrant> {
  return vaultFetch<VaultGrant>(`/items/${encodeURIComponent(itemId)}/grants`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateVaultGrant(
  itemId: string,
  grantId: string,
  body: { can_use?: boolean; can_manage?: boolean },
): Promise<VaultGrant> {
  return vaultFetch<VaultGrant>(
    `/items/${encodeURIComponent(itemId)}/grants/${encodeURIComponent(grantId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

/** Revoke ONE recipient — immediate for list, reveal, and execution. */
export function removeVaultGrant(
  itemId: string,
  grantId: string,
): Promise<void> {
  return vaultFetch<void>(
    `/items/${encodeURIComponent(itemId)}/grants/${encodeURIComponent(grantId)}`,
    { method: "DELETE" },
  );
}

// ── Ownership transfer + assignment ───────────────────────────────────────

/** Move between the actor's OWN scopes (personal ↔ organization). */
export function transferVaultItem(
  itemId: string,
  to: VaultPrincipal,
): Promise<VaultItem> {
  return vaultFetch<VaultItemWire>(
    `/items/${encodeURIComponent(itemId)}/transfer`,
    {
      method: "POST",
      body: JSON.stringify({ to_principal: toPrincipalIn(to) }),
    },
  ).then(normalizeWireItem);
}

/**
 * Give ownership to ANOTHER user by exact email. The sender loses ALL future
 * access and every existing grant is cleared, so the response is a
 * confirmation rather than a usable item.
 */
export function giveVaultItemOwnership(
  itemId: string,
  recipientEmail: string,
): Promise<VaultTransferResponse> {
  return vaultFetch<VaultTransferResponse>(
    `/items/${encodeURIComponent(itemId)}/transfer`,
    {
      method: "POST",
      body: JSON.stringify({ recipient_email: recipientEmail }),
    },
  );
}

/**
 * Create an item ALREADY OWNED by someone else. With `generate_field_key` the
 * server generates that value and never returns it — the response carries
 * identity and confirmation only.
 */
export function assignVaultItem(
  body: VaultAssignRequest,
): Promise<VaultAssignResponse> {
  return vaultFetch<VaultAssignResponse>("/items/assign", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function forkVaultItem(
  itemId: string,
  to: VaultPrincipal,
): Promise<VaultItem> {
  return vaultFetch<VaultItemWire>(
    `/items/${encodeURIComponent(itemId)}/fork`,
    {
      method: "POST",
      body: JSON.stringify({ to_principal: toPrincipalIn(to) }),
    },
  ).then(normalizeWireItem);
}

export function fetchVaultAudit(
  itemId: string,
  limit = 100,
): Promise<VaultAuditEntry[]> {
  return vaultFetch<{ entries: VaultAuditEntry[]; count: number }>(
    `/items/${encodeURIComponent(itemId)}/audit?limit=${limit}`,
  ).then((r) => r.entries);
}

// ── Direct Supabase masked reads (the canonical list path) ────────────────

function normalizeField(row: VaultFieldMaskedRow): VaultField {
  return {
    id: row.id,
    credential_item_id: row.credential_item_id ?? "",
    field_key: row.field_key ?? "value",
    execution_purpose: normalizeExecutionPurpose(row.execution_purpose),
    env_key: row.key,
    handling: normalizeVaultHandling(row.handling),
    editable: row.editable,
    inject_into_sandbox: row.inject_into_sandbox,
    value_hint: row.value_hint ?? "",
    value_version: row.value_version,
    is_active: row.is_active,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Client-side capability projection for the direct list read. Mirrors
 * aidream's `item_capabilities` matrix; visibility under RLS already
 * implies `can_use`. Server responses carry authoritative capabilities
 * and every mutation is re-checked server-side regardless.
 */
function deriveCapabilities(
  item: CredentialItemMaskedRow,
  uid: string,
  opts: { orgAdmin: boolean; manageGrantItemIds: ReadonlySet<string> },
): VaultCapabilities {
  if (item.user_id === uid) {
    return {
      can_use: true,
      can_edit: true,
      can_reveal: true,
      can_manage: true,
    };
  }
  if (item.organization_id) {
    if (opts.orgAdmin) {
      return {
        can_use: true,
        can_edit: true,
        can_reveal: true,
        can_manage: true,
      };
    }
    const canManageGrant = opts.manageGrantItemIds.has(item.id);
    return {
      can_use: true,
      can_edit: canManageGrant,
      can_reveal: canManageGrant,
      can_manage: false,
    };
  }
  // Someone else's PERSONAL item that is visible to me: either it was shared
  // with me (grant) or I am a super-admin. `can_manage` stays false either
  // way — only the owner may share, transfer, or delete.
  const canManageGrant = opts.manageGrantItemIds.has(item.id);
  return {
    can_use: true,
    can_edit: canManageGrant,
    can_reveal: canManageGrant,
    can_manage: false,
  };
}

/**
 * WHERE THIS CREDENTIAL LIVES — read from the credential, never from the person.
 *
 * THE OWNER'S LAW (2026-09-23): the permission is to the person, never the
 * organization; the organization the person is working in never decides
 * whether ONE credential opens. `/vault/<id>` used to look the id up inside
 * whichever list scope happened to be showing ("Mine" by default), so a
 * credential of one of her organizations, or one shared with her, opened as
 * nothing. This asks the row itself under RLS — the same policies that decide
 * whether she may read it at all — and names the scope that holds it.
 *
 *   found     → the scope the credential is listed in (mine / shared / its organization)
 *   not-given → RLS returned no row: not hers, or not there (never told apart, on purpose)
 *   unavailable → we could not ask; never folded into either answer above
 */
export type CredentialHome =
  | { state: "found"; scope: VaultScope }
  | { state: "not-given" }
  | { state: "unavailable"; why: string };

export async function resolveCredentialHome(
  itemId: string,
): Promise<CredentialHome> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await getClaimsUser(supabase);
    if (userError || !user)
      return { state: "unavailable", why: "Not signed in" };
    const { data, error } = await supabase
      .schema("users")
      .from("credential_items")
      .select("id, user_id, organization_id")
      .eq("id", itemId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { state: "unavailable", why: error.message };
    if (!data) return { state: "not-given" };
    if (data.organization_id) {
      return {
        state: "found",
        scope: { kind: "organization", organizationId: data.organization_id },
      };
    }
    if (data.user_id === user.id)
      return { state: "found", scope: { kind: "mine" } };
    return { state: "found", scope: { kind: "shared" } };
  } catch (e) {
    return {
      state: "unavailable",
      why: e instanceof Error ? e.message : "The vault did not answer.",
    };
  }
}

// TYPING NOTE: `users.credential_item_holdings` arrives with
// migrations/campaign/errorshonest_s8_a_credential_says_how_much_it_holds.sql, which the chair applies
// to production; until `pnpm db-types` carries it, this facade types the one call (the commerce
// services' pattern). Delete it once database.types.ts names the function.
type HoldingsDatabase = {
  users: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      credential_item_holdings: {
        Args: { p_item_ids: string[] };
        Returns: HoldingRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/** The database's count of what each credential holds — see features/secrets/empty-read.ts. */
async function askCredentialHoldings(
  supabase: ReturnType<typeof createClient>,
  itemIds: string[],
): Promise<Holdings> {
  try {
    const { data, error } = await (
      supabase as unknown as SupabaseClient<HoldingsDatabase, "users">
    )
      .schema("users")
      .rpc("credential_item_holdings", { p_item_ids: itemIds });
    if (error) {
      return holdingsDoorIsAbsent(error.code)
        ? { state: "absent", why: `${error.code}: ${error.message}` }
        : { state: "unavailable", why: error.message };
    }
    return { state: "answered", rows: (data ?? []) as HoldingRow[] };
  } catch (e) {
    return {
      state: "unavailable",
      why: e instanceof Error ? e.message : "the vault did not answer",
    };
  }
}

/**
 * Masked item list for a declared SCOPE — the canonical FE list path
 * (direct Supabase).
 *
 * THE VIEW LAW: every scope declares its own filter; none of them is a bare
 * RLS-filtered read. `mine` filters on ownership, `organization` on the org,
 * and `shared` starts from the user's OWN grant rows (readable via the
 * `user_secret_grants_self_read` policy) and then fetches exactly those item
 * ids. So when access widens, a personal vault cannot suddenly fill with
 * other people's rows.
 */
export async function fetchVaultItems(
  scope: VaultScope,
  opts?: { orgAdmin?: boolean },
): Promise<VaultItem[]> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await getClaimsUser(supabase);
  if (userError || !user) throw new Error("Not signed in");

  let sharedItemIds: string[] | null = null;
  if (scope.kind === "shared") {
    const { data: myGrants, error: myGrantsError } = await supabase
      .schema("users")
      .from("user_secret_grants")
      .select("credential_item_id, can_use")
      .eq("user_id", user.id)
      .not("credential_item_id", "is", null);
    assertVaultData(myGrants, myGrantsError);
    sharedItemIds = Array.from(
      new Set(
        (myGrants ?? [])
          .filter((g) => g.can_use && g.credential_item_id)
          .map((g) => g.credential_item_id as string),
      ),
    );
    if (sharedItemIds.length === 0) return [];
  }

  let itemsQuery = supabase
    .schema("users")
    .from("credential_items")
    .select(CREDENTIAL_ITEM_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (scope.kind === "organization") {
    itemsQuery = itemsQuery.eq("organization_id", scope.organizationId);
  } else if (scope.kind === "shared") {
    // Items I was granted — deliberately EXCLUDING my own, which live in Mine.
    itemsQuery = itemsQuery
      .in("id", sharedItemIds ?? [])
      .neq("user_id", user.id);
  } else {
    itemsQuery = itemsQuery.eq("user_id", user.id);
  }

  const { data: itemRows, error: itemsError } = await itemsQuery;
  assertVaultData(itemRows, itemsError);
  const items = (itemRows ?? []) as CredentialItemMaskedRow[];
  if (items.length === 0) return [];

  const itemIds = items.map((i) => i.id);

  const { data: fieldRows, error: fieldsError } = await supabase
    .schema("users")
    .from("user_secrets")
    .select(VAULT_FIELD_COLUMNS)
    .in("credential_item_id", itemIds)
    .is("deleted_at", null)
    .order("field_key", { ascending: true });
  assertVaultData(fieldRows, fieldsError);

  const { data: attachmentRows, error: attachmentsError } = await supabase
    .schema("users")
    .from("credential_attachments")
    .select(VAULT_ATTACHMENT_COLUMNS)
    .in("credential_item_id", itemIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  assertVaultData(attachmentRows, attachmentsError);

  // 🚨 AN EMPTY READ IS NOT AN EMPTY VAULT (DD-160) — AND AN EMPTY CREDENTIAL IS NOT A FAILED READ.
  //
  // RLS does not error when it refuses a row — it returns `[]` with
  // `error === null`. From 2026-07 until 2026-09-12 a RESTRICTIVE
  // `platform_admin_select_only` policy on `users.user_secrets` and
  // `users.credential_attachments` ANDed every non-staff read to false, so the
  // OWNER of a credential read their items and none of their fields, and this
  // function reported success and rendered an item with nothing in it.
  //
  // From the client the two cases are the same empty array, so this used to
  // GUESS from the whole scope — and blanked Pinecrest Records' list, whose only
  // credential (its Bandcamp label login) simply held nothing yet. It now asks
  // the database how much each empty-reading credential holds
  // (`users.credential_item_holdings`, counts only) and alarms only for one that
  // holds something the read did not return — features/secrets/empty-read.ts.
  const readableItemIds = new Set<string>();
  for (const row of (fieldRows ?? []) as VaultFieldMaskedRow[]) {
    if (row.credential_item_id) readableItemIds.add(row.credential_item_id);
  }
  for (const row of (attachmentRows ?? []) as VaultAttachmentMaskedRow[]) {
    readableItemIds.add(row.credential_item_id);
  }
  const emptyItemIds = items
    .filter((i) => !readableItemIds.has(i.id))
    .map((i) => i.id);
  if (emptyItemIds.length > 0) {
    const alarm = emptyReadAlarm(
      items.length,
      emptyItemIds,
      await askCredentialHoldings(supabase, emptyItemIds),
    );
    if (alarm) throw new Error(alarm);
  }

  // My own grants refine capabilities for rows I don't own (self-read policy).
  let manageGrantItemIds = new Set<string>();
  const needsGrantRefine =
    scope.kind === "shared" ||
    (scope.kind === "organization" && !opts?.orgAdmin);
  if (needsGrantRefine) {
    const { data: grantRows, error: grantsError } = await supabase
      .schema("users")
      .from("user_secret_grants")
      .select("credential_item_id, can_manage")
      .eq("user_id", user.id)
      .in("credential_item_id", itemIds);
    assertVaultData(grantRows, grantsError);
    manageGrantItemIds = new Set(
      (grantRows ?? [])
        .filter((g) => g.can_manage && g.credential_item_id)
        .map((g) => g.credential_item_id as string),
    );
  }

  const fieldsByItem = new Map<string, VaultField[]>();
  for (const row of (fieldRows ?? []) as VaultFieldMaskedRow[]) {
    if (!row.credential_item_id) continue;
    const list = fieldsByItem.get(row.credential_item_id) ?? [];
    list.push(normalizeField(row));
    fieldsByItem.set(row.credential_item_id, list);
  }

  const attachmentsByItem = new Map<string, VaultAttachment[]>();
  for (const row of (attachmentRows ?? []) as VaultAttachmentMaskedRow[]) {
    const list = attachmentsByItem.get(row.credential_item_id) ?? [];
    list.push(
      normalizeWireAttachment({
        ...row,
        handling: normalizeVaultHandling(row.handling),
      }),
    );
    attachmentsByItem.set(row.credential_item_id, list);
  }

  return items.map((item) => ({
    id: item.id,
    user_id: item.user_id,
    organization_id: item.organization_id,
    definition_key: item.definition_key,
    definition_version: item.definition_version,
    provider_key: item.provider_key,
    display_name: item.display_name,
    description: item.description,
    tags: item.tags,
    status: item.status,
    source: item.source,
    access_mode: item.access_mode,
    lifecycle: (item.lifecycle ?? {}) as Record<string, unknown>,
    login_urls: item.login_urls ?? [],
    uri_match_mode: item.uri_match_mode ?? "host",
    notes: item.notes,
    non_secret_fields: normalizeNonSecretFields(item.non_secret_fields),
    browser_fill_enabled: item.browser_fill_enabled ?? false,
    created_at: item.created_at,
    updated_at: item.updated_at,
    fields: fieldsByItem.get(item.id) ?? [],
    attachments: attachmentsByItem.get(item.id) ?? [],
    capabilities: deriveCapabilities(item, user.id, {
      orgAdmin: opts?.orgAdmin ?? false,
      manageGrantItemIds,
    }),
  }));
}

// ── Catalog definitions (public.catalog_entries, kind=credential_definition) ─

export async function fetchCredentialDefinitions(): Promise<
  CredentialDefinition[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("catalog_entries")
    .select("key, payload, sort_order")
    .eq("kind", "credential_definition")
    .eq("app", "matrx")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("key", { ascending: true });
  assertVaultData(data, error, "load the credential catalog");

  const defs: CredentialDefinition[] = [];
  for (const row of data ?? []) {
    const parsed = credentialDefinitionSchema.safeParse(row.payload);
    if (!parsed.success) {
      // Loud: a catalog row failing its own schema is a data defect.
      console.error(
        `[vault] credential_definition '${row.key}' failed schema validation — skipped`,
        parsed.error.issues,
      );
      continue;
    }
    defs.push({ key: row.key, payload: parsed.data });
  }
  return defs;
}
