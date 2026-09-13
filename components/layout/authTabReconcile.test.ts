import {
  decideBlockedTabReconcile,
  HIDDEN_TAB_RELOAD_JITTER_MS,
  reloadDelayMs,
} from "./authTabReconcile";

describe("decideBlockedTabReconcile", () => {
  const booted = "user-a";

  describe("Session Expired overlay", () => {
    it("stays blocked while nobody is signed in", () => {
      expect(
        decideBlockedTabReconcile({
          variant: "expired",
          bootedId: booted,
          currentId: null,
        }),
      ).toEqual({ action: "stay" });
    });

    it("reloads when the original account signs back in from another tab", () => {
      // Redux authority was cleared at sign-out, so in-place resume is not
      // honest — the reload re-hydrates the tab as the returning account.
      expect(
        decideBlockedTabReconcile({
          variant: "expired",
          bootedId: booted,
          currentId: booted,
        }),
      ).toMatchObject({ action: "reload" });
    });

    it("reloads when a different account signs in", () => {
      expect(
        decideBlockedTabReconcile({
          variant: "expired",
          bootedId: booted,
          currentId: "user-b",
        }),
      ).toMatchObject({ action: "reload" });
    });
  });

  describe("Account Changed overlay", () => {
    it("resumes in place when the cookie returns to the booted identity", () => {
      expect(
        decideBlockedTabReconcile({
          variant: "identity-changed",
          bootedId: booted,
          currentId: booted,
        }),
      ).toEqual({ action: "resume" });
    });

    it("reloads to continue as the account the browser now holds", () => {
      expect(
        decideBlockedTabReconcile({
          variant: "identity-changed",
          bootedId: booted,
          currentId: "user-b",
        }),
      ).toMatchObject({ action: "reload" });
    });

    it("switches to the expired overlay when the cookie is emptied", () => {
      expect(
        decideBlockedTabReconcile({
          variant: "identity-changed",
          bootedId: booted,
          currentId: null,
        }),
      ).toEqual({ action: "expire" });
    });

    it("never resumes without a booted identity to compare against", () => {
      expect(
        decideBlockedTabReconcile({
          variant: "identity-changed",
          bootedId: null,
          currentId: "user-b",
        }),
      ).toMatchObject({ action: "reload" });
    });
  });
});

describe("reloadDelayMs", () => {
  it("reloads a visible tab immediately", () => {
    expect(reloadDelayMs(true, () => 0.99)).toBe(0);
  });

  it("spreads hidden-tab reloads across the jitter window", () => {
    expect(reloadDelayMs(false, () => 0)).toBe(0);
    expect(reloadDelayMs(false, () => 0.5)).toBe(HIDDEN_TAB_RELOAD_JITTER_MS / 2);
    expect(reloadDelayMs(false, () => 0.999)).toBeLessThan(
      HIDDEN_TAB_RELOAD_JITTER_MS,
    );
  });
});
