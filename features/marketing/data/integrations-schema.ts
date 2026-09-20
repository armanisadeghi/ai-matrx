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

export const dataForSeoCadences = ["weekly", "monthly"] as const;
export type DataForSeoCadence = (typeof dataForSeoCadences)[number];

/**
 * The provider's accepted bounds for one detail pull. THE source for this
 * range — `validateSiteIntegrations`, the Backlinks schedule input, and the
 * `backlink_refresh_schedule` write target's model-facing description all
 * read these rather than re-typing the numbers.
 */
export const DATAFORSEO_DETAIL_LIMIT_MIN = 1;
export const DATAFORSEO_DETAIL_LIMIT_MAX = 1000;

export function isValidDataForSeoDetailLimit(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= DATAFORSEO_DETAIL_LIMIT_MIN &&
    (value as number) <= DATAFORSEO_DETAIL_LIMIT_MAX
  );
}

export interface DataForSeoIntegrationDraft {
  enabled: boolean;
  cadence: DataForSeoCadence;
  detailLimit: number;
}

export const cmsKinds = [
  "wordpress",
  "shopify",
  "matrx_cms",
  "webflow",
  "other",
] as const;

export type CmsKind = (typeof cmsKinds)[number];

export interface CmsIntegrationDraft extends ProviderIntegrationDraft {
  kind: CmsKind | "";
}

export interface SiteIntegrationsDraft {
  googleSearchConsole: ProviderIntegrationDraft;
  googleAnalytics4: ProviderIntegrationDraft;
  /**
   * The Google Tag Manager container this site's tracking is graded against
   * (google-native PLAN §4.10 Plane C: "a binding on the site"). `resourceRef` is the container's
   * PUBLIC id — `GTM-XXXXXXX` — because that is the id the page's own snippet carries, and the
   * reconciliation that looks for the container on the live site can only match on that. The
   * numeric internal container id would never appear in the HTML.
   */
  googleTagManager: ProviderIntegrationDraft;
  pageSpeedInsights: ProviderIntegrationDraft;
  /**
   * The owned YouTube channel this record is bound to — `credentialRef` is the
   * `users.integration_connections` id and `resourceRef` is the channel id
   * (`UC…`), the two facts `POST /google-sync/youtube/refresh` needs.
   *
   * 🚨 IT LIVES IN THE SITE DRAFT ON PURPOSE (google-native U-M3, chair ruling
   * 2). The binding is written on a BRAND (`web.brand.integrations`), not a
   * site, and it uses this module rather than a second one because the document
   * shape is identical — same column name, same `marketing.providers.<key>`
   * envelope, same four keys. One parser and one writer for one shape is why a
   * brand binding and a site binding can never drift apart; a `brand-
   * integrations-schema.ts` twin is the defect this avoids.
   */
  youtubeChannel: ProviderIntegrationDraft;
  dataForSeo: DataForSeoIntegrationDraft;
  cms: CmsIntegrationDraft;
  customProviders: CustomProviderIntegrationDraft[];
}

export type BuiltInProviderKey =
  | "googleSearchConsole"
  | "googleAnalytics4"
  | "googleTagManager"
  | "pageSpeedInsights";

export interface IntegrationValidationIssue {
  field: string;
  message: string;
}

