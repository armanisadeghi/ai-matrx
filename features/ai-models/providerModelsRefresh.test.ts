import { refreshProviderModels } from "./providerModelsRefresh";

const mockCallApi = jest.fn();
const mockResolveSystemOrgId = jest.fn();

jest.mock("@/lib/api/call-api", () => ({
  callApi: (...args: unknown[]) => mockCallApi(...args),
}));

jest.mock("@/lib/organizations/systemOrg", () => ({
  resolveSystemOrgId: () => mockResolveSystemOrgId(),
}));

const SUMMARY = {
  started_at: "2026-09-11T17:19:27.438834Z",
  refreshed: 1,
  missing_key: 0,
  no_provider_row: 0,
  failed: 0,
  results: [
    {
      provider_slug: "xai",
      provider_label: "xAI",
      provider_id: "ffe876a4-f529-4f7c-85b6-afec891fb019",
      status: "refreshed",
      model_count: 12,
      fetched_at: "2026-09-11T17:19:28.072530Z",
      detail: null,
    },
  ],
};

describe("refreshProviderModels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveSystemOrgId.mockResolvedValue("system-org-id");
  });

  // 🚨 THE Sync Now DEFECT (2026-09-11). This thunk pinned the request scope to
  // the Matrx System organization — copied from the row-OWNERSHIP pattern,
  // where platform-owned ROWS really are homed there. But nobody holds an
  // `iam.memberships` row in that org, and the server proves membership on
  // every request, so every Sync Now died with 400 `organization_forbidden`
  // before the route was even entered. `/admin/ai-catalog/provider-models/
  // refresh` reads no organization at all; an administrator carries their own,
  // exactly like any other caller.
  it("sends NO organization override — the route is platform-scoped", async () => {
    const apiThunk = jest.fn().mockResolvedValue({ data: SUMMARY });
    mockCallApi.mockReturnValue(apiThunk);
    const dispatch = jest.fn(async (action) => action());

    const result = await refreshProviderModels(["xai"])(
      dispatch,
      jest.fn(),
      undefined,
    );

    expect(mockResolveSystemOrgId).not.toHaveBeenCalled();
    expect(mockCallApi).toHaveBeenCalledWith({
      path: "/admin/ai-catalog/provider-models/refresh",
      method: "POST",
      body: { provider_slugs: ["xai"] },
    });
    expect(result).toEqual(SUMMARY);
  });

  it("refreshes every provider when no slugs are named", async () => {
    mockCallApi.mockReturnValue(jest.fn().mockResolvedValue({ data: SUMMARY }));
    const dispatch = jest.fn(async (action) => action());

    await refreshProviderModels()(dispatch, jest.fn(), undefined);

    expect(mockCallApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { provider_slugs: null } }),
    );
    expect(mockCallApi).not.toHaveBeenCalledWith(
      expect.objectContaining({ scopeOverrides: expect.anything() }),
    );
  });

  it("reports a failed request as null instead of a fake summary", async () => {
    mockCallApi.mockReturnValue(
      jest.fn().mockResolvedValue({ error: { message: "refresh rejected" } }),
    );
    const dispatch = jest.fn(async (action) => action());
    const consoleError = jest.spyOn(console, "error").mockImplementation();

    const result = await refreshProviderModels(["xai"])(
      dispatch,
      jest.fn(),
      undefined,
    );

    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
