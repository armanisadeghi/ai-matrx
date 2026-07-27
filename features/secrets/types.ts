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
  /** PLAINTEXT destination metadata (never encrypted; RLS-protected). */
  login_urls: string[];
  uri_match_mode: string;
  notes: string | null;
  non_secret_fields: NonSecretField[];
  browser_fill_enabled: boolean;
  fields: VaultField[];
  capabilities: VaultCapabilities;
};

/** One user-authored PLAINTEXT custom field. Never a secret — the UI labels
 *  the whole section "Not encrypted". */
export interface NonSecretField {
  key: string;
  label: string;
  value: string;
}

export function normalizeNonSecretFields(raw: unknown): NonSecretField[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    if (typeof e.key !== "string" || typeof e.label !== "string") return [];
    return [{ key: e.key, label: e.label, value: String(e.value ?? "") }];
  });
}

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
    login_urls: wire.login_urls ?? [],
    uri_match_mode: wire.uri_match_mode ?? "host",
    notes: wire.notes ?? null,
    non_secret_fields: normalizeNonSecretFields(wire.non_secret_fields),
    browser_fill_enabled: wire.browser_fill_enabled ?? false,
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
export type VaultGrant = ApiSchemas["VaultGrantOut"];
export type VaultGrantAddRequest = ApiSchemas["VaultGrantAddRequest"];
export type VaultAssignRequest = ApiSchemas["VaultAssignRequest"];
export type VaultAssignResponse = ApiSchemas["VaultAssignResponse"];
export type VaultTransferResponse = ApiSchemas["VaultTransferResponse"];

/** URL matching rule for browser fill. `host` = same host, any path;
 *  `exact` = same host AND path; `never` = this item is never auto-filled. */
export type UriMatchMode = "host" | "exact" | "never";

export const URI_MATCH_MODE_LABELS: Record<UriMatchMode, string> = {
  host: "Any page on this site",
  exact: "Only this exact URL",
  never: "Never fill automatically",
};

/** The destination-first login definition (ratified 2026-07-26). */
export const WEBSITE_LOGIN_DEFINITION_KEY = "website_login";

/** Encrypted field keys that historically hold a destination URL. These items
 *  cannot browser-match until the URL is promoted into plaintext `login_urls`
 *  — an explicit, warned declassification the user performs. */
export const PROMOTABLE_URL_FIELD_KEYS = [
  "site_url",
  "panel_url",
  "portal_url",
] as const;

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

/**
 * The list scope the user is looking at. Each is a DELIBERATE query, never a
 * bare RLS-filtered read (THE VIEW LAW): `mine` filters on ownership,
 * `shared` starts from the user's own grant rows, `organization` filters on
 * the org. Widening access must never silently flood a scope.
 */
export type VaultScope =
  | { kind: "mine" }
  | { kind: "shared" }
  | { kind: "organization"; organizationId: string };

export const VAULT_SCOPE_LABELS = {
  mine: "Mine",
  shared: "Shared with me",
  organization: "Organization",
} as const;

/** The owning principal a scope writes to. "Shared with me" owns nothing —
 *  creating from that scope is meaningless, so the UI hides create there. */
export function scopeToPrincipal(scope: VaultScope): VaultPrincipal | null {
  if (scope.kind === "mine") return { type: "user" };
  if (scope.kind === "organization") {
    return { type: "organization", organizationId: scope.organizationId };
  }
  return null;
}

// ── Direct-Supabase masked rows (explicit column lists — see service) ─────

type CredentialItemsRow = Database["users"]["Tables"]["credential_items"]["Row"];
type UserSecretsRow = Database["users"]["Tables"]["user_secrets"]["Row"];

/** Masked item metadata columns the browser may select. NEVER `select *`.
 *  The destination-login columns are plaintext BY DESIGN and safe to list. */
export const CREDENTIAL_ITEM_COLUMNS =
  "id, user_id, organization_id, definition_key, definition_version, provider_key, display_name, description, tags, status, source, access_mode, lifecycle, login_urls, uri_match_mode, notes, non_secret_fields, browser_fill_enabled, created_at, updated_at" as const;

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
  | "login_urls"
  | "uri_match_mode"
  | "notes"
  | "non_secret_fields"
  | "browser_fill_enabled"
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
