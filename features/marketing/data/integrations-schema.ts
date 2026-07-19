import type { Json } from "@/types/database.types";

export const credentialAuthorities = [
  "user_secret",
  "organization_secret",
  "external_connection",
] as const;

export type CredentialAuthority = (typeof credentialAuthorities)[number];

export interface ProviderIntegrationDraft {
  enabled: boolean;
  credentialAuthority: CredentialAuthority | "";
  credentialRef: string;
  resourceRef: string;
}

export interface CustomProviderIntegrationDraft extends ProviderIntegrationDraft {
  id: string;
  key: string;
  label: string;
}

export interface SiteIntegrationsDraft {
  googleSearchConsole: ProviderIntegrationDraft;
  googleAnalytics4: ProviderIntegrationDraft;
  pageSpeedInsights: ProviderIntegrationDraft;
  customProviders: CustomProviderIntegrationDraft[];
}

export type BuiltInProviderKey =
  "googleSearchConsole" | "googleAnalytics4" | "pageSpeedInsights";

export interface IntegrationValidationIssue {
  field: string;
  message: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_KEY_PATTERN = /^[a-z][a-z0-9._-]{1,63}$/;
const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const NAMESPACED_RESOURCE_PATTERN =
  /^[a-z][a-z0-9._-]{1,31}:[a-z0-9][a-z0-9._:/-]{0,180}$/i;
const PROHIBITED_SECRET_KEYS = new Set([
  "access_token",
  "api_key",
  "client_secret",
  "encrypted_payload",
  "id_token",
  "password",
  "private_key",
  "refresh_token",
  "secret",
  "token",
]);

export const emptyProviderIntegration = (): ProviderIntegrationDraft => ({
  enabled: false,
  credentialAuthority: "",
  credentialRef: "",
  resourceRef: "",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function authorityValue(value: unknown): CredentialAuthority | "" {
  return credentialAuthorities.includes(value as CredentialAuthority)
    ? (value as CredentialAuthority)
    : "";
}

function parseProvider(value: unknown): ProviderIntegrationDraft {
  if (!isRecord(value)) return emptyProviderIntegration();
  return {
    enabled: value.enabled === true,
    credentialAuthority: authorityValue(value.credential_authority),
    credentialRef: stringValue(value.credential_ref),
    resourceRef: stringValue(value.resource_ref),
  };
}

export function parseSiteIntegrations(value: Json): SiteIntegrationsDraft {
  const root = isRecord(value) ? value : {};
  const marketing = isRecord(root.marketing) ? root.marketing : {};
  const providers = isRecord(marketing.providers) ? marketing.providers : {};
  const custom = Array.isArray(marketing.custom_providers)
    ? marketing.custom_providers
    : [];

  return {
    googleSearchConsole: parseProvider(providers.google_search_console),
    googleAnalytics4: parseProvider(providers.google_analytics_4),
    pageSpeedInsights: parseProvider(providers.pagespeed_insights),
    customProviders: custom.flatMap((value, index) => {
      if (!isRecord(value)) return [];
      return [
        {
          ...parseProvider(value),
          id: stringValue(value.id) || `custom-${index + 1}`,
          key: stringValue(value.key),
          label: stringValue(value.label),
        },
      ];
    }),
  };
}

function prohibitedSecretField(
  value: unknown,
  path = "integrations",
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = prohibitedSecretField(value[index], `${path}[${index}]`);
      if (match) return match;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (PROHIBITED_SECRET_KEYS.has(key.toLowerCase())) return nextPath;
    const match = prohibitedSecretField(child, nextPath);
    if (match) return match;
  }
  return null;
}

function providerDocument(
  provider: ProviderIntegrationDraft,
): Record<string, Json> {
  return {
    enabled: provider.enabled,
    credential_authority: provider.credentialAuthority || null,
    credential_ref: provider.credentialRef.trim() || null,
    resource_ref: provider.resourceRef.trim() || null,
  };
}

export function buildSiteIntegrations(
  existing: Json,
  draft: SiteIntegrationsDraft,
): Json {
  const issues = validateSiteIntegrations(draft);
  if (issues.length) {
    throw new Error(issues[0].message);
  }
  const unsafeField = prohibitedSecretField(existing);
  if (unsafeField) {
    throw new Error(
      `Cannot save while ${unsafeField} contains a secret field. Move the secret to the credential authority first.`,
    );
  }
  const root = isRecord(existing) ? existing : {};
  return {
    ...root,
    marketing: {
      schema_version: 1,
      providers: {
        google_search_console: providerDocument(draft.googleSearchConsole),
        google_analytics_4: providerDocument(draft.googleAnalytics4),
        pagespeed_insights: providerDocument(draft.pageSpeedInsights),
      },
      custom_providers: draft.customProviders.map((provider) => ({
        ...providerDocument(provider),
        id: provider.id,
        key: provider.key.trim(),
        label: provider.label.trim(),
      })),
    },
  };
}

function looksLikeSecret(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^(?:Bearer\s|ya29\.|AIza|eyJ|-----BEGIN)/i.test(trimmed) ||
    /(?:access[_-]?token|api[_-]?key|client[_-]?secret|refresh[_-]?token)/i.test(
      trimmed,
    ) ||
    (!trimmed.includes("://") && trimmed.length > 180)
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeGenericResource(value: string): boolean {
  if (!value || looksLikeSecret(value)) return false;
  return (
    /^\d{1,24}$/.test(value) ||
    isHttpUrl(value) ||
    DOMAIN_PATTERN.test(value) ||
    NAMESPACED_RESOURCE_PATTERN.test(value)
  );
}

function validateCredential(
  provider: ProviderIntegrationDraft,
  field: string,
  label: string,
  issues: IntegrationValidationIssue[],
) {
  const reference = provider.credentialRef.trim();
  if (provider.enabled && !provider.credentialAuthority) {
    issues.push({
      field: `${field}.credentialAuthority`,
      message: `${label} needs a credential authority.`,
    });
  }
  if (provider.enabled && !reference) {
    issues.push({
      field: `${field}.credentialRef`,
      message: `${label} needs a credential reference UUID.`,
    });
  }
  if (provider.credentialAuthority && !reference) {
    issues.push({
      field: `${field}.credentialRef`,
      message: `${label} has an authority but no credential reference.`,
    });
  }
  if (reference && !provider.credentialAuthority) {
    issues.push({
      field: `${field}.credentialAuthority`,
      message: `${label} has a credential reference but no authority.`,
    });
  }
  if (reference && !UUID_PATTERN.test(reference)) {
    issues.push({
      field: `${field}.credentialRef`,
      message: `${label} must reference a stable credential UUID, never a token or secret.`,
    });
  }
}

function validateBuiltIn(
  provider: ProviderIntegrationDraft,
  field: BuiltInProviderKey,
  label: string,
  resourceKind: "gsc" | "ga4" | "optional",
  issues: IntegrationValidationIssue[],
) {
  if (field !== "pageSpeedInsights") {
    validateCredential(provider, field, label, issues);
  }
  const resource = provider.resourceRef.trim();
  if (provider.enabled && resourceKind !== "optional" && !resource) {
    issues.push({
      field: `${field}.resourceRef`,
      message: `${label} needs a property reference.`,
    });
    return;
  }
  if (!resource) return;

  const valid =
    resourceKind === "gsc"
      ? resource.startsWith("sc-domain:")
        ? DOMAIN_PATTERN.test(resource.slice("sc-domain:".length))
        : isHttpUrl(resource)
      : resourceKind === "ga4"
        ? /^(?:properties\/)?\d{4,24}$/.test(resource)
        : isSafeGenericResource(resource);
  if (!valid || looksLikeSecret(resource)) {
    issues.push({
      field: `${field}.resourceRef`,
      message:
        resourceKind === "gsc"
          ? `${label} property must be an HTTP(S) URL or sc-domain:example.com.`
          : resourceKind === "ga4"
            ? `${label} property must be a numeric ID or properties/123456.`
            : `${label} resource must be a URL, domain, numeric ID, or namespaced reference.`,
    });
  }
}

export function validateSiteIntegrations(
  draft: SiteIntegrationsDraft,
): IntegrationValidationIssue[] {
  const issues: IntegrationValidationIssue[] = [];
  validateBuiltIn(
    draft.googleSearchConsole,
    "googleSearchConsole",
    "Google Search Console",
    "gsc",
    issues,
  );
  validateBuiltIn(
    draft.googleAnalytics4,
    "googleAnalytics4",
    "Google Analytics 4",
    "ga4",
    issues,
  );
  validateBuiltIn(
    draft.pageSpeedInsights,
    "pageSpeedInsights",
    "PageSpeed Insights",
    "optional",
    issues,
  );

  const keys = new Set<string>();
  for (const [index, provider] of draft.customProviders.entries()) {
    const field = `customProviders.${index}`;
    const label = provider.label.trim() || `Custom provider ${index + 1}`;
    if (!provider.label.trim() || provider.label.trim().length > 80) {
      issues.push({
        field: `${field}.label`,
        message: `${label} needs a label of 80 characters or fewer.`,
      });
    }
    const key = provider.key.trim();
    if (!PROVIDER_KEY_PATTERN.test(key)) {
      issues.push({
        field: `${field}.key`,
        message: `${label} needs a lowercase provider key such as bing_webmaster.`,
      });
    } else if (keys.has(key)) {
      issues.push({
        field: `${field}.key`,
        message: `${label} duplicates another custom provider key.`,
      });
    }
    keys.add(key);
    validateCredential(provider, field, label, issues);
    const resource = provider.resourceRef.trim();
    if (provider.enabled && !resource) {
      issues.push({
        field: `${field}.resourceRef`,
        message: `${label} needs a resource reference.`,
      });
    } else if (resource && !isSafeGenericResource(resource)) {
      issues.push({
        field: `${field}.resourceRef`,
        message: `${label} resource must be a URL, domain, numeric ID, or namespaced reference.`,
      });
    }
  }
  return issues;
}

export type ProviderReferenceStatus =
  "disabled" | "needs_reference" | "reference_configured";

export function providerReferenceStatus(
  provider: ProviderIntegrationDraft,
  requiresResource = true,
  requiresCredential = true,
): ProviderReferenceStatus {
  if (!provider.enabled) return "disabled";
  if (
    (requiresCredential &&
      (!provider.credentialAuthority ||
        !UUID_PATTERN.test(provider.credentialRef.trim()))) ||
    (requiresResource && !provider.resourceRef.trim())
  ) {
    return "needs_reference";
  }
  return "reference_configured";
}
