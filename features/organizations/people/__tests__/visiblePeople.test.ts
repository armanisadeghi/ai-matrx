/**
 * Access is personal (Arman, 2026-09-23): a person resolves when the viewer
 * shares ANY organization with them — here Dana belongs only to the studio's
 * SECOND organization (not the viewer's active one) and still resolves; a
 * stranger who shares none does not. Every lookup in a tick is ONE call to
 * the access-checked door, never a service-role read.
 *
 * The database's answer is modelled from memberships so the test can fail:
 * the stand-in returns only people who share an organization with the viewer.
 */
const VIEWER_ORGS = ["org-kilnworks", "org-glaze-coop"];
const MEMBERSHIPS: Record<string, string[]> = {
  "u-dana": ["org-glaze-coop"], // not the active org
  "u-lee": ["org-kilnworks"],
  "u-stranger": ["org-elsewhere"],
};
const calls: unknown[] = [];
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: { p_user_ids: string[] }) => {
      calls.push([name, args]);
      const rows = args.p_user_ids
        .filter((id) => (MEMBERSHIPS[id] ?? []).some((o) => VIEWER_ORGS.includes(o)))
        .map((id) => ({
          user_id: id,
          email: `${id.slice(2)}@kiln.example`,
          display_name: id === "u-dana" ? "Dana Ruiz" : "Lee Park",
          avatar_url: "",
          role: "member",
          joined_at: "2026-03-01T00:00:00Z",
          organization_id: (MEMBERSHIPS[id] ?? [])[0],
          organization_name: "Glaze co-op",
        }));
      return Promise.resolve({ data: rows, error: null });
    },
  },
}));

import { resolveVisiblePerson, visiblePeopleStats } from "../visiblePeople";

it("resolves someone sharing a NON-active organization, not a stranger — in one call", async () => {
  const before = visiblePeopleStats.calls;
  const [dana, lee, stranger] = await Promise.all([
    resolveVisiblePerson("u-dana"),
    resolveVisiblePerson("u-lee"),
    resolveVisiblePerson("u-stranger"),
  ]);
  expect(visiblePeopleStats.calls - before).toBe(1);
  expect(calls[0]).toEqual(["people_you_share_an_organization_with", { p_user_ids: ["u-dana", "u-lee", "u-stranger"] }]);
  expect(dana?.name).toBe("Dana Ruiz");
  expect(dana?.organizationName).toBe("Glaze co-op");
  expect(lee?.name).toBe("Lee Park");
  expect(stranger).toBeNull();
});
