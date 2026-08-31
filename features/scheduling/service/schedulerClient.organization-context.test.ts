const getSession = jest.fn();
const getState = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => getSession(...args) } },
}));

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState }),
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: (state: { organizationId: string | null }) =>
    state.organizationId,
}));

jest.mock("@/lib/api/resolve-service-url", () => ({
  resolveServiceBaseUrl: () => "https://server.example.test",
}));

import { listDuplicateSchedules } from "./schedulerClient";

describe("scheduler client organization admission", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "jwt-token" } },
    });
    getState.mockReturnValue({
      organizationId: "11111111-1111-4111-8111-111111111111",
    });
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

  it("fails before networking when no organization is selected", async () => {
    getState.mockReturnValue({ organizationId: null });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(listDuplicateSchedules()).rejects.toMatchObject({
      code: "organization_context_required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
