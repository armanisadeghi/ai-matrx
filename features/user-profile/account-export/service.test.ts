import { exportPersonalAccount } from "./service";

const mockGetUser = jest.fn();
const mockQueries: Array<{ table: string; calls: unknown[][] }> = [];
let mockFailTable: string | null = null;
let mockUsageCount = 0;
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    schema: (schema: string) => ({ from: (table: string) => {
      const calls: unknown[][] = [];
      mockQueries.push({ table: `${schema}.${table}`, calls });
      const chain = {
        select: (...args: unknown[]) => { calls.push(["select", ...args]); return chain; },
        eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return chain; },
        is: (...args: unknown[]) => { calls.push(["is", ...args]); return chain; },
        lte: (...args: unknown[]) => { calls.push(["lte", ...args]); return chain; },
        order: (...args: unknown[]) => { calls.push(["order", ...args]); return chain; },
        range: async (from: number, to: number) => {
          calls.push(["range", from, to]);
          const count = table === "usage_ledger" ? mockUsageCount : 1;
          return {
            data: Array.from({ length: Math.max(0, Math.min(to + 1, count) - from) }, (_, index) => ({ id: `${table}-${from + index}` })),
            error: table === mockFailTable ? { message: "database unavailable" } : null,
            count,
          };
        },
      };
      return chain;
    } }),
  }),
}));

describe("personal account export", () => {
  beforeEach(() => {
    mockQueries.length = 0;
    mockFailTable = null;
    mockUsageCount = 0;
    mockGetUser.mockResolvedValue({ data: { user: { id: "person-1", email: "admin@admin.com", created_at: "2026-01-01", app_metadata: { secret: "never-export" } } }, error: null });
  });
  it("uses freshly verified personal selectors and excludes credentials/shared content", async () => {
    const result = await exportPersonalAccount();
    expect(mockGetUser).toHaveBeenCalled();
    for (const query of mockQueries) {
      const selector = query.table === "users.profiles" ? "id" : query.table === "users.user_preferences" || query.table === "users.user_form_profile" ? "user_id" : query.table === "billing.subscription" ? "beneficiary_user_id" : "created_by";
      expect(query.calls).toContainEqual(["eq", selector, "person-1"]);
      expect(query.calls).toContainEqual(["order", query.table === "users.user_form_profile" ? "user_id" : "id"]);
      expect(query.calls.some(call => call[0] === "select" && call[1] === "*")).toBe(false);
    }
    expect(JSON.stringify(result)).not.toContain("never-export");
    expect(result.manifest.excluded).toContain("Projects, conversations, notes and files");
    expect(mockQueries.find(q => q.table === "billing.usage_ledger")?.calls).toContainEqual(["eq", "capability", "platform.points"]);
  });
  it("reads beyond the database page limit and reports complete counts", async () => {
    mockUsageCount = 1203;
    const result = await exportPersonalAccount();
    expect(result.usage).toHaveLength(1203);
    expect(result.manifest.counts.usage).toBe(1203);
    expect(mockQueries.filter(q => q.table === "billing.usage_ledger").length).toBeGreaterThan(1);
  });
  it("fails the entire export rather than downloading partial success", async () => {
    mockFailTable = "subscription";
    await expect(exportPersonalAccount()).rejects.toThrow("database unavailable");
  });
  it("does not query records using a stale or absent identity", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    await expect(exportPersonalAccount()).rejects.toThrow("Sign in");
    expect(mockQueries).toHaveLength(0);
  });
});
