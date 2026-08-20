import {
  parseRememberedAccount,
  rememberValidatedAccount,
  REMEMBERED_ACCOUNT_KEY,
} from "@/utils/auth/remembered-account";

describe("remembered account", () => {
  it("stores display-only account hints", () => {
    let stored = "";
    rememberValidatedAccount(
      {
        setItem: (key, value) => {
          expect(key).toBe(REMEMBERED_ACCOUNT_KEY);
          stored = value;
        },
      },
      {
        fullName: "Arman Sadeghi",
        name: null,
        preferredUsername: null,
        avatarUrl: "https://example.com/avatar.jpg",
        picture: null,
      },
    );
    expect(parseRememberedAccount(stored)).toMatchObject({
      displayName: "Arman Sadeghi",
      avatarUrl: "https://example.com/avatar.jpg",
    });
    expect(stored).not.toContain("accessToken");
    expect(stored).not.toContain("email");
  });

  it("refuses malformed or nameless records", () => {
    expect(parseRememberedAccount("not json")).toBeNull();
    expect(parseRememberedAccount('{"avatarUrl":"x"}')).toBeNull();
  });
});
