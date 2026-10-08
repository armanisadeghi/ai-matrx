// features/approvals/__tests__/the-inbox-is-read-once-per-page-load.test.ts — lane PAGE-BUNDLE-2
//
// The bell's count, the approvals list and the table page's held-writes chip each asked
// `custom.work_inbox` (three calls per table page on production). They share one read, in flight
// and for a moment after; a decision (`invalidateApprovals`) makes the next read ask again.

import { QueryClient } from "@tanstack/react-query";
import { sharedInboxRead } from "../sharedInbox";
import { invalidateApprovals } from "../queryKeys";

const USER = "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081";

describe("the inbox is read once per page load", () => {
  afterEach(() => invalidateApprovals(new QueryClient()));

  it("three readers a moment apart share one read", async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return [{ item_id: "i1" }];
    };
    const [a, b] = await Promise.all([sharedInboxRead(USER, read), sharedInboxRead(USER, read)]);
    const c = await sharedInboxRead(USER, read);
    expect(a).toEqual(b);
    expect(c).toEqual(a);
    expect(reads).toBe(1);
  });

  it("a decision asks again", async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return [];
    };
    await sharedInboxRead(USER, read);
    invalidateApprovals(new QueryClient());
    await sharedInboxRead(USER, read);
    expect(reads).toBe(2);
  });

  it("a failed read is not shared", async () => {
    let reads = 0;
    const failing = async () => {
      reads += 1;
      throw new Error("the store did not answer");
    };
    await expect(sharedInboxRead(USER, failing)).rejects.toThrow();
    await expect(sharedInboxRead(USER, failing)).rejects.toThrow();
    expect(reads).toBe(2);
  });
});
