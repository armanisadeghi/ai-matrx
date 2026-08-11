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
  type VaultRevealResponse,
  type VaultScope,
  type VaultTransferResponse,
  type VaultHandling,
} from "./types";

// ── aidream /api/vault client ─────────────────────────────────────────────

function backendBase(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com"
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

async function vaultFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  let resp: Response;
  try {
    resp = await fetch(`${backendBase()}/api/vault${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });
  } catch {
    throw new Error(
      "Vault service unreachable — value operations need the backend online",
    );
  }
  if (!resp.ok) {
    let detail: string | undefined;
    try {
      const body = (await resp.json()) as { detail?: unknown };
      detail =
        typeof body.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      detail = await resp.text().catch(() => undefined);
    }
    throw new Error(detail || `HTTP ${resp.status}`);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export function createVaultItem(
  body: VaultItemCreateRequest,
): Promise<VaultItem> {
  return vaultFetch<VaultItemWire>("/items", {
    method: "POST",
    body: JSON.stringify(body),
  }).then(normalizeWireItem);
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
    env_key: row.key,
    handling: row.handling,
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
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Not signed in");

  let sharedItemIds: string[] | null = null;
  if (scope.kind === "shared") {
    const { data: myGrants, error: myGrantsError } = await supabase
      .schema("users")
      .from("user_secret_grants")
      .select("credential_item_id, can_use")
      .eq("user_id", user.id)
      .not("credential_item_id", "is", null);
    if (myGrantsError) throw new Error(myGrantsError.message);
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
    .order("display_name", { ascending: true })
    .order("id", { ascending: true });
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
  if (itemsError) throw new Error(itemsError.message);
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
  if (fieldsError) throw new Error(fieldsError.message);

  const { data: attachmentRows, error: attachmentsError } = await supabase
    .schema("users")
    .from("credential_attachments")
    .select(VAULT_ATTACHMENT_COLUMNS)
    .in("credential_item_id", itemIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (attachmentsError) throw new Error(attachmentsError.message);

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
    if (grantsError) throw new Error(grantsError.message);
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
        handling: row.handling as VaultHandling,
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
  if (error) throw new Error(error.message);

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
