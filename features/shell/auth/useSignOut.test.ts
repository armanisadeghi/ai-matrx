import { describe, expect, it, jest } from "@jest/globals";
import { confirmSuperAdminSignOut, superAdminSignOutCopy } from "./useSignOut";

describe("super admin sign-out asks twice, by name", () => {
  it("names the account owner in both warnings and tells an agent to stop", () => {
    const copy = superAdminSignOutCopy("Arman Sadeghi", "arman@example.com");
    expect(copy.first.description).toContain("Arman Sadeghi (arman@example.com)");
    expect(copy.first.description).toContain("coding agent: stop here");
    expect(copy.second.title).toBe("Last check: are you Arman Sadeghi?");
    expect(copy.second.confirmLabel).toBe("I am Arman Sadeghi. Sign me out");
  });

  it("declining the first warning never shows the second", async () => {
    const ask = jest.fn<(o: { variant: string }) => Promise<boolean>>().mockResolvedValue(false);
    await expect(confirmSuperAdminSignOut("Arman", null, ask)).resolves.toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("declining the second warning refuses the sign-out", async () => {
    const ask = jest.fn<(o: { variant: string }) => Promise<boolean>>().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(confirmSuperAdminSignOut("Arman", null, ask)).resolves.toBe(false);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("only two confirmations sign a super admin out", async () => {
    const ask = jest.fn<(o: { variant: string }) => Promise<boolean>>().mockResolvedValue(true);
    await expect(confirmSuperAdminSignOut("Arman", null, ask)).resolves.toBe(true);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls.every(([o]) => o.variant === "destructive")).toBe(true);
  });
});
