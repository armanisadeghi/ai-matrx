import {
  AdminUserSearchResponseSchema,
  UserSearchCandidateSchema,
  UserSearchWindowDataSchema,
} from "./types";

const candidate = {
  id: "user-1",
  email: "person@example.com",
  displayName: "Example Person",
  avatarUrl: null,
  phone: null,
  adminLevel: null,
  organizations: ["Example Org"],
  source: "Connections",
  createdAt: null,
  lastSignInAt: null,
};

describe("user search runtime schemas", () => {
  it("accepts the serializable provided-directory payload", () => {
    expect(
      UserSearchWindowDataSchema.parse({
        callbackGroupId: "callback-1",
        title: "Find a person",
        initialQuery: "exam",
        directory: "provided",
        candidates: [candidate],
        excludeUserIds: ["user-2"],
      }),
    ).toMatchObject({ directory: "provided", candidates: [candidate] });
  });

  it("rejects incomplete candidates before an overlay renders", () => {
    expect(() =>
      UserSearchCandidateSchema.parse({ id: "user-1", email: null }),
    ).toThrow();
  });

  it("accepts the protected admin directory response shape", () => {
    expect(
      AdminUserSearchResponseSchema.parse({
        users: [
          {
            id: "user-1",
            email: "person@example.com",
            display_name: "Example Person",
            full_name: null,
            avatar_url: null,
            phone: null,
            admin_level: "super_admin",
            organizations: [{ name: "Example Org" }],
            created_at: "2026-08-24T00:00:00.000Z",
            last_sign_in_at: null,
          },
        ],
      }).users,
    ).toHaveLength(1);
  });
});
