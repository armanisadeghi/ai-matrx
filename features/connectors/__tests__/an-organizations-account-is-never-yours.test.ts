/**
 * AN ORGANIZATION'S ACCOUNT IS NEVER YOURS.
 *
 * Arman (2026-10-05), signed in as himself, saw AI Matrx's shared Google
 * account — the one Search Console runs on — listed as his own personal Google,
 * with no offer to connect his own and a Disconnect that would have cut the
 * whole organization off. Every connection the read returned was "yours".
 *
 * Fails on the code as it was: the directory counted every row as saved, so an
 * organization-only inventory made Google read "Connected" with no shared
 * marker at all.
 */

import {
  connectionOwnership,
  splitConnectionsByOwnership,
  type ConnectionViewer,
} from "../connection-ownership";
import {
  DEFAULT_DIRECTORY_FILTERS,
  filterDirectory,
  savedAccountSummary,
  type IntegrationDirectoryItem,
} from "../integration-directory";

const ME = "user-me";
const AI_MATRX = "org-ai-matrx";
const viewer: ConnectionViewer = {
  userId: ME,
  organizationIds: new Set([AI_MATRX]),
};

const mine = { ownerKind: "person" as const, ownerUserId: ME, organizationId: null };
const orgShared = {
  ownerKind: "organization" as const,
  ownerUserId: null,
  organizationId: AI_MATRX,
};
const someoneElses = {
  ownerKind: "person" as const,
  ownerUserId: "user-other",
  organizationId: null,
};
const strangerOrg = {
  ownerKind: "organization" as const,
  ownerUserId: null,
  organizationId: "org-not-mine",
};

describe("connectionOwnership", () => {
  it("names each account by whose it is", () => {
    expect(connectionOwnership(mine, viewer)).toBe("mine");
    expect(connectionOwnership(orgShared, viewer)).toBe("organization");
    expect(connectionOwnership(someoneElses, viewer)).toBe("someone_else");
    expect(connectionOwnership(strangerOrg, viewer)).toBe("someone_else");
  });

  it("never calls an organization's account the viewer's own, even before memberships load", () => {
    expect(
      connectionOwnership(orgShared, { userId: ME, organizationIds: null }),
    ).toBe("organization");
  });

  it("splits a mixed inventory and drops what is nobody's here", () => {
    const { mine: own, shared } = splitConnectionsByOwnership(
      [orgShared, mine, someoneElses, strangerOrg],
      viewer,
    );
    expect(own).toEqual([mine]);
    expect(shared).toEqual([orgShared]);
  });
});

describe("the directory with only an organization's account", () => {
  const google: IntegrationDirectoryItem = {
    id: "native:google",
    name: "Google Workspace",
    description: "",
    vendor: "Google",
    category: "productivity",
    keywords: "",
    artwork: { id: "google", name: "Google", blurb: "", surfaces: ["directory"] },
    featured: true,
    comingSoon: false,
    ...savedAccountSummary([], false, false),
    sharedBy: ["AI Matrx"],
  };

  it("is not saved or connected — it is shared, and Connect is still offered", () => {
    expect(google.saved).toBe(false);
    expect(google.connected).toBe(false);
    expect(google.status).toBe("Not connected");
  });

  it("still appears under Yours, as shared", () => {
    expect(
      filterDirectory([google], { ...DEFAULT_DIRECTORY_FILTERS, view: "yours" }),
    ).toEqual([google]);
  });
});
