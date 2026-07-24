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
  credentialDefinitionSchema,
} from "@/features/admin/applications/catalogs/schemas";
import {
  CREDENTIAL_ITEM_COLUMNS,
  VAULT_FIELD_COLUMNS,
  normalizeWireField,
  normalizeWireItem,
  toPrincipalIn,
  type CredentialDefinition,
  type CredentialItemMaskedRow,
  type VaultAccessMode,
  type VaultAuditEntry,
  type VaultCapabilities,
  type VaultField,
  type VaultFieldIn,
  type VaultFieldMaskedRow,
  type VaultFieldMetadataRequest,
  type VaultFieldWire,
  type VaultGrantee,
  type VaultImportEnvRequest,
  type VaultItem,
  type VaultItemCreateRequest,
  type VaultItemUpdateRequest,
  type VaultItemWire,
  type VaultPrincipal,
  type VaultRevealResponse,
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

export function createVaultItem(body: VaultItemCreateRequest): Promise<VaultItem> {
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

export function deleteVaultField(itemId: string, fieldId: string): Promise<void> {
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
  return vaultFetch<VaultItemWire>(`/items/${encodeURIComponent(itemId)}/rotate`, {
    method: "POST",
    body: JSON.stringify({ values }),
  }).then(normalizeWireItem);
}

export function shareVaultItem(
  itemId: string,
  accessMode: VaultAccessMode,
  grantees: VaultGrantee[],
): Promise<VaultItem> {
  return vaultFetch<VaultItemWire>(`/items/${encodeURIComponent(itemId)}/share`, {
    method: "PUT",
    body: JSON.stringify({ access_mode: accessMode, grantees }),
  }).then(normalizeWireItem);
}

export function transferVaultItem(
  itemId: string,
  to: VaultPrincipal,
): Promise<VaultItem> {
  return vaultFetch<VaultItemWire>(`/items/${encodeURIComponent(itemId)}/transfer`, {
    method: "POST",
    body: JSON.stringify({ to_principal: toPrincipalIn(to) }),
  }).then(normalizeWireItem);
}

export function forkVaultItem(
  itemId: string,
  to: VaultPrincipal,
): Promise<VaultItem> {
  return vaultFetch<VaultItemWire>(`/items/${encodeURIComponent(itemId)}/fork`, {
    method: "POST",
    body: JSON.stringify({ to_principal: toPrincipalIn(to) }),
  }).then(normalizeWireItem);
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
    return { can_use: true, can_edit: true, can_reveal: true, can_manage: true };
  }
  if (item.organization_id) {
    if (opts.orgAdmin) {
      return { can_use: true, can_edit: true, can_reveal: true, can_manage: true };
    }
    const canManageGrant = opts.manageGrantItemIds.has(item.id);
    return {
      can_use: true,
      can_edit: canManageGrant,
      can_reveal: canManageGrant,
      can_manage: false,
    };
  }
  // Personal item visible without ownership: super-admin read.
  return { can_use: true, can_edit: false, can_reveal: false, can_manage: false };
}

/**
 * Masked item list for a declared view — the canonical FE list path
 * (direct Supabase; scope declared explicitly per THE VIEW LAW).
 */
export async function fetchVaultItems(
  principal: VaultPrincipal,
  opts?: { orgAdmin?: boolean },
): Promise<VaultItem[]> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Not signed in");

  let itemsQuery = supabase
    .schema("users")
    .from("credential_items")
    .select(CREDENTIAL_ITEM_COLUMNS)
    .is("deleted_at", null)
    .order("display_name", { ascending: true })
    .order("id", { ascending: true });
  itemsQuery =
    principal.type === "organization"
      ? itemsQuery.eq("organization_id", principal.organizationId)
      : itemsQuery.eq("user_id", user.id);

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

  // Own manage-grants refine org capabilities (self-read RLS policy).
  let manageGrantItemIds = new Set<string>();
  if (principal.type === "organization" && !opts?.orgAdmin) {
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
    created_at: item.created_at,
    updated_at: item.updated_at,
    fields: fieldsByItem.get(item.id) ?? [],
    capabilities: deriveCapabilities(item, user.id, {
      orgAdmin: opts?.orgAdmin ?? false,
      manageGrantItemIds,
    }),
  }));
}

// ── Catalog definitions (public.catalog_entries, kind=credential_definition) ─

export async function fetchCredentialDefinitions(): Promise<CredentialDefinition[]> {
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
