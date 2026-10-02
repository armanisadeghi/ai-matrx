/**
 * LANE-B (2026-10-02) — a directive write is the PERSON's write, so it lands in
 * the organization THEY chose, never the admin section's platform tenant.
 *
 * What a reviewer hit on the nightly copy: the Directive Builder lives at
 * /administration/agents/relationships/directives, and every request from the
 * admin section is bound to the admin lane's platform tenant ("Matrx System")
 * by `readSelectedOrganizationId`. `POST /directives/execute` runs as the person
 * under their own row security (`acting_as_user`), so the task it created was
 * stamped into Matrx System while the org switcher on the same screen named the
 * person's own workspace. And a refusal came back as a bare `Error("Execute
 * failed: 400 Bad Request")`, so the panel's plain-words path
 * (`BackendApiError.userMessage`) never ran.
 */
const getSession = jest.fn();
const getState = jest.fn();

jest.mock("@/utils/supabase/client", () => {
  const client = {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  };
  return { createClient: () => client, supabase: client };
});
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState }),
}));

import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { BackendApiError } from "@/lib/api/errors";
import {
  CHOSEN_ORG,
  SELECTED_ORG,
  mockFetchJson,
  mountPickerAnswering,
  organizationHeaderOf,
  resetGate,
  selectOrganization,
} from "@/lib/organization/__tests__/gate-harness";
import { confirmDirective, executeDirective } from "../service";

const BASE = "https://server.example.test";
const BUILDER_PATH = "/administration/agents/relationships/directives";
const CREATE = {
  directive: "directive_v1_create_task",
  items: [{ title: "LANE-B — builder write" }],
};

function adminLaneHeaderOf(fetchMock: jest.Mock): string | null {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return new Headers(init.headers).get("x-matrx-admin-lane");
}

describe("a person's directive write — destination organization", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    window.history.pushState({}, "", BUILDER_PATH);
  });
  afterEach(() => {
    resetGate();
    window.history.pushState({}, "", "/");
  });

  it("Execute in the admin section writes into the organization the person selected", async () => {
    selectOrganization(getState, SELECTED_ORG);
    const fetchMock = mockFetchJson({ directive: CREATE.directive, applied: 1, failed: 0, receipts: [] });

    await executeDirective(BASE, CREATE).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).not.toBe(SYSTEM_ORGANIZATION_ID);
    expect(organizationHeaderOf(fetchMock)).toBe(SELECTED_ORG);
    expect(adminLaneHeaderOf(fetchMock)).toBeNull();
  });

  it("Apply on a card in the admin section also writes into the person's organization", async () => {
    selectOrganization(getState, SELECTED_ORG);
    const fetchMock = mockFetchJson({});

    await confirmDirective(BASE, CREATE).catch(() => undefined);

    expect(organizationHeaderOf(fetchMock)).toBe(SELECTED_ORG);
  });

  it("with nothing selected it ASKS — the platform tenant is never chosen for them", async () => {
    selectOrganization(getState, null);
    const fetchMock = mockFetchJson({ directive: CREATE.directive, applied: 1, failed: 0, receipts: [] });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await executeDirective(BASE, CREATE).catch(() => undefined);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("a refusal reaches the panel as the server's own sentence", async () => {
    selectOrganization(getState, SELECTED_ORG);
    mockFetchJson(
      {
        error: "invalid_directive",
        message: "directive_v1_create_task validation failed at title: Field required",
        user_message: "Nothing was applied — title is required.",
        details: null,
      },
      400,
    );

    const failure = await executeDirective(BASE, CREATE).then(
      () => null,
      (e: unknown) => e,
    );

    expect(failure).toBeInstanceOf(BackendApiError);
    expect((failure as BackendApiError).userMessage).toBe(
      "Nothing was applied — title is required.",
    );
  });
});
