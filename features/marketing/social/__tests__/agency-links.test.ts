import { agencyAccountHref, agencyBrandHref } from "../agencyLinks";

describe("agency roll-up row links", () => {
  it("brand rows open the brand's socials", () => {
    expect(agencyBrandHref({ brandId: "b1" })).toBe("/marketing/b1/socials");
    expect(agencyBrandHref({ brandId: null })).toBeNull();
  });
  it("account rows open the account page under the brand", () => {
    expect(agencyAccountHref({ brandId: "b1", platform: "instagram", profileId: "p1" })).toBe("/marketing/b1/socials/instagram/p1");
  });
  it("no brand or no profile means no link, not a broken one", () => {
    expect(agencyAccountHref({ brandId: null, platform: "instagram", profileId: "p1" })).toBeNull();
    expect(agencyAccountHref({ brandId: "b1", platform: "instagram", profileId: null })).toBeNull();
  });
});
