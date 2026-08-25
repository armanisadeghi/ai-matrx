/**
 * The CMS access predicate — pinned against MAIN's `iam.has_access_for_base`.
 *
 * These cases are not invented: each names the branch of the live SQL function
 * it mirrors. If someone changes `canAccessCmsSite` to be more permissive, the
 * failure here should read as "you widened access", not "a test broke".
 */
import {
  canAccessCmsSite,
  cmsAccessSource,
  cmsVisibleSitesFilter,
  isCmsVisibility,
  type CmsCaller,
} from "../cmsAccess";

const OWNER = "11111111-1111-1111-1111-111111111111";
const TEAMMATE = "22222222-2222-2222-2222-222222222222";
const OUTSIDER = "33333333-3333-3333-3333-333333333333";
const ORG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_ORG = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const ownerCaller: CmsCaller = {
  userId: OWNER,
  adminOrgIds: [ORG],
  memberOrgIds: [ORG],
};
/** A plain `member` of the org — the case the whole feature exists for. */
const memberCaller: CmsCaller = {
  userId: TEAMMATE,
  adminOrgIds: [],
  memberOrgIds: [ORG],
};
const adminCaller: CmsCaller = {
  userId: TEAMMATE,
  adminOrgIds: [ORG],
  memberOrgIds: [ORG],
};
const outsiderCaller: CmsCaller = {
  userId: OUTSIDER,
  adminOrgIds: [OTHER_ORG],
  memberOrgIds: [OTHER_ORG],
};

const orgSite = {
  owner_user_id: OWNER,
  organization_id: ORG,
  visibility: "internal",
};

describe("canAccessCmsSite", () => {
  it("gives the owner every level (`v_owner = v_uid`)", () => {
    for (const level of ["viewer", "editor", "admin"] as const) {
      expect(canAccessCmsSite(ownerCaller, orgSite, level)).toBe(true);
    }
  });

  it("gives an org MEMBER up to editor, and refuses admin", () => {
    // `p_required <= 'editor' and iam.has_org_access_for(...)`
    expect(canAccessCmsSite(memberCaller, orgSite, "viewer")).toBe(true);
    expect(canAccessCmsSite(memberCaller, orgSite, "editor")).toBe(true);
    // Edit has never meant delete.
    expect(canAccessCmsSite(memberCaller, orgSite, "admin")).toBe(false);
  });

  it("gives an org ADMIN every level (`is_org_admin_for`)", () => {
    expect(canAccessCmsSite(adminCaller, orgSite, "admin")).toBe(true);
  });

  it("refuses someone outside the org entirely", () => {
    expect(canAccessCmsSite(outsiderCaller, orgSite, "viewer")).toBe(false);
  });

  it("refuses a teammate on a PERSONAL site even inside their org", () => {
    // `v_vis >= 'internal'` gates the whole org branch.
    const personal = { ...orgSite, visibility: "personal" };
    expect(canAccessCmsSite(memberCaller, personal, "viewer")).toBe(false);
    expect(canAccessCmsSite(ownerCaller, personal, "admin")).toBe(true);
  });

  it("refuses a teammate on an org-LESS site", () => {
    const orphan = { ...orgSite, organization_id: null };
    expect(canAccessCmsSite(memberCaller, orphan, "viewer")).toBe(false);
  });

  it("lets any signed-in user READ a public site, and never write it", () => {
    const site = { ...orgSite, visibility: "public" };
    expect(canAccessCmsSite(outsiderCaller, site, "viewer")).toBe(true);
    expect(canAccessCmsSite(outsiderCaller, site, "editor")).toBe(false);
  });

  it("fails CLOSED on a visibility label it does not recognize", () => {
    const weird = { ...orgSite, visibility: "sort-of-shared" };
    expect(canAccessCmsSite(memberCaller, weird, "viewer")).toBe(false);
    // The owner still reaches their own row — the unknown label is not a lockout.
    expect(canAccessCmsSite(ownerCaller, weird, "viewer")).toBe(true);
  });

  it("refuses an anonymous caller outright", () => {
    const anon: CmsCaller = { userId: "", adminOrgIds: [], memberOrgIds: [] };
    expect(canAccessCmsSite(anon, { ...orgSite, visibility: "public" }, "viewer")).toBe(
      false,
    );
  });
});

describe("cmsVisibleSitesFilter", () => {
  it("returns null with no memberships (an empty `in.()` is a syntax error)", () => {
    expect(
      cmsVisibleSitesFilter({ userId: OWNER, adminOrgIds: [], memberOrgIds: [] }),
    ).toBeNull();
  });

  it("keeps personal sites out of the org lane", () => {
    const filter = cmsVisibleSitesFilter(memberCaller)!;
    expect(filter).toContain(`owner_user_id.eq.${TEAMMATE}`);
    expect(filter).toContain(`organization_id.in.(${ORG})`);
    expect(filter).toContain("visibility.in.(internal,link,public)");
    expect(filter).not.toContain("personal");
  });
});

describe("cmsAccessSource", () => {
  it("names how the caller reached the row", () => {
    expect(cmsAccessSource(ownerCaller, orgSite)).toBe("owner");
    expect(cmsAccessSource(memberCaller, orgSite)).toBe("organization");
    expect(cmsAccessSource(outsiderCaller, orgSite)).toBe("none");
    expect(
      cmsAccessSource(outsiderCaller, { ...orgSite, visibility: "public" }),
    ).toBe("public");
  });
});

describe("isCmsVisibility", () => {
  it("accepts exactly the four MAIN labels", () => {
    for (const v of ["personal", "internal", "link", "public"]) {
      expect(isCmsVisibility(v)).toBe(true);
    }
    expect(isCmsVisibility("private")).toBe(false);
    expect(isCmsVisibility(null)).toBe(false);
  });
});
