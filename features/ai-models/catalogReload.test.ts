import { reloadAiCatalog } from "./catalogReload";

const mockCallApi = jest.fn();
const mockResolveSystemOrgId = jest.fn();
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();

jest.mock("@/lib/api/call-api", () => ({
  callApi: (...args: unknown[]) => mockCallApi(...args),
}));

jest.mock("@/lib/organizations/systemOrg", () => ({
  resolveSystemOrgId: () => mockResolveSystemOrgId(),
}));

jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

describe("reloadAiCatalog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveSystemOrgId.mockResolvedValue("system-org-id");
  });

  // 🚨 REGRESSION GUARD (2026-09-11). This used to assert the OPPOSITE — that
  // the reload was pinned to the Matrx System organization — and that
  // assertion is exactly what shipped the defect: `/admin/ai-catalog/reload`
  // is platform-scoped, nobody holds an iam.memberships row in the system org,
  // and the server's admission gate refused every call with 400
  // `organization_forbidden` before routing. An administrator carries their
  // own organization like any other caller.
  it("sends NO organization override — the route is platform-scoped", async () => {
    const apiThunk = jest.fn().mockResolvedValue({ data: { models: 12 } });
    mockCallApi.mockReturnValue(apiThunk);
    const dispatch = jest.fn(async (action) => action());

    const result = await reloadAiCatalog()(dispatch, jest.fn(), undefined);

    expect(mockResolveSystemOrgId).not.toHaveBeenCalled();
    expect(mockCallApi).toHaveBeenCalledWith({
      path: "/admin/ai-catalog/reload",
      method: "POST",
    });
    expect(result).toBe(true);
    expect(mockToastSuccess).toHaveBeenCalledWith("Backend AI catalog reloaded");
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("keeps the existing loud failure when the scoped reload fails", async () => {
    const error = { message: "reload rejected" };
    mockCallApi.mockReturnValue(jest.fn().mockResolvedValue({ error }));
    const dispatch = jest.fn(async (action) => action());
    const consoleError = jest.spyOn(console, "error").mockImplementation();

    const result = await reloadAiCatalog()(dispatch, jest.fn(), undefined);

    expect(result).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      "[reloadAiCatalog] backend catalog reload failed",
      error,
    );
    expect(mockToastError).toHaveBeenCalledWith(
      "Saved to the database, but the backend catalog reload FAILED — the live server is still using the old rules.",
      { description: "reload rejected" },
    );
    consoleError.mockRestore();
  });
});
