// features/applets/embed/__tests__/a-signed-out-visitor-reads-a-published-applet-card.test.ts — lane F13.
//
// THE USE CASE. 2026-10-09, www.aimatrx.com/site/w2-applet-test-6e9ce75c, signed out: a published Site holding a
// published-to-web Applet ("Post Approvals") showed only its title. The card's read named `created_by`, a column the
// signed-out role may not read, so PostgREST refused the WHOLE read (42501, two 401s in the console) and the card drew
// nothing. Row security already answers a guest exactly the Applets on the web; only the owner column was in the way.
//
// BREAKS THIS CATCHES: a refused owner column hiding the card · a guest read that returns an Applet not on the web
// (the database decides; this asserts the card reads what it is given) · any other read error passing silently.

const mockSelects: string[] = [];
let mockGuest = true;
let mockOtherError: { code: string; message: string } | null = null;

const POST_APPROVALS = {
  id: "f1e6a45a-9404-480c-a01d-a90062407f3b",
  name: "Post Approvals",
  slug: "post-approvals",
  description: "See each client's open posts and approve them in one tap.",
  status: "published",
  published_to_web: true,
  deleted_at: null,
};

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: (columns: string) => {
          mockSelects.push(columns);
          const answer = async () => {
            if (mockOtherError) return { data: null, error: mockOtherError };
            if (mockGuest && columns.includes("created_by"))
              return { data: null, error: { code: "42501", message: "permission denied for table definition" } };
            return { data: [{ ...POST_APPROVALS, ...(columns.includes("created_by") ? { created_by: "owner-1" } : {}) }], error: null };
          };
          const chain = {
            in: () => chain,
            eq: () => chain,
            is: () => chain,
            maybeSingle: async () => {
              const r = await answer();
              return { data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error };
            },
            then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => answer().then(ok, bad),
          };
          return chain;
        },
      }),
    }),
  }),
}));
jest.mock("next/dynamic", () => () => () => null);

import { readAppletBySlug, readAppletCards } from "../appletsPort";

describe("a signed-out visitor reads a published Applet's card", () => {
  beforeEach(() => {
    mockSelects.length = 0;
    mockGuest = true;
    mockOtherError = null;
  });

  it("a refused owner column is answered by the same read without it", async () => {
    const cards = await readAppletCards([POST_APPROVALS.id]);
    const card = cards.get(POST_APPROVALS.id);
    expect(card).toMatchObject({ name: "Post Approvals", slug: "post-approvals", onTheWeb: true, createdBy: null });
    expect(mockSelects).toHaveLength(2);
    expect(mockSelects[1]).not.toContain("created_by");
  });

  it("a pasted link reads the same way", async () => {
    await expect(readAppletBySlug("post-approvals")).resolves.toMatchObject({ id: POST_APPROVALS.id, onTheWeb: true });
  });

  it("a signed-in viewer reads once, with the owner", async () => {
    mockGuest = false;
    const card = (await readAppletCards([POST_APPROVALS.id])).get(POST_APPROVALS.id);
    expect(card?.createdBy).toBe("owner-1");
    expect(mockSelects).toHaveLength(1);
  });

  it("any other error is a fault, said as one", async () => {
    mockOtherError = { code: "PGRST301", message: "JWT expired" };
    await expect(readAppletCards([POST_APPROVALS.id])).rejects.toThrow("The Applet could not be read.");
  });
});
