import type { MarketingSite } from "@/features/marketing/types";
import type { GoogleConnectionInventory } from "@/features/marketing/google/types";
import {
  saveDomainConfig,
  connectionErrorMessage,
  mergeSearchConsoleProperties,
} from "./service";
import { getSite } from "@/features/marketing/data/service";
import { updateSiteIntegrations } from "@/features/marketing/data/integrations-service";
jest.mock("@/features/marketing/data/service", () => ({ getSite: jest.fn() }));
jest.mock("@/features/marketing/data/integrations-service", () => ({
  updateSiteIntegrations: jest.fn(),
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/api/resolve-service-url", () => ({
  resolveServiceBaseUrl: jest.fn(),
}));
jest.mock("@/lib/api/organization-context", () => ({
  applyOrganizationContextHeader: jest.fn(),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: jest.fn(),
}));
jest.mock("@/lib/api/stream-parser", () => ({ consumeStream: jest.fn() }));
const expected = {
  connection_ids: ["account"],
  selected_domains: [],
  manual_domains: ["example.com"],
};
const next = { ...expected, manual_domains: ["copy.example.com"] };
const site = {
  id: "site",
  version: 1,
  integrations: { marketing: { owned_domains: expected } },
} as MarketingSite;

test("domain save rebases unrelated provider edits and metadata version bumps", async () => {
  jest.mocked(getSite).mockResolvedValue({
    ...site,
    version: 4,
    integrations: {
      other: "keep",
      marketing: {
        owned_domains: expected,
        providers: { gsc: { connection: "google" } },
      },
    },
  });
  await saveDomainConfig(site, next);
  expect(updateSiteIntegrations).toHaveBeenCalledWith({
    siteId: "site",
    expectedVersion: 4,
    integrations: {
      other: "keep",
      marketing: {
        providers: { gsc: { connection: "google" } },
        owned_domains: next,
      },
    },
  });
});

test("concurrent domain edits refuse to overwrite the newer choices", async () => {
  jest.mocked(updateSiteIntegrations).mockClear();
  jest.mocked(getSite).mockResolvedValue({
    ...site,
    integrations: {
      marketing: {
        owned_domains: { ...expected, manual_domains: ["newer.example.com"] },
      },
    },
  });
  await expect(saveDomainConfig(site, next)).rejects.toThrow(
    "Domain choices changed",
  );
  expect(updateSiteIntegrations).not.toHaveBeenCalled();
});

test("an empty backend error never hides the failed operation", () => {
  expect(connectionErrorMessage(new Error(""))).toContain(
    "Connection operation failed",
  );
  expect(connectionErrorMessage(new Error("Provider unavailable"))).toBe(
    "Provider unavailable",
  );
});

test("provider refresh populates canonical resource IDs and preserves other inventory", () => {
  const inventory = {
    connections: [{ id: "google", metadata: {} }],
    resources: [
      {
        id: "analytics",
        connection_id: "google",
        resource_type: "analytics_property",
      },
      {
        id: "other",
        connection_id: "other",
        resource_type: "search_console_property",
      },
      {
        id: "retired",
        connection_id: "google",
        resource_type: "search_console_property",
      },
    ],
  } as GoogleConnectionInventory;
  const result = {
    connection_id: "google",
    account_name: "Customer",
    observed_at: "2026-10-05T22:00:00Z",
    properties: [
      {
        id: "durable-id",
        property: "sc-domain:example.com",
        permission_level: "siteOwner",
        matches_site: true,
      },
    ],
  };
  const merged = mergeSearchConsoleProperties(inventory, result);
  if (!merged) throw new Error("Expected reachable connection inventory");
  expect(merged.resources.map((row) => row.id)).toEqual([
    "analytics",
    "other",
    "durable-id",
  ]);
  expect(merged.resources[2].connection_id).toBe("google");
  expect(
    mergeSearchConsoleProperties(merged, {
      ...result,
      observed_at: "2026-10-05T21:00:00Z",
      properties: [],
    }),
  ).toBe(merged);
  expect(
    mergeSearchConsoleProperties(inventory, {
      ...result,
      connection_id: "inaccessible",
    }),
  ).toBe(inventory);
});
