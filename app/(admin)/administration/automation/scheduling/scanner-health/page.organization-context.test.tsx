/**
 * Regression for scanner status firing before Redux organization admission.
 *
 * Removing ScannerHealthPage's `canLoad` gate must make this suite call the
 * protected status transport during unresolved boot and surface its refusal.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const getStatus = jest.fn();
const invalidateQueries = jest.fn();
const queryClient = { invalidateQueries };

let gate = {
  organizationId: null as string | null,
  canLoad: false,
  organizationRequired: false,
  resolving: true,
};

jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => gate,
}));

jest.mock("@/features/scheduling/service/schedulerClient", () => ({
  getStatus: (...args: unknown[]) => getStatus(...args),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClient,
}));

jest.mock("@/features/admin/attention/sources/useScheduleAlarmSource", () => ({
  SCHEDULE_ALARMS_QUERY_KEY: ["schedule-alarms"],
  useScheduleAlarmSource: () => ({ items: [], status: "ok", error: null }),
}));

jest.mock("@/features/admin/attention/build-notice", () => ({
  partitionItems: () => ({ live: [], muted: [] }),
}));

jest.mock("@/features/admin/attention/item-mute", () => ({
  NOTE_MUTE: { label: "one hour", ms: 3_600_000 },
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => true,
}));

jest.mock("@/hooks/useNow", () => ({ useNow: () => new Date(0) }));

jest.mock("@/components/dialogs/text-input/TextInputDialog", () => ({
  TextInputDialog: () => null,
}));

jest.mock("@/features/scheduling/lib/admin-scheduling-scope", () => ({
  definedOnly: (value: unknown) => value,
  useAdminSchedulingScopeSlice: jest.fn(),
}));

jest.mock(
  "@/features/organizations/components/OrganizationRequiredNotice",
  () => ({
    OrganizationRequiredNotice: ({ what }: { what: string }) => (
      <div>Choose an organization for {what}</div>
    ),
  }),
);

import ScannerHealthPage from "./page";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

async function renderPage(): Promise<void> {
  await act(async () => {
    root.render(<ScannerHealthPage />);
    await Promise.resolve();
  });
}

describe("ScannerHealthPage organization admission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    gate = {
      organizationId: null,
      canLoad: false,
      organizationRequired: false,
      resolving: true,
    };
    getStatus.mockResolvedValue({
      running: true,
      started_at: "2026-09-15T15:00:00.000Z",
      last_tick_at: "2026-09-15T15:01:00.000Z",
      last_tick_duration_ms: 10,
      last_tick_claimed: 0,
      last_tick_manual_claimed: 0,
      last_tick_expired_sweeps: 0,
      total_runs_dispatched: 0,
      in_flight_count: 0,
      consecutive_errors: 0,
      error_message: null,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("does not request status while organization boot is unresolved", async () => {
    await renderPage();

    expect(getStatus).not.toHaveBeenCalled();
    const refresh = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Refresh"),
    );
    expect(refresh?.disabled).toBe(true);
    act(() => refresh?.click());
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("requests status immediately once an organization arrives", async () => {
    await renderPage();
    gate = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      canLoad: true,
      organizationRequired: false,
      resolving: false,
    };
    await renderPage();

    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("requests status again when the selected organization changes", async () => {
    gate = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      canLoad: true,
      organizationRequired: false,
      resolving: false,
    };
    await renderPage();

    gate = {
      organizationId: "22222222-2222-4222-8222-222222222222",
      canLoad: true,
      organizationRequired: false,
      resolving: false,
    };
    await renderPage();

    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden and refreshes when the page becomes visible", async () => {
    let hidden = true;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    gate = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      canLoad: true,
      organizationRequired: false,
      resolving: false,
    };
    await renderPage();
    expect(getStatus).not.toHaveBeenCalled();

    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it("ignores a late response from the previously selected organization", async () => {
    let resolveFirst:
      ((value: Awaited<ReturnType<typeof getStatus>>) => void) | undefined;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    getStatus.mockReturnValueOnce(first).mockResolvedValueOnce({
      running: false,
      started_at: null,
      last_tick_at: "2026-09-15T15:02:00.000Z",
      last_tick_duration_ms: 10,
      last_tick_claimed: 0,
      last_tick_manual_claimed: 0,
      last_tick_expired_sweeps: 0,
      total_runs_dispatched: 0,
      in_flight_count: 0,
      consecutive_errors: 0,
      error_message: null,
    });
    gate = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      canLoad: true,
      organizationRequired: false,
      resolving: false,
    };
    await renderPage();
    gate = {
      organizationId: "22222222-2222-4222-8222-222222222222",
      canLoad: true,
      organizationRequired: false,
      resolving: false,
    };
    await renderPage();
    expect(container.textContent).toContain("Scanner stopped");

    resolveFirst?.({
      running: true,
      started_at: "2026-09-15T15:00:00.000Z",
      last_tick_at: "2026-09-15T15:01:00.000Z",
      last_tick_duration_ms: 10,
      last_tick_claimed: 0,
      last_tick_manual_claimed: 0,
      last_tick_expired_sweeps: 0,
      total_runs_dispatched: 0,
      in_flight_count: 0,
      consecutive_errors: 0,
      error_message: null,
    });
    await act(async () => Promise.resolve());

    expect(container.textContent).toContain("Scanner stopped");
    expect(container.textContent).not.toContain("Scanner running");
  });

  it("shows an organization notice after boot settles without an organization", async () => {
    gate = {
      organizationId: null,
      canLoad: false,
      organizationRequired: true,
      resolving: false,
    };
    getStatus.mockRejectedValue(
      new Error("Select an organization before sending this request"),
    );
    await renderPage();

    expect(getStatus).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Choose an organization for Scanner health",
    );
    expect(container.textContent).not.toContain("Scanner unreachable");
  });
});
