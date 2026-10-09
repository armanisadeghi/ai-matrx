/**
 * The triage doors are live (2026-10-07). The badge must come from `my_inbox_summary` — whose
 * "unseen" clears when the bell opens — and never from the pre-triage unread count, which no
 * opening of the bell can lower (the "stuck at N forever" badge). Red while TRIAGE_DOORS_LIVE was
 * false: the reader never asked my_inbox_summary and answered with the unread count.
 */
const calls: string[] = [];
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      rpc: async (name: string) => {
        calls.push(name);
        if (name === "my_inbox_summary") {
          return {
            data: [{ unseen_needs_you: 1, unseen_direct: 0, unseen_updates: 2, unread: 400, inbox: 900, snoozed: 0, done: 3 }],
            error: null,
          };
        }
        if (name === "mark_inbox_seen") return { data: 3, error: null };
        if (name === "my_notification_unread_count") return { data: 400, error: null };
        return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      },
    }),
  }),
}));

import { fetchInboxSummary, forgetTriageDoorAbsence, markInboxSeen } from "../service";

beforeEach(() => {
  forgetTriageDoorAbsence();
  calls.length = 0;
});

it("counts through my_inbox_summary, not the unread count", async () => {
  const answer = await fetchInboxSummary();
  expect(answer.triage).toBe(true);
  expect(answer.summary.unseenNeedsYou + answer.summary.unseenDirect).toBe(1);
  expect(calls).toEqual(["my_inbox_summary"]);
});

it("opening the bell asks mark_inbox_seen", async () => {
  expect(await markInboxSeen()).toBe(3);
  expect(calls).toEqual(["mark_inbox_seen"]);
});
