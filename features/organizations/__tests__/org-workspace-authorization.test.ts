import { loadOrgWorkspaceData } from "@/features/organizations/orgWorkspaceLoader";
import type { Organization } from "@/features/organizations/types";

const organization = { id: "org-1" } as Organization;

describe("loadOrgWorkspaceData", () => {
  it("does not query the member directory before membership is proved", async () => {
    const listMembers = jest.fn();

    await expect(
      loadOrgWorkspaceData("visible-org", {
        resolveOrganization: jest.fn().mockResolvedValue(organization),
        resolveRole: jest.fn().mockResolvedValue(null),
        listMembers,
      }),
    ).resolves.toEqual({ organization: null, role: null, members: [] });

    expect(listMembers).not.toHaveBeenCalled();
  });

  it("queries members only after the caller's organization role resolves", async () => {
    const members = [{ id: "membership-1" }];
    const listMembers = jest.fn().mockResolvedValue(members);

    await expect(
      loadOrgWorkspaceData("visible-org", {
        resolveOrganization: jest.fn().mockResolvedValue(organization),
        resolveRole: jest.fn().mockResolvedValue("member"),
        listMembers,
      }),
    ).resolves.toEqual({ organization, role: "member", members });

    expect(listMembers).toHaveBeenCalledTimes(1);
    expect(listMembers).toHaveBeenCalledWith("org-1");
  });
});
