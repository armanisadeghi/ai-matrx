/**
 * appContextPolicyCookie.test.ts — at boot, the shared apex cookie beats this
 * origin's cached active organization, and a cookie override is only HALF an
 * answer (no name) so the boot reconciles instead of trusting the cache.
 */

import { jest } from "@jest/globals";

const read = jest.fn<(userId: string) => string | null>();
jest.mock("@/lib/organizations/activeOrgCookie", () => ({
  activeOrgCookie: { read: (userId: string) => read(userId), write: jest.fn(), clear: jest.fn() },
}));
const getIdentity = jest.fn<() => { type: "auth"; userId: string } | { type: "guest" }>();
jest.mock("@/lib/sync/identity", () => ({
  getIdentity: () => getIdentity(),
}));

import { appContextPolicy } from "@/lib/redux/slices/appContextSlice";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const cached = {
  organization_id: ORG_A,
  organization_name: "Acme",
  personal_organization_id: null,
};

beforeEach(() => {
  read.mockReset();
  getIdentity.mockReset();
});

describe("appContextPolicy.deserialize", () => {
  it("keeps the cached org when the cookie agrees (or is absent)", () => {
    getIdentity.mockReturnValue({ type: "auth", userId: USER });
    read.mockReturnValue(ORG_A);
    expect(appContextPolicy.config.deserialize!(cached)).toMatchObject({
      organization_id: ORG_A,
      organization_name: "Acme",
    });
    read.mockReturnValue(null);
    expect(appContextPolicy.config.deserialize!(cached)).toMatchObject({
      organization_id: ORG_A,
      organization_name: "Acme",
    });
  });

  it("lets a choice made on ANOTHER surface (the cookie) beat this origin's stale cache — name unknown, so null", () => {
    getIdentity.mockReturnValue({ type: "auth", userId: USER });
    read.mockReturnValue(ORG_B);
    const out = appContextPolicy.config.deserialize!(cached);
    expect(out.organization_id).toBe(ORG_B);
    expect(out.organization_name).toBeNull();
    expect(read).toHaveBeenCalledWith(USER);
  });

  it("never consults the cookie for a guest identity", () => {
    getIdentity.mockReturnValue({ type: "guest" });
    read.mockReturnValue(ORG_B);
    expect(appContextPolicy.config.deserialize!(cached).organization_id).toBe(ORG_A);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("appContextPolicy.remote.cacheSatisfies", () => {
  const satisfies = appContextPolicy.config.remote!.cacheSatisfies!;
  it("a full record (id + name) suppresses the cold-boot fetch", () => {
    expect(satisfies({ organization_id: ORG_A, organization_name: "Acme" } as never)).toBe(true);
  });
  it("a cookie override (id, no name) is half an answer — reconcile", () => {
    expect(satisfies({ organization_id: ORG_B, organization_name: null } as never)).toBe(false);
  });
  it("a hollow record is not an answer", () => {
    expect(satisfies({ organization_id: null, organization_name: null } as never)).toBe(false);
  });
});
