const requireSuperAdminDatabaseClient = jest.fn();

jest.mock("server-only", () => ({}));

jest.mock("next/server", () => {
  class TestNextResponse {
    readonly status: number;
    readonly headers: { get: (name: string) => string | null };
    private readonly body: string;

    constructor(
      body: string,
      init: { status?: number; headers?: Record<string, string> } = {},
    ) {
      this.body = body;
      this.status = init.status ?? 200;
      const headers = init.headers ?? {};
      this.headers = {
        get: (name: string) =>
          Object.entries(headers).find(
            ([key]) => key.toLowerCase() === name.toLowerCase(),
          )?.[1] ?? null,
      };
    }

    async json() {
      return JSON.parse(this.body);
    }

    static json(
      value: unknown,
      init: { status?: number; headers?: Record<string, string> } = {},
    ) {
      return new TestNextResponse(JSON.stringify(value), init);
    }
  }

  return { NextResponse: TestNextResponse };
});

jest.mock(
  "@/features/administration/database-hub/require-super-admin-database-client",
  () => ({
    requireSuperAdminDatabaseClient: () => requireSuperAdminDatabaseClient(),
  }),
);

import { GET } from "./route";

describe("schema overview authorization boundary", () => {
  beforeEach(() => {
    requireSuperAdminDatabaseClient.mockReset();
  });

  it("rechecks authority before returning a process-cached payload", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
    requireSuperAdminDatabaseClient.mockResolvedValueOnce({ rpc });

    const first = await GET();
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledTimes(4);

    requireSuperAdminDatabaseClient.mockResolvedValueOnce({ rpc });
    const cached = await GET();
    expect(cached.status).toBe(200);
    expect(cached.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledTimes(4);

    requireSuperAdminDatabaseClient.mockRejectedValueOnce(
      new Error("Forbidden: Super Admin required"),
    );

    const refused = await GET();
    expect(refused.status).toBe(403);
    await expect(refused.json()).resolves.toEqual({
      error: "Forbidden: Super Admin required",
    });
    expect(refused.headers.get("Cache-Control")).toBe("private, no-store");
    expect(requireSuperAdminDatabaseClient).toHaveBeenCalledTimes(3);
  });

  it("marks unexpected error responses private and non-cacheable", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    requireSuperAdminDatabaseClient.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const failed = await GET();
    expect(failed.status).toBe(500);
    expect(failed.headers.get("Cache-Control")).toBe("private, no-store");
    consoleError.mockRestore();
  });
});
