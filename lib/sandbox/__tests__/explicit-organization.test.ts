import {
  requireMatchingSandboxOrganization,
  requireSandboxOrganizationId,
} from "@/lib/sandbox/explicit-organization";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("sandbox explicit organization boundary", () => {
  it.each([undefined, null, "", "not-a-uuid"])(
    "refuses %s before a create call",
    (value) => {
      expect(() => requireSandboxOrganizationId(value)).toThrow(
        "The request was not sent",
      );
    },
  );

  it("returns the exact explicit organization", () => {
    expect(requireSandboxOrganizationId(ORG_ID)).toBe(ORG_ID);
  });

  it("refuses a payload from a stale app context", () => {
    expect(() =>
      requireMatchingSandboxOrganization(
        ORG_ID,
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toThrow("active organization changed");
  });
});
