// GATES-TAIL (VERIFIER-21 #1n). With the PATCH held 3 s, Pause read "Enable" at 1.2 s; with the
// PATCH refused (500) the control went back and a toast read
//     PATCH /scheduler/tasks/2be9cc7c… 500 — "injected failure"
// Rule: the control does not change until the write succeeds (it shows pending), and a failure
// says what happened in words with a remedy. Red on the pre-fix thunk and client.
const getSession = jest.fn();
const getStoreState = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => getSession(...a) } },
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: getStoreState }),
}));
jest.mock("@/lib/api/resolve-service-url", () => ({
  resolveServiceBaseUrl: () => "https://server.example.test",
}));

import { resetGate, selectOrganization, SELECTED_ORG } from "@/lib/organization/__tests__/gate-harness";
import { describeWriteFailure } from "@/lib/errors/writeFailure";
import { toggleTaskEnabled } from "./thunks";

const TASK_ID = "2be9cc7c-0000-4000-8000-000000000001";
const state = () =>
  ({
    schedulingTasks: {
      byId: { [TASK_ID]: { id: TASK_ID, organizationId: SELECTED_ORG, enabled: true, title: "Harbor Street Duplex — weekly rent-roll reminder" } },
      mutation: {},
    },
  }) as never;

const flippedTo = (dispatch: jest.Mock, enabled: boolean) =>
  dispatch.mock.calls.some(([a]) => a?.type?.endsWith("patchTask") && a.payload?.patch?.enabled === enabled);

describe("a schedule toggle holds until the write lands", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getStoreState, null);
  });
  afterEach(resetGate);

  it("does not read 'paused' while the PATCH is still in flight, and does once it succeeds", async () => {
    let answer!: (v: unknown) => void;
    global.fetch = jest.fn(
      () => new Promise((r) => { answer = r; }),
    ) as unknown as typeof fetch;
    const dispatch = jest.fn((a) => a);

    const pending = toggleTaskEnabled(TASK_ID, false)(dispatch, state, undefined);
    await new Promise((r) => setTimeout(r, 20));
    expect(flippedTo(dispatch, false)).toBe(false); // still reads Pause, pending
    answer({ ok: true, status: 200, json: async () => ({ id: TASK_ID, enabled: false }) });
    await pending;
    expect(flippedTo(dispatch, false)).toBe(true);
  });

  it("a refused PATCH leaves the control as it was and says so in words, never method/path/status", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ detail: "injected failure" }),
    })) as unknown as typeof fetch;
    const dispatch = jest.fn((a) => a);

    let caught: unknown;
    await toggleTaskEnabled(TASK_ID, false)(dispatch, state, undefined).catch((e: unknown) => { caught = e; });

    expect(flippedTo(dispatch, false)).toBe(false);
    const message = (caught as Error).message;
    expect(message).not.toMatch(/PATCH|\/scheduler\/tasks/);
    const words = describeWriteFailure(caught, { action: "pause this schedule", remedy: "Try again or open the schedule's activity." });
    expect(words.title).toBe("Could not pause this schedule.");
    expect(words.description).toMatch(/server refused|server said/i);
    // 6d04fb6ac7: a person never reads a status code.
    expect(words.description).not.toMatch(/\b500\b/);
    expect(`${words.title} ${words.description}`).not.toMatch(/PATCH|\/scheduler/);
  });
});
