const ensureOrgId = jest.fn<Promise<string>, [string | null | undefined]>();
const resolveSystemOrgId = jest.fn<Promise<string>, []>();

jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: (organizationId: string | null | undefined) =>
    ensureOrgId(organizationId),
}));

jest.mock("@/lib/organizations/systemOrg", () => ({
  resolveSystemOrgId: () => resolveSystemOrgId(),
}));

import { resolveShortcutWriteScope } from "./resolveShortcutWriteScope";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SELECTED_ORG_ID = "22222222-2222-4222-8222-222222222222";
const SYSTEM_ORG_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";

describe("resolveShortcutWriteScope", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureOrgId.mockResolvedValue(SELECTED_ORG_ID);
    resolveSystemOrgId.mockResolvedValue(SYSTEM_ORG_ID);
  });

  it("keeps personal visibility while carrying the selected organization", async () => {
    await expect(
      resolveShortcutWriteScope({ scope: "user", userId: USER_ID }),
    ).resolves.toEqual({
      userId: USER_ID,
      organizationId: SELECTED_ORG_ID,
      projectId: null,
      taskId: null,
    });
    expect(ensureOrgId).toHaveBeenCalledWith(undefined);
    expect(resolveSystemOrgId).not.toHaveBeenCalled();
  });

  it("homes global rows in the system organization without a user owner", async () => {
    await expect(
      resolveShortcutWriteScope({ scope: "global", userId: USER_ID }),
    ).resolves.toEqual({
      userId: null,
      organizationId: SYSTEM_ORG_ID,
      projectId: null,
      taskId: null,
    });
    expect(resolveSystemOrgId).toHaveBeenCalledTimes(1);
    expect(ensureOrgId).not.toHaveBeenCalled();
  });

  it("uses an organization scope id as the explicit owning organization", async () => {
    ensureOrgId.mockImplementation(async (organizationId) => {
      if (!organizationId) throw new Error("missing explicit organization");
      return organizationId;
    });

    await expect(
      resolveShortcutWriteScope({
        scope: "organization",
        scopeId: SELECTED_ORG_ID,
        userId: USER_ID,
      }),
    ).resolves.toEqual({
      userId: null,
      organizationId: SELECTED_ORG_ID,
      projectId: null,
      taskId: null,
    });
  });

  it("carries selected org ownership alongside project visibility", async () => {
    await expect(
      resolveShortcutWriteScope({
        scope: "project",
        scopeId: PROJECT_ID,
        userId: USER_ID,
      }),
    ).resolves.toEqual({
      userId: null,
      organizationId: SELECTED_ORG_ID,
      projectId: PROJECT_ID,
      taskId: null,
    });
  });

  it("refuses incomplete visibility context before a write", async () => {
    await expect(
      resolveShortcutWriteScope({ scope: "user", userId: null }),
    ).rejects.toThrow("before authentication is ready");
    await expect(
      resolveShortcutWriteScope({ scope: "task", userId: USER_ID }),
    ).rejects.toThrow("task scope requires an explicit scope id");
  });
});
