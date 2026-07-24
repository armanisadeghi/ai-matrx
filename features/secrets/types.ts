/**
 * Unified Credential Vault — types.
 *
 * ONE contract for both principals (personal | organization), per
 * common-docs/projects/unified-credential-vault/PLAN.md.
 *
 * Wire shapes come from aidream's generated OpenAPI contracts
 * (`/api/vault/*` — never hand-mirrored); masked metadata read directly
 * from Supabase is NORMALIZED into the same `VaultItem` shape so the
 * whole workspace consumes one type regardless of the read path.
 *
 * Plaintext values NEVER appear on any listed shape. The only plaintext
 * shape is `VaultRevealResponse` — short-lived, component-local, never
 * stored in Redux / browser storage / query caches.
 */
import type { z } from "zod";

import type { components } from "@/types/python-generated/api-types";
import type { Database } from "@/types/database.types";
import type {
  credentialDefinitionSchema,
  credentialFieldSchema,
} from "@/features/admin/applications/catalogs/schemas";

type ApiSchemas = components["schemas"];

// ── Wire shapes (generated — the source of truth) ─────────────────────────

export type VaultItemWire = ApiSchemas["VaultItemOut"];
export type VaultFieldWire = ApiSchemas["VaultFieldOut"];
export type VaultCapabilities = ApiSchemas["VaultCapabilities"];

/** Wire field with server defaults materialized (see `normalizeWireField`).
 *  Built with `Pick` (not `Omit`) because the generated wire types carry a
 *  string index signature that makes `Omit` collapse every prop to unknown. */
export type VaultField = Pick<
  VaultFieldWire,
  "id" | "credential_item_id" | "field_key" | "created_at" | "updated_at"
> & {
  env_key: string | null;
  handling: string;
  editable: boolean;
  inject_into_sandbox: boolean;
  value_hint: string;
  value_version: number;
  is_active: boolean;
  description: string | null;
};

/** Wire item with server defaults materialized (see `normalizeWireItem`).
 *  The whole workspace consumes THIS shape from both read paths. */
export type VaultItem = Pick<
  VaultItemWire,
  "id" | "display_name" | "created_at" | "updated_at"
> & {
  definition_key: string;
  definition_version: number;
  status: string;
  source: string;
  access_mode: string;
  user_id: string | null;
  organization_id: string | null;
  provider_key: string | null;
  description: string | null;
  tags: string[];
  lifecycle: Record<string, unknown>;
  fields: VaultField[];
  capabilities: VaultCapabilities;
};

export function normalizeWireField(wire: VaultFieldWire): VaultField {
  return {
    ...wire,
    env_key: wire.env_key ?? null,
    handling: wire.handling ?? "revealable",
    editable: wire.editable ?? true,
    inject_into_sandbox: wire.inject_into_sandbox ?? false,
    value_hint: wire.value_hint ?? "",
    value_version: wire.value_version ?? 1,
    is_active: wire.is_active ?? true,
    description: wire.description ?? null,
  };
}

export function normalizeWireItem(wire: VaultItemWire): VaultItem {
  return {
    ...wire,
    definition_key: wire.definition_key ?? "custom",
    definition_version: wire.definition_version ?? 1,
    status: wire.status ?? "active",
    source: wire.source ?? "manual",
    access_mode: wire.access_mode ?? "all_members",
    user_id: wire.user_id ?? null,
    organization_id: wire.organization_id ?? null,
    provider_key: wire.provider_key ?? null,
    description: wire.description ?? null,
    tags: wire.tags ?? [],
    lifecycle: wire.lifecycle ?? {},
    fields: (wire.fields ?? []).map(normalizeWireField),
    capabilities: wire.capabilities ?? {
      can_use: false,
      can_edit: false,
      can_reveal: false,
      can_manage: false,
    },
  };
}
export type VaultPrincipalIn = ApiSchemas["PrincipalIn"];
export type VaultFieldIn = ApiSchemas["FieldIn"];
export type VaultItemCreateRequest = ApiSchemas["VaultItemCreateRequest"];
export type VaultItemUpdateRequest = ApiSchemas["VaultItemUpdateRequest"];
export type VaultImportEnvRequest = ApiSchemas["VaultImportEnvRequest"];
export type VaultFieldMetadataRequest = ApiSchemas["VaultFieldMetadataRequest"];
export type VaultGrantee = ApiSchemas["GranteeIn"];
export type VaultRevealResponse = ApiSchemas["VaultRevealResponse"];
export type VaultShareRequest = ApiSchemas["VaultShareRequest"];
export type VaultAuditEntry = ApiSchemas["VaultAuditEntry"];

