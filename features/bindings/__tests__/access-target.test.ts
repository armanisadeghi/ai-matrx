import { bindingAccessTarget, type BindingAccessInput } from "../access-target";

const base: BindingAccessInput = {
  rung: "org",
  writingDefinitionDefault: false,
  organizationId: "org-1",
  organizationName: "Acme",
  canBindThisOrg: false,
  defaultHolderOffer: { offered: false, systemHomed: false },
  homeOrganizationId: "home-1",
  homeOrganizationName: "Home Co",
  mandate: { id: "m-1", mandate_key: "doc.summary", label: "Summary" },
};

describe("bindingAccessTarget — the binding editor's permission blocks", () => {
  it("a member (not admin) on the org rung asks that org's admins", () => {
    const t = bindingAccessTarget(base);
    expect(t?.owner).toEqual({ organizationId: "org-1", organizationName: "Acme" });
    expect(t?.manageHref).toBe("/organizations/org-1/settings/mandates/doc.summary");
  });

  it("an org admin, the user rung, and an unpicked org get no ask — Save stays", () => {
    expect(bindingAccessTarget({ ...base, canBindThisOrg: true })).toBeNull();
    expect(bindingAccessTarget({ ...base, rung: "user" })).toBeNull();
    expect(bindingAccessTarget({ ...base, organizationId: null })).toBeNull();
  });

  it("an unoffered default asks its home: platform team when system-homed, else the home org", () => {
    const def = { ...base, writingDefinitionDefault: true };
    expect(
      bindingAccessTarget({ ...def, defaultHolderOffer: { offered: false, systemHomed: true } })?.owner,
    ).toBe("system");
    expect(bindingAccessTarget(def)?.owner).toEqual({
      organizationId: "home-1",
      organizationName: "Home Co",
    });
    expect(
      bindingAccessTarget({ ...def, defaultHolderOffer: { offered: true, systemHomed: true } }),
    ).toBeNull();
    // An unread home is not a permission answer.
    expect(bindingAccessTarget({ ...def, homeOrganizationId: null })).toBeNull();
  });
});
