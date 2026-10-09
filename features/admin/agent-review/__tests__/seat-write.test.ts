const inserts: unknown[] = [];

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: (table: string) => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { organization_id: "org-1" }, error: null }) }) }),
        update: () => ({ eq: () => ({ select: () => Promise.resolve({}) }) }),
        insert: (row: unknown) => {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: async (id: string) => id }));
jest.mock("@/utils/supabase/writeOne", () => ({
  tryWriteOne: async () => ({ error: null }),
  WriteDidNotLandError: class extends Error {},
}));

import { recordHumanReviewAction } from "../service";
import type { ReviewQueueRow } from "../types";

const ROW = { id: "r1", conversation_id: "c1" } as unknown as ReviewQueueRow;
const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }));

beforeEach(() => {
  inserts.length = 0;
  fetchMock.mockClear();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  window.history.pushState({}, "", "/");
});

describe("the review feedback write", () => {
  it("off the seat inserts as the reviewer and stamps THEIR name, not a fixed one", async () => {
    await recordHumanReviewAction({ row: ROW, userId: "u1", actorLabel: "Dana Whitfield", content: "Looks right", status: "approved" });
    const row = (inserts[0] as { row: { metadata: { actor_label: string } } }).row;
    expect(row.metadata.actor_label).toBe("Dana Whitfield");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("on the admin seat goes through the lane-gated admin door with the reviewer's name", async () => {
    window.history.pushState({}, "", "/administration/users/agent-review/r1");
    await recordHumanReviewAction({ row: ROW, userId: "u1", actorLabel: "Dana Whitfield", content: "Looks right", status: "approved" });
    expect(inserts).toHaveLength(0);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/admin/agent-review/feedback");
    expect(JSON.parse(init.body)).toMatchObject({ reviewId: "r1", actorLabel: "Dana Whitfield" });
  });
});
