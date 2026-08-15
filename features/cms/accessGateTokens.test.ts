import {
  CMS_ACCESS_GATE_TOKENS,
  CMS_SITE_MEMBER_ADD_ACTION,
  cmsAccessGateLabel,
  cmsSiteAccessRequestKey,
  isCmsAccessGateToken,
} from "@/features/cms/accessGateTokens";

describe("CMS Access Gate token registry", () => {
  it("registers both cross-project record types with human labels", () => {
    expect(CMS_ACCESS_GATE_TOKENS).toEqual(["client_site", "client_page"]);
    expect(cmsAccessGateLabel("client_site")).toBe("CMS site");
    expect(cmsAccessGateLabel("client_page")).toBe("CMS page");
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
