import { supabase } from "@/utils/supabase/client";
export interface ProviderAccountRegistryRow {
  id: string;
  providerKey: string;
  environmentKey: string;
  issuer: string | null;
  accountKind: string;
  loginIdentity: string | null;
  loginIdentityStatus: "verified" | "needs_verification" | "not_applicable";
  displayName: string;
  workspaceName: string | null;
  externalAccountId: string | null;
  status: string;
  authMethod: string;
  loginUrl: string | null;
  lastVerifiedAt: string | null;
  safeNotes: string | null;
  credentialCount: number;
  primaryCredentialPresent: boolean;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseProviderAccount(
  value: unknown,
): ProviderAccountRegistryRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Provider account registry returned an invalid row.");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.provider_key !== "string" ||
    typeof row.environment_key !== "string" ||
    typeof row.account_kind !== "string" ||
    !["verified", "needs_verification", "not_applicable"].includes(
      String(row.login_identity_status),
    ) ||
    typeof row.display_name !== "string" ||
    typeof row.status !== "string" ||
    typeof row.auth_method !== "string"
  ) {
    throw new Error("Provider account registry returned an incomplete row.");
  }
  return {
    id: row.id,
    providerKey: row.provider_key,
    environmentKey: row.environment_key,
    issuer: textOrNull(row.issuer),
    accountKind: row.account_kind,
    loginIdentity: textOrNull(row.login_identity),
    loginIdentityStatus:
      row.login_identity_status as ProviderAccountRegistryRow["loginIdentityStatus"],
    displayName: row.display_name,
    workspaceName: textOrNull(row.workspace_name),
    externalAccountId: textOrNull(row.external_account_id),
    status: row.status,
    authMethod: row.auth_method,
    loginUrl: textOrNull(row.login_url),
    lastVerifiedAt: textOrNull(row.last_verified_at),
    safeNotes: textOrNull(row.safe_notes),
    credentialCount:
      typeof row.credential_count === "number" ? row.credential_count : 0,
    primaryCredentialPresent: row.primary_credential_present === true,
  };
}

export async function listProviderAccounts(
  organizationId: string,
): Promise<ProviderAccountRegistryRow[]> {
  const { data, error } = await supabase
    .schema("public")
    .rpc("provider_account_list", {
      p_organization_id: organizationId,
    });
  if (error) {
    throw new Error(`Could not load provider accounts: ${error.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error("Provider account registry returned an invalid response.");
  }
  return data.map(parseProviderAccount);
}
