/**
 * An absent triage door that the reader answers with the pre-triage door is NOT an incident
 * (2026-10-02: every /board load filed a RED "PGRST202 communication.my_inbox_summary" while
 * the inbox worked on its fallback). Any other failure of the same door still is.
 * Runs through the REAL capture proxy, not a stub of it.
 */
import { wrapClientForCapture } from "@/lib/diagnostics/supabaseErrorCapture";
import { clearCapturedErrors, getSnapshot } from "@/lib/diagnostics/errorCaptureStore";

let answer: "absent" | "denied" = "absent";

function answerFor(name: string) {
  if (answer === "denied") {
    return { data: null, error: { code: "42501", message: "permission denied" }, status: 403 };
  }
  if (name === "my_notification_unread_count") return { data: 3, error: null, status: 200 };
  if (name === "my_notifications") return { data: [], error: null, status: 200 };
  return {
    data: null,
    error: { code: "PGRST202", message: `Could not find the function communication.${name}` },
    status: 404,
  };
}

// These tests exercise the probe itself, so they run as if the doors were meant to be live.
jest.mock("../triage-live", () => ({ TRIAGE_DOORS_LIVE: true }));
jest.mock("@/utils/supabase/client", () => {
  const raw = {
    schema: () => ({
      rpc: (name: string) => ({
        then(onFulfilled: (value: unknown) => unknown) {
          return Promise.resolve(onFulfilled(answerFor(name)));
        },
      }),
    }),
  };
  return { createClient: () => wrapClientForCapture(raw) };
});

import { fetchInbox, fetchInboxSummary, forgetTriageDoorAbsence, markInboxSeen, setNoticesState } from "../service";

beforeEach(() => {
  forgetTriageDoorAbsence();
  clearCapturedErrors();
  answer = "absent";
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

it("files nothing when a door with a fallback is absent", async () => {
  expect((await fetchInboxSummary()).summary.unread).toBe(3);
  expect((await fetchInbox()).triage).toBe(false);
  expect(await markInboxSeen()).toBe(0);
  expect(getSnapshot()).toHaveLength(0);
});

it("still files Done against an absent door — it has no fallback", async () => {
  await expect(setNoticesState(["a"], "done")).rejects.toThrow();
  expect(getSnapshot()).toHaveLength(1);
});

it("still files any other failure of the same door", async () => {
  answer = "denied";
  await expect(fetchInboxSummary()).rejects.toThrow();
  expect(getSnapshot()).toHaveLength(1);
  expect(getSnapshot()[0]).toMatchObject({ code: "42501", relation: "my_inbox_summary" });
});