export class IntegrationProviderConflictError extends Error {
  constructor() {
    super(
      "This provider changed while you were connecting it. Reload and review the latest settings before trying again.",
    );
    this.name = "IntegrationProviderConflictError";
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_KEY_PATTERN = /^[a-z][a-z0-9._-]{1,63}$/;
const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
/**
 * A Tag Manager PUBLIC container id. This is the spelling that appears in the site's own snippet
 * (`gtm.js?id=GTM-ABC1234`), which is the only thing the live-page reconciliation can match on.
 */
const GTM_CONTAINER_PATTERN = /^GTM-[A-Z0-9]{4,10}$/;
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

function parseDataForSeo(value: unknown): DataForSeoIntegrationDraft {
  const row = isRecord(value) ? value : {};
  const cadence = stringValue(row.cadence);
  const detailLimit =
    typeof row.detail_limit === "number" && Number.isInteger(row.detail_limit)
      ? row.detail_limit
      : 1000;
  return {
    enabled: row.enabled === true,
    cadence: dataForSeoCadences.includes(cadence as DataForSeoCadence)
      ? (cadence as DataForSeoCadence)
      : "monthly",
    detailLimit,
  };
}

export const emptyCmsIntegration = (): CmsIntegrationDraft => ({
  ...emptyProviderIntegration(),
  kind: "",
});

function parseCms(value: unknown): CmsIntegrationDraft {
  const base = parseProvider(value);
  const kind = isRecord(value) ? stringValue(value.kind) : "";
  return {
    ...base,
    kind: cmsKinds.includes(kind as CmsKind) ? (kind as CmsKind) : "",
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
    googleTagManager: parseProvider(providers.google_tag_manager),
    pageSpeedInsights: parseProvider(providers.pagespeed_insights),
    youtubeChannel: parseProvider(providers.youtube_channel),
    dataForSeo: parseDataForSeo(providers.dataforseo),
    cms: parseCms(providers.cms),
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
  const existingMarketing = isRecord(root.marketing) ? root.marketing : {};
  const existingProviders = isRecord(existingMarketing.providers)
    ? existingMarketing.providers
    : {};
  return {
    ...root,
    marketing: {
      ...existingMarketing,
      schema_version: 1,
      providers: {
        ...existingProviders,
        google_search_console: providerDocument(draft.googleSearchConsole),
        google_analytics_4: providerDocument(draft.googleAnalytics4),
        google_tag_manager: providerDocument(draft.googleTagManager),
        pagespeed_insights: providerDocument(draft.pageSpeedInsights),
        youtube_channel: providerDocument(draft.youtubeChannel),
        dataforseo: {
          enabled: draft.dataForSeo.enabled,
          cadence: draft.dataForSeo.cadence,
          detail_limit: draft.dataForSeo.detailLimit,
        },
        cms: {
          ...providerDocument(draft.cms),
          kind: draft.cms.kind || null,
        },
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

/**
 * Rebase one provider onto the latest site document without overwriting sibling
 * providers. The expected value keeps a retry from masking a real same-provider
 * edit made in another tab.
 */
export function buildSiteIntegrationsWithProviderChange(
  existing: Json,
  /**
   * `youtubeChannel` is accepted here and is deliberately NOT in
   * `BuiltInProviderKey`: that union is the set of providers the SITE
   * integrations editor renders a row for, and adding a brand-only binding to it
   * would put a control on a screen that cannot honour it. The rebase itself is
   * provider-agnostic (google-native U-M3).
   */
  provider: BuiltInProviderKey | "youtubeChannel",
  expected: ProviderIntegrationDraft,
  next: ProviderIntegrationDraft,
): Json {
  const current = parseSiteIntegrations(existing);
  if (JSON.stringify(current[provider]) !== JSON.stringify(expected)) {
    throw new IntegrationProviderConflictError();
  }
  return buildSiteIntegrations(existing, { ...current, [provider]: next });
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
  resourceKind: "gsc" | "ga4" | "gtm" | "optional",
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
        : resourceKind === "gtm"
          ? GTM_CONTAINER_PATTERN.test(resource)
          : isSafeGenericResource(resource);
  if (!valid || looksLikeSecret(resource)) {
    issues.push({
      field: `${field}.resourceRef`,
      message:
        resourceKind === "gsc"
          ? `${label} property must be an HTTP(S) URL or sc-domain:example.com.`
          : resourceKind === "ga4"
            ? `${label} property must be a numeric ID or properties/123456.`
            : resourceKind === "gtm"
              ? `${label} container must be a public container ID such as GTM-ABC1234 — the id in the site's own Tag Manager snippet.`
              : `${label} resource must be a URL, domain, numeric ID, or namespaced reference.`,
    });
  }
}

/**
 * A YouTube channel id as the Google API hands it back: `UC` plus 22 characters
 * of the URL-safe alphabet (`_discover_youtube` in aidream stores `items[].id`
 * verbatim as the resource's `resource_ref`). A handle (`@name`) or a custom URL
 * is NOT accepted — `POST /google-sync/youtube/refresh` resolves the channel by
 * matching this value against the discovered `youtube_channel` resource row, so
 * anything else is a refusal the person would only meet at refresh time.
 */
export function isYouTubeChannelId(value: string): boolean {
  return /^UC[A-Za-z0-9_-]{22}$/.test(value.trim());
}

/**
 * The owned-channel binding (google-native U-M3). Not routed through
 * `validateBuiltIn` because its resource is neither a GSC property nor a GA4
 * property nor "anything safe-looking": it is one exact shape, and `enabled`
 * without it is a binding that cannot refresh.
 */
function validateYouTubeChannel(
  provider: ProviderIntegrationDraft,
  issues: IntegrationValidationIssue[],
) {
  validateCredential(provider, "youtubeChannel", "YouTube channel", issues);
  const resource = provider.resourceRef.trim();
  if (provider.enabled && !resource) {
    issues.push({
      field: "youtubeChannel.resourceRef",
      message: "YouTube channel needs the channel id to refresh from.",
    });
    return;
  }
  if (!resource) return;
  if (!isYouTubeChannelId(resource) || looksLikeSecret(resource)) {
    issues.push({
      field: "youtubeChannel.resourceRef",
      message:
        "YouTube channel must be a channel id such as UCxxxxxxxxxxxxxxxxxxxxxx — not a handle, a custom URL or a video link.",
    });
  }
}

export function validateSiteIntegrations(
  draft: SiteIntegrationsDraft,
): IntegrationValidationIssue[] {
  const issues: IntegrationValidationIssue[] = [];
  if (!isValidDataForSeoDetailLimit(draft.dataForSeo.detailLimit)) {
    issues.push({
      field: "dataForSeo.detailLimit",
      message: `DataForSEO detail limit must be an integer from ${DATAFORSEO_DETAIL_LIMIT_MIN} to ${DATAFORSEO_DETAIL_LIMIT_MAX}.`,
    });
  }
  validateBuiltIn(
    draft.googleSearchConsole,
    "googleSearchConsole",
    "GSC",
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
    draft.googleTagManager,
    "googleTagManager",
    "Google Tag Manager",
    "gtm",
    issues,
  );
  validateBuiltIn(
    draft.pageSpeedInsights,
    "pageSpeedInsights",
    "PageSpeed Insights",
    "optional",
    issues,
  );
  validateYouTubeChannel(draft.youtubeChannel, issues);

  if (draft.cms.enabled && !draft.cms.kind) {
    issues.push({
      field: "cms.kind",
      message: "CMS connection needs a platform kind (WordPress, Shopify, …).",
    });
  }
  const cmsResource = draft.cms.resourceRef.trim();
  if (draft.cms.enabled && !cmsResource) {
    issues.push({
      field: "cms.resourceRef",
      message: "CMS connection needs a site reference (URL or identifier).",
    });
  } else if (cmsResource && !isSafeGenericResource(cmsResource)) {
    issues.push({
      field: "cms.resourceRef",
      message:
        "CMS reference must be a URL, domain, numeric ID, or namespaced reference.",
    });
  }
  if (draft.cms.credentialRef.trim()) {
    validateCredential(
      { ...draft.cms, enabled: false },
      "cms",
      "CMS connection",
      issues,
    );
  }

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
