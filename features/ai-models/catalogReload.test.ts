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

  it("binds the global reload to the platform system organization", async () => {
    const apiThunk = jest.fn().mockResolvedValue({ data: { models: 12 } });
    mockCallApi.mockReturnValue(apiThunk);
    const dispatch = jest.fn(async (action) => action());

    const result = await reloadAiCatalog()(dispatch, jest.fn(), undefined);

    expect(mockResolveSystemOrgId).toHaveBeenCalledTimes(1);
    expect(mockCallApi).toHaveBeenCalledWith({
      path: "/admin/ai-catalog/reload",
      method: "POST",
      scopeOverrides: { organization_id: "system-org-id" },
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
