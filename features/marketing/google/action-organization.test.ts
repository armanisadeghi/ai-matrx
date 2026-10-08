import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { resolveGoogleActionOrganizationId } from "./action-organization";

jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: jest.fn(),
}));

const ensureOrgIdMock = jest.mocked(ensureOrgId);

describe("resolveGoogleActionOrganizationId", () => {
  beforeEach(() => ensureOrgIdMock.mockReset());

  it("preserves a connection-owned organization", async () => {
    ensureOrgIdMock.mockResolvedValue("connection-org");

    await expect(
      resolveGoogleActionOrganizationId("connection-org", "active-org"),
    ).resolves.toBe("connection-org");
    expect(ensureOrgIdMock).toHaveBeenCalledWith("connection-org");
  });

  it("uses the active organization for a personal connection", async () => {
    ensureOrgIdMock.mockResolvedValue("active-org");

    await resolveGoogleActionOrganizationId(null, "active-org");
    expect(ensureOrgIdMock).toHaveBeenCalledWith(null);
  });

  it("falls through to the active-organization funnel when none is given", async () => {
    ensureOrgIdMock.mockResolvedValue("chosen-org");

    await expect(resolveGoogleActionOrganizationId(null, null)).resolves.toBe(
      "chosen-org",
    );
    expect(ensureOrgIdMock).toHaveBeenCalledWith(null);
  });
});
