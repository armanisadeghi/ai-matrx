import React from "react";
import MarketingBrandLayout from "@/app/(core)/marketing/[brandId]/layout";
import MarketingWebsiteLayout from "@/app/(core)/marketing/[brandId]/websites/[siteId]/layout";

jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("false-not-found");
  },
  redirect: jest.fn(),
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "viewer" } } }) },
  }),
}));
jest.mock("@/features/marketing/lib/keys-server", () => ({
  resolveBrandParam: jest.fn(async () => null),
  resolveSiteParam: jest.fn(async () => null),
}));
jest.mock("@/features/marketing/components/brand/CanonicalSegment", () => ({
  CanonicalBrandSegment: () => null,
  CanonicalSiteSegment: () => null,
}));
jest.mock("@/features/marketing/components/brand/MarketingBrandCrumb", () => ({
  MarketingBrandCrumb: () => null,
}));
jest.mock("@/features/marketing/lib/brand-context", () => ({
  MarketingBrandProvider: () => null,
  MarketingSiteProvider: () => null,
}));
jest.mock(
  "@/features/marketing/components/site/MarketingSiteLayoutClient",
  () => ({ MarketingSiteLayoutClient: () => null }),
);

const brandId = "53381577-04ae-4a6a-90d2-a3602a25b4e2";
const siteId = "42824fac-9ff8-4b89-a93e-f7aaa9ba44c3";
it.each([MarketingBrandLayout, MarketingWebsiteLayout])(
  "does not claim missing when UUID brand read is empty",
  async (layout) => {
    const result = await layout({
      children: React.createElement("div"),
      params: Promise.resolve({ brandId, siteId }),
    });
    expect(result.props.token).toBe("web_brand");
    expect(result.props.address).toBe(brandId);
  },
);

jest.mock("@/features/access-gate/components/AccessGate", () => ({
  AccessGate: () => null,
}));
import { MarketingAddressUnavailable } from "@/features/marketing/components/shared/MarketingAddressUnavailable";
import { resolveBrandParam } from "@/features/marketing/lib/keys-server";

it.each(["web_brand", "web_site"] as const)(
  "delegates UUID classification to the access service for %s",
  (token) => {
    const result = MarketingAddressUnavailable({ token, address: brandId });
    expect(result.props.token).toBe(token);
    expect(result.props.id).toBe(brandId);
  },
);
it("preserves unknown opaque address 404", () => {
  expect(() =>
    MarketingAddressUnavailable({
      token: "web_brand",
      address: "unknown-client",
    }),
  ).toThrow("false-not-found");
});
it("keeps site resolution scoped to a readable brand", async () => {
  jest
    .mocked(resolveBrandParam)
    .mockResolvedValueOnce({
      id: brandId,
      slug: null,
      name: "Readable",
      organization_id: "66666666-6666-4666-8666-666666666666",
    });
  const result = await MarketingWebsiteLayout({
    children: React.createElement("div"),
    params: Promise.resolve({ brandId, siteId }),
  });
  expect(result.props.token).toBe("web_site");
  expect(result.props.address).toBe(siteId);
});
