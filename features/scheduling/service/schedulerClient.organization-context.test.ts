// 🚨 THE STORE SHAPE HERE IS `lib/organization/organization-gate.ts`'S OWN
// READ, NOT A SELECTOR. `ensureOrganizationContext` (the gate this client now
// goes through — see the SOURCE-KEY note in schedulerClient.ts) reads
// `state.appContext?.organization_id` directly, so the mock must answer in
// that exact shape or every case here silently falls through to the
// no-organization branch.
const getSession = jest.fn();
const getState = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  },
}));

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState }),
}));

jest.mock("@/lib/api/resolve-service-url", () => ({
  resolveServiceBaseUrl: () => "https://server.example.test",
}));

import {
  isOrganizationPickerAvailable,
  registerOrganizationPicker,
  settleOrganizationSelection,
} from "@/lib/organization/organization-gate";
import { getStatus, listDuplicateSchedules, createTask } from "./schedulerClient";

function setSelectedOrganization(organizationId: string | null): void {
  getState.mockReturnValue({ appContext: { organization_id: organizationId } });
}

describe("scheduler client organization admission", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    registerOrganizationPicker(null);
    settleOrganizationSelection(null);
    getSession.mockResolvedValue({
      data: { session: { access_token: "jwt-token" } },
    });
    setSelectedOrganization("11111111-1111-4111-8111-111111111111");
  });

  afterEach(() => {
    registerOrganizationPicker(null);
  });

  it("stamps the selected organization on identified scheduler requests", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ groups: [] }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await listDuplicateSchedules();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://server.example.test/scheduler/tasks/duplicates");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer jwt-token");
    expect(headers.get("X-Organization-Id")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("fails before networking when no organization is selected and no picker is mounted", async () => {
    setSelectedOrganization(null);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(listDuplicateSchedules()).rejects.toMatchObject({
      code: "organization_context_required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses an explicitly admitted organization when the singleton is still booting", async () => {
    setSelectedOrganization(null);
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ running: true }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await getStatus("22222222-2222-4222-8222-222222222222");

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(new Headers(init.headers).get("X-Organization-Id")).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
  });

  // 🚨 THE REGRESSION THIS LANE FIXES (SOURCE-KEY, /schedules/new).
  //
  // Before: with no organization selected, a create request threw
  // `organization_context_required` straight at the caller with no picker
  // ever asked to open — a bare toast, and the person had no way to continue
  // short of finding the header's org switcher and pressing Create again.
  // `OrganizationGateDialog`'s own copy promises "We'll continue where you
  // left off" — a promise this call path never kept, because it never went
  // through the gate that makes it.
  //
  // After: the SAME single call that used to reject now ASKS (via the
  // registered picker), and once the person answers, the ORIGINAL call
  // resumes and reaches the network with the chosen organization stamped on
  // it — with no second invocation from the caller. This test fails against
  // the pre-fix `schedulerClient.ts` (which read the bare, synchronous
  // `requireOrganizationContext` kernel and never called the picker at all)
  // and passes once `authHeaders` awaits `ensureOrganizationContext`.
  it("asks for a workspace when none is selected, then continues the SAME request with the answer — never a second call", async () => {
    setSelectedOrganization(null);
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ deduplicated: false, id: "task-1" }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const CHOSEN_ORG = "33333333-3333-4333-8333-333333333333";
    const openPicker = jest.fn();
    registerOrganizationPicker(() => {
      openPicker();
      // The dialog's own "Continue" handler: settle with the chosen
      // organization on the next microtask, the same way the real component
      // resolves after a click.
      queueMicrotask(() => settleOrganizationSelection(CHOSEN_ORG));
    });
    expect(isOrganizationPickerAvailable()).toBe(true);

    // ONE call — the same one a person's single "Create schedule" click
    // makes. It must resolve on its own once the picker answers; the old
    // behaviour required a SECOND, separate call after the dialog closed.
    const result = await createTask({
      kind: "agent",
      title: "disposable test schedule",
      description: null,
      surfaces: ["any"],
      tags: [],
      queue: "default",
      expires_at: null,
      enabled: true,
      agent_task: {
        agent_id: "44444444-4444-4444-8444-444444444444",
        prompt: "test",
        variables: {},
        persistent_conversation_id: null,
        auth_mode: "ask",
        max_runtime_seconds: 600,
        max_concurrent: 1,
      },
      trigger: { type: "interval", config: { every_seconds: 3600 }, enabled: true },
    } as Parameters<typeof createTask>[0]);

    expect(openPicker).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: "task-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("X-Organization-Id")).toBe(CHOSEN_ORG);
  });
});
