/**
 * While the inbox triage migration is a held draft, the live database has no `my_inbox_summary`
 * (or any other triage door). Asking for it was a 404 on every page. The reader must answer from the
 * pre-triage doors without ever sending a triage request.
 */
const calls: string[] = [];
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      rpc: async (name: string) => {
        calls.push(name);
        if (name === "my_notification_unread_count") return { data: 4, error: null };
        return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      },
    }),
  }),
}));

import { fetchInboxSummary, forgetTriageDoorAbsence } from "../service";
import { TRIAGE_DOORS_LIVE } from "../triage-live";

it("the triage doors are still a draft", () => {
  expect(TRIAGE_DOORS_LIVE).toBe(false);
});

it("counts through the pre-triage door and never asks for my_inbox_summary", async () => {
  forgetTriageDoorAbsence();
  calls.length = 0;
  const answer = await fetchInboxSummary();
  expect(answer.triage).toBe(false);
  expect(answer.summary.unread).toBe(4);
  expect(calls).toEqual(["my_notification_unread_count"]);
});
