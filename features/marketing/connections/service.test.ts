import type { MarketingSite } from "@/features/marketing/types";
import { saveDomainConfig, connectionErrorMessage } from "./service";
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
jest.mock("@/lib/organization/organization-gate", () => ({
  ensureOrganizationForRequest: jest.fn(),
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
  jest
    .mocked(getSite)
    .mockResolvedValue({
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
  jest
    .mocked(getSite)
    .mockResolvedValue({
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
