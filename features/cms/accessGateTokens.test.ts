import {
  CMS_ACCESS_GATE_TOKENS,
  CMS_SITE_MEMBER_ADD_ACTION,
  cmsAccessGateLabel,
  cmsSiteAccessRequestKey,
  isCmsAccessGateToken,
} from "@/features/cms/accessGateTokens";

describe("CMS Access Gate token registry", () => {
  // The labels are the words a PERSON reads ("we couldn't find this ___").
  // 22c917b18f (2026-08-24) replaced the internal-token labels "CMS site" /
  // "CMS page" with Arman's vocabulary ruling — a `client_site` is a WEBSITE
  // and a `client_page` is a PAGE — because the gate rendered "we couldn't
  // find this cms site", the exact token-at-the-user defect this feature's own
  // law forbids. The guard therefore pins the human words, not the tokens.
  it("registers both cross-project record types with human labels", () => {
    expect(CMS_ACCESS_GATE_TOKENS).toEqual(["client_site", "client_page"]);
    expect(cmsAccessGateLabel("client_site")).toBe("website");
    expect(cmsAccessGateLabel("client_page")).toBe("page");
    expect(isCmsAccessGateToken("client_site")).toBe(true);
    expect(isCmsAccessGateToken("web_site")).toBe(false);
  });

  it("uses a stable site request identity and registered membership action", () => {
    expect(cmsSiteAccessRequestKey("site-id")).toBe(
      "cms_site_access:site-id",
    );
    expect(CMS_SITE_MEMBER_ADD_ACTION).toBe("cms_site_access.add_member");
  });
});
