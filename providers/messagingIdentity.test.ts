import { verifiedMessagingUserId } from "./messagingIdentity";

describe("verifiedMessagingUserId", () => {
  it("keeps messaging inert while Redux and the database session name different users", () => {
    expect(verifiedMessagingUserId("user-a", "user-b")).toBeNull();
  });

  it("keeps messaging inert until both identity sources have hydrated", () => {
    expect(verifiedMessagingUserId("user-a", null)).toBeNull();
    expect(verifiedMessagingUserId(null, "user-a")).toBeNull();
  });

  it("admits the exact user authenticated to the database", () => {
    expect(verifiedMessagingUserId("user-a", "user-a")).toBe("user-a");
  });
});
