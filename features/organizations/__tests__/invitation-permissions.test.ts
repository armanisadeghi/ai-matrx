import { canManageInvitations } from "@/features/organizations/types";

describe("canManageInvitations", () => {
  it.each([
    ["owner", false, true],
    ["admin", false, true],
    ["member", false, false],
    ["owner", true, false],
    ["admin", true, false],
    ["member", true, false],
  ] as const)(
    "allows role=%s, personal=%s: %s",
    (role, isPersonal, expected) => {
      expect(canManageInvitations(role, isPersonal)).toBe(expected);
    },
  );
});
