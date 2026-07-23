import type { Json } from "@/types/database.types";
import {
  buildSiteIntegrations,
  buildSiteIntegrationsWithProviderChange,
  IntegrationProviderConflictError,
  parseSiteIntegrations,
  providerReferenceStatus,
  validateSiteIntegrations,
} from "@/features/marketing/data/integrations-schema";

const credentialRef = "76b5c9d7-b8ca-4a9f-8ad6-6b88265ece91";

describe("marketing site integration JSON", () => {
  it("parses the empty canonical site value into disabled providers", () => {
    const draft = parseSiteIntegrations({});
    expect(draft.googleSearchConsole.enabled).toBe(false);
    expect(draft.googleAnalytics4.credentialRef).toBe("");
    expect(draft.dataForSeo).toEqual({
      enabled: false,
      cadence: "monthly",
      detailLimit: 1000,
    });
    expect(draft.customProviders).toEqual([]);
  });

  it("stores secret-free DataForSEO scheduling configuration", () => {
    const draft = parseSiteIntegrations({});
    draft.dataForSeo = {
      enabled: true,
      cadence: "weekly",
      detailLimit: 250,
    };
    const result = buildSiteIntegrations({}, draft);
    expect(parseSiteIntegrations(result).dataForSeo).toEqual(draft.dataForSeo);
    expect(result).toMatchObject({
      marketing: {
        providers: {
          dataforseo: {
            enabled: true,
            cadence: "weekly",
            detail_limit: 250,
          },
        },
      },
    });
  });

  it("writes only references in a namespaced document and preserves unrelated keys", () => {
    const draft = parseSiteIntegrations({});
    draft.googleSearchConsole = {
      enabled: true,
      credentialAuthority: "organization_secret",
      credentialRef,
      resourceRef: "sc-domain:example.com",
    };
    const result = buildSiteIntegrations(
      { unrelated_provider: { state: "preserved" } },
      draft,
    ) as Record<string, Json>;
    expect(result.unrelated_provider).toEqual({ state: "preserved" });
    expect(result.marketing).toMatchObject({
      schema_version: 1,
      providers: {
        google_search_console: {
          enabled: true,
          credential_authority: "organization_secret",
          credential_ref: credentialRef,
          resource_ref: "sc-domain:example.com",
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /access_token|refresh_token|client_secret/,
    );
  });

  it("rejects token-shaped credential values and invalid property references", () => {
    const draft = parseSiteIntegrations({});
    draft.googleSearchConsole = {
      enabled: true,
      credentialAuthority: "external_connection",
      credentialRef: "ya29.browser-token-must-not-be-stored",
      resourceRef: "not a search console property",
    };
    const messages = validateSiteIntegrations(draft).map(
      (issue) => issue.message,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("stable credential UUID"),
        expect.stringContaining("sc-domain:example.com"),
      ]),
    );
    expect(() => buildSiteIntegrations({}, draft)).toThrow(
      "stable credential UUID",
    );
  });

  it("never labels an opaque reference as a verified connection", () => {
    expect(
      providerReferenceStatus({
        enabled: true,
        credentialAuthority: "user_secret",
        credentialRef,
        resourceRef: "properties/123456789",
      }),
    ).toBe("reference_configured");
  });

  it("allows PageSpeed with the application-owned quota key", () => {
    const draft = parseSiteIntegrations({});
    draft.pageSpeedInsights.enabled = true;
    expect(validateSiteIntegrations(draft)).toEqual([]);
    expect(providerReferenceStatus(draft.pageSpeedInsights, false, false)).toBe(
      "reference_configured",
    );
  });

  it("blocks rewrites of integration JSON that already contains secret fields", () => {
    const draft = parseSiteIntegrations({});
    expect(() =>
      buildSiteIntegrations(
        { legacy: { access_token: "must-move-to-vault" } },
        draft,
      ),
    ).toThrow("contains a secret field");
  });

  it("rebases one provider without overwriting a concurrent sibling change", () => {
    const expected = parseSiteIntegrations({}).googleSearchConsole;
    const concurrent = parseSiteIntegrations({});
    concurrent.googleAnalytics4 = {
      enabled: true,
      credentialAuthority: "external_connection",
      credentialRef,
      resourceRef: "properties/123456789",
    };
    const existing = buildSiteIntegrations({}, concurrent);
    const result = buildSiteIntegrationsWithProviderChange(
      existing,
      "googleSearchConsole",
      expected,
      {
        enabled: true,
        credentialAuthority: "external_connection",
        credentialRef,
        resourceRef: "sc-domain:example.com",
      },
    );
    const parsed = parseSiteIntegrations(result);
    expect(parsed.googleSearchConsole.resourceRef).toBe(
      "sc-domain:example.com",
    );
    expect(parsed.googleAnalytics4.resourceRef).toBe("properties/123456789");
  });

  it("rejects a rebase when the same provider changed concurrently", () => {
    const expected = parseSiteIntegrations({}).googleSearchConsole;
    const concurrent = parseSiteIntegrations({});
    concurrent.googleSearchConsole = {
      enabled: true,
      credentialAuthority: "external_connection",
      credentialRef,
      resourceRef: "sc-domain:other.example",
    };
    expect(() =>
      buildSiteIntegrationsWithProviderChange(
        buildSiteIntegrations({}, concurrent),
        "googleSearchConsole",
        expected,
        {
          enabled: true,
          credentialAuthority: "external_connection",
          credentialRef,
          resourceRef: "sc-domain:example.com",
        },
      ),
    ).toThrow(IntegrationProviderConflictError);
  });
});