export type VaultHandling = VaultFieldIn["handling"];
export type VaultAccessMode = VaultShareRequest["access_mode"];

// ── Principal (frontend view descriptor) ──────────────────────────────────

export type VaultPrincipal =
  | { type: "user" }
  | { type: "organization"; organizationId: string };

export function toPrincipalIn(principal: VaultPrincipal): VaultPrincipalIn {
  return principal.type === "organization"
    ? { type: "organization", organization_id: principal.organizationId }
    : { type: "user" };
}

// ── Direct-Supabase masked rows (explicit column lists — see service) ─────

type CredentialItemsRow = Database["users"]["Tables"]["credential_items"]["Row"];
type UserSecretsRow = Database["users"]["Tables"]["user_secrets"]["Row"];

/** Masked item metadata columns the browser may select. NEVER `select *`. */
export const CREDENTIAL_ITEM_COLUMNS =
  "id, user_id, organization_id, definition_key, definition_version, provider_key, display_name, description, tags, status, source, access_mode, lifecycle, created_at, updated_at" as const;

/** Masked field columns. `value_encrypted` is UNREADABLE by client roles —
 *  never select it, never `select *` on `users.user_secrets`. */
export const VAULT_FIELD_COLUMNS =
  "id, credential_item_id, field_key, key, handling, editable, inject_into_sandbox, value_hint, value_version, is_active, description, created_at, updated_at" as const;

export type CredentialItemMaskedRow = Pick<
  CredentialItemsRow,
  | "id"
  | "user_id"
  | "organization_id"
  | "definition_key"
  | "definition_version"
  | "provider_key"
  | "display_name"
  | "description"
  | "tags"
  | "status"
  | "source"
  | "access_mode"
  | "lifecycle"
  | "created_at"
  | "updated_at"
>;

export type VaultFieldMaskedRow = Pick<
  UserSecretsRow,
  | "id"
  | "credential_item_id"
  | "field_key"
  | "key"
  | "handling"
  | "editable"
  | "inject_into_sandbox"
  | "value_hint"
  | "value_version"
  | "is_active"
  | "description"
  | "created_at"
  | "updated_at"
>;

// ── Catalog definitions (payload schema reused from Remote Catalogs) ──────

export type CredentialDefinitionPayload = z.infer<typeof credentialDefinitionSchema>;
export type CredentialFieldDef = z.infer<typeof credentialFieldSchema>;

export interface CredentialDefinition {
  /** catalog_entries.key — the stable definition key ('env_value', …). */
  key: string;
  payload: CredentialDefinitionPayload;
}

export type CredentialFamily = CredentialDefinitionPayload["family"];

export const FAMILY_LABELS: Record<CredentialFamily, string> = {
  generic: "Generic",
  ai_providers: "AI & model providers",
  source_control: "Source control & dev tools",
  cloud_infrastructure: "Cloud & infrastructure",
  databases: "Databases & data services",
  hosting_deployment: "Hosting & deployment",
  server_network: "Server & network access",
  domains_dns_cdn: "Domains, DNS & CDN",
  messaging_communications: "Messaging & communications",
  payments_commerce: "Payments & commerce",
  business_platforms: "Business platforms",
  analytics_marketing: "Analytics & marketing",
  cms_content: "CMS & content",
  identity_security: "Identity & security",
  automation_integrations: "Automation & integrations",
  signing_files: "Signing & files",
};

export const HANDLING_LABELS: Record<string, string> = {
  visible: "Visible",
  revealable: "Revealable",
  sealed: "Sealed",
};

/** The legacy single-field type every backfilled env row uses. */
export const ENV_VALUE_DEFINITION_KEY = "env_value";

/** Mirrors the DB CHECK constraint on the optional env alias. */
export const VALID_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Stable field identity within an item (lowercase snake_case). */
export const FIELD_KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Effective fields of a definition: a provider preset's fields FULLY
 * replace the base definition's fields when the preset declares any;
 * otherwise the base's fields apply.
 */
export function effectiveFields(
  def: CredentialDefinition,
  byKey: Map<string, CredentialDefinition>,
): CredentialFieldDef[] {
  const own = def.payload.fields ?? [];
  if (own.length > 0) return own;
  const baseKey = def.payload.base_definition_key;
  if (baseKey) {
    const base = byKey.get(baseKey);
    if (base) return base.payload.fields ?? [];
  }
  return [];
}
