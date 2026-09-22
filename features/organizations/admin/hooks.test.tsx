import { useState } from "react";
import { renderHook, settle } from "@/test-utils/renderHook";
import type { OrgAdminMemberDetail } from "./types";
import { useOrgMemberDetail } from "./hooks";

const getOrgMember = jest.fn<Promise<OrgAdminMemberDetail>, [string, string]>();

jest.mock("../hooks", () => ({
  useResolvedOrganization: jest.fn(),
}));

jest.mock("./service", () => ({
  getOrgMember: (...args: [string, string]) => getOrgMember(...args),
  getOrgOverview: jest.fn(),
  listOrgMembers: jest.fn(),
}));

function member(userId: string): OrgAdminMemberDetail {
  return {
    userId,
    email: `${userId}@example.com`,
    displayName: userId,
    avatarUrl: null,
    role: "member",
    joinedAt: null,
    status: "active",
    memberLevel: null,
    tierOverride: null,
    storageCapBytes: null,
    monthlyBudgetMcents: null,
    orgFilesCount: 0,
    orgBytesUsed: 0,
    accountBytesUsed: 0,
    accountFilesCount: 0,
    lastOrgActivityAt: null,
    lastRequestAt: null,
    cost24hMcents: 0,
    requests24h: 0,
    requests6h: 0,
    notes: null,
    resources: [],
  };
}

describe("useOrgMemberDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("never exposes the previous member under a new route identity", async () => {
    getOrgMember.mockResolvedValueOnce(member("member-a"));
    let resolveSecond!: (value: OrgAdminMemberDetail) => void;
    getOrgMember.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );

    function useHarness() {
      const [userId, setUserId] = useState("member-a");
      return {
        ...useOrgMemberDetail("org-1", userId),
        setUserId,
      };
    }

    const hook = await renderHook(useHarness);
    await settle(
      hook,
      (value) => value.member?.userId === "member-a",
      "first member",
    );

    await hook.act(() => hook.current.setUserId("member-b"));
    expect(hook.current).toMatchObject({
      member: null,
      loading: true,
      error: null,
    });
    expect(getOrgMember).toHaveBeenLastCalledWith("org-1", "member-b");

    await hook.act(() => resolveSecond(member("member-b")));
    await settle(
      hook,
      (value) => value.member?.userId === "member-b",
      "second member",
    );
    await hook.unmount();
  });

  it("retains same-member rows when a refresh fails", async () => {
    getOrgMember
      .mockResolvedValueOnce(member("member-a"))
      .mockRejectedValueOnce(new Error("network unavailable"));

    const hook = await renderHook(() =>
      useOrgMemberDetail("org-1", "member-a"),
    );
    await settle(
      hook,
      (value) => value.member?.userId === "member-a",
      "member load",
    );

    await hook.act(() => hook.current.refresh());
    await settle(
      hook,
      (value) => !value.loading && value.error !== null,
      "failed refresh",
    );
    expect(hook.current.member?.userId).toBe("member-a");
    expect(hook.current.error).toBe("network unavailable");
    await hook.unmount();
  });
});
