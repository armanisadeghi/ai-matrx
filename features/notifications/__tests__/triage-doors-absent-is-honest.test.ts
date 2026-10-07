/**
 * While `notifications_inbox_triage.sql` is on the clone only, the main database
 * has no triage doors. The reader must fall back to the pre-triage doors AND say
 * so (`triage: false`), so the UI offers no Done/Snooze that would silently fail.
 * Any other error stays an error (never a quiet empty inbox).
 */
const calls: Array<{ name: string; args: unknown }> = [];
let missing = true;
let otherError = false;
// These tests exercise the probe itself, so they run as if the doors were meant to be live.
jest.mock("../triage-live", () => ({ TRIAGE_DOORS_LIVE: true }));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        if (otherError) return { data: null, error: { code: "42501", message: "permission denied" } };
        if (missing && ["inbox_notifications", "my_inbox_summary", "set_notifications_state", "mark_inbox_seen"].includes(name)) {
          return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
        }
        if (name === "my_notifications") {
          const at = new Date().toISOString();
          return { data: [{ id: "a", event_key: "hr.workflow.step_assigned", subject: null, created_at: at, organization_id: "o1" }], error: null };
        }
        if (name === "my_notification_unread_count") return { data: 7, error: null };
        if (name === "inbox_notifications") return { data: [], error: null };
        return { data: null, error: null };
      },
    }),
  }),
}));

import { fetchInbox, fetchInboxSummary, forgetTriageDoorAbsence, markInboxSeen, setNoticesState } from "../service";

beforeEach(() => {
  forgetTriageDoorAbsence();
  calls.length = 0;
  missing = true;
  otherError = false;
});

it("falls back to the pre-triage list and says triage is unavailable", async () => {
  const page = await fetchInbox({ state: "inbox" });
  expect(page.triage).toBe(false);
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0].bucket).toBe("needs_you");
  expect(calls.map((c) => c.name)).toEqual(["inbox_notifications", "my_notifications"]);
});

it("answers Done and Snoozed views as empty-and-unavailable, never a wrong list", async () => {
  expect(await fetchInbox({ state: "done" })).toEqual({ rows: [], triage: false });
  expect(await fetchInbox({ state: "snoozed" })).toEqual({ rows: [], triage: false });
});

it("counts unread as the badge on the pre-triage door", async () => {
  const answer = await fetchInboxSummary();
  expect(answer.triage).toBe(false);
  expect(answer.summary.unseenDirect).toBe(7);
});

it("refuses Done loudly when the door is absent (no silent no-op)", async () => {
  await expect(setNoticesState(["a"], "done")).rejects.toThrow();
  expect(await markInboxSeen()).toBe(0);
});

it("never falls back on any other error", async () => {
  otherError = true;
  await expect(fetchInbox({ state: "inbox" })).rejects.toThrow();
  expect(calls.map((c) => c.name)).toEqual(["inbox_notifications"]);
});

it("uses the triage door when it exists", async () => {
  missing = false;
  const page = await fetchInbox({ state: "done", orgId: "o1" });
  expect(page.triage).toBe(true);
  expect(calls[0].args).toMatchObject({ p_state: "done", p_org_id: "o1" });
});

it("asks an absent triage door once, not on every call (no 404 per page and poll)", async () => {
  await fetchInboxSummary();
  await fetchInboxSummary();
  await fetchInbox({ state: "inbox" });
  expect(calls.filter((c) => c.name === "my_inbox_summary")).toHaveLength(1);
  expect(calls.filter((c) => c.name === "inbox_notifications")).toHaveLength(0);
});
