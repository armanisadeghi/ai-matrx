import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { resolveGoogleActionOrganizationId } from "./action-organization";

jest.mock("@/lib/organization/organization-gate", () => ({
  ensureOrganizationContext: jest.fn(),
}));

const ensureOrganizationContextMock = jest.mocked(ensureOrganizationContext);

describe("resolveGoogleActionOrganizationId", () => {
  beforeEach(() => ensureOrganizationContextMock.mockReset());

  it("preserves a connection-owned organization", async () => {
    ensureOrganizationContextMock.mockResolvedValue("connection-org");

    await expect(
      resolveGoogleActionOrganizationId("connection-org", "active-org"),
    ).resolves.toBe("connection-org");
    expect(ensureOrganizationContextMock).toHaveBeenCalledWith({
      organizationId: "connection-org",
    });
  });

  it("uses the active organization for a personal connection", async () => {
    ensureOrganizationContextMock.mockResolvedValue("active-org");

    await resolveGoogleActionOrganizationId(null, "active-org");
    expect(ensureOrganizationContextMock).toHaveBeenCalledWith({
      organizationId: "active-org",
    });
  });

  it("invokes the interactive organization gate when none is selected", async () => {
    ensureOrganizationContextMock.mockResolvedValue("chosen-org");

    await expect(resolveGoogleActionOrganizationId(null, null)).resolves.toBe(
      "chosen-org",
    );
    expect(ensureOrganizationContextMock).toHaveBeenCalledWith({
      organizationId: null,
    });
  });
});
