import { canManageInvitations } from "@/features/organizations/types";

describe("canManageInvitations", () => {
  it.each([
    ["owner", true],
    ["admin", true],
    ["member", false],
  ] as const)("allows role=%s: %s", (role, expected) => {
    expect(canManageInvitations(role)).toBe(expected);
  });
});
