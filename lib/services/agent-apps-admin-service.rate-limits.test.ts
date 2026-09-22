import { fetchAgentAppRateLimits } from "./agent-apps-admin-service";

const readAllRows = jest.fn();
const schema = jest.fn();
const from = jest.fn();
const rateLimitSelect = jest.fn();
const rateLimitOrder = jest.fn();
const rateLimitEq = jest.fn();
const rateLimitRange = jest.fn();
const rateLimitLimit = jest.fn();
const appSelect = jest.fn();
const appIn = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema }),
}));

jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: (...args: unknown[]) => readAllRows(...args),
}));

const rateLimitRow = {
  id: "limit-1",
  app_id: "app-1",
  user_id: "user-1",
  fingerprint: null,
  ip_address: null,
  execution_count: 12,
  first_execution_at: "2026-09-21T00:00:00.000Z",
  last_execution_at: "2026-09-21T01:00:00.000Z",
  window_start_at: "2026-09-21T00:00:00.000Z",
  is_blocked: true,
  blocked_until: null,
  blocked_reason: "Burst protection",
  created_at: "2026-09-21T00:00:00.000Z",
  updated_at: "2026-09-21T01:00:00.000Z",
};

function configureClient() {
  const rateLimitBuilder = {
    select: rateLimitSelect,
    order: rateLimitOrder,
    eq: rateLimitEq,
    range: rateLimitRange,
    limit: rateLimitLimit,
  };
  rateLimitSelect.mockReturnValue(rateLimitBuilder);
  rateLimitOrder.mockReturnValue(rateLimitBuilder);
  rateLimitEq.mockReturnValue(rateLimitBuilder);
  rateLimitRange.mockResolvedValue({
    data: [rateLimitRow],
    error: null,
    count: 1,
  });
  rateLimitLimit.mockResolvedValue({ data: [rateLimitRow], error: null });
  appSelect.mockReturnValue({ in: appIn });
  appIn.mockResolvedValue({
    data: [{ id: "app-1", name: "Budget analyst", slug: "budget-analyst" }],
    error: null,
  });
  schema.mockReturnValue({ from });
  from.mockImplementation((table: string) =>
    table === "rate_limit" ? rateLimitBuilder : { select: appSelect },
  );
}

describe("fetchAgentAppRateLimits", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureClient();
  });

  it("reads every source-status row through the verified pagination primitive", async () => {
    readAllRows.mockImplementation(async (page, options) => {
      expect(options).toEqual({
        label: "app.rate_limit (agent apps administration)",
      });
      await page({ from: 0, to: 499 });
      return [rateLimitRow];
    });

    await expect(
      fetchAgentAppRateLimits({ is_blocked: true }),
    ).resolves.toEqual([
      expect.objectContaining({
        app_name: "Budget analyst",
        app_slug: "budget-analyst",
      }),
    ]);

    expect(rateLimitSelect).toHaveBeenCalledWith("*", { count: "exact" });
    expect(rateLimitOrder).toHaveBeenNthCalledWith(1, "updated_at", {
      ascending: false,
    });
    expect(rateLimitOrder).toHaveBeenNthCalledWith(2, "id", {
      ascending: false,
    });
    expect(rateLimitEq).toHaveBeenCalledWith("is_blocked", true);
    expect(rateLimitRange).toHaveBeenCalledWith(0, 499);
  });

  it("preserves the explicit bounded preview for legacy callers", async () => {
    await fetchAgentAppRateLimits({ limit: 25 });

    expect(readAllRows).not.toHaveBeenCalled();
    expect(rateLimitLimit).toHaveBeenCalledWith(25);
  });
});
