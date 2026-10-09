const calls: Array<{ method: string; args: unknown[] }> = [];
let schemaName = "";
let tableName = "";

function builder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    b[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return b;
    };
  }
  b.range = (...args: unknown[]) => {
    calls.push({ method: "range", args });
    return Promise.resolve({
      data: [
        {
          id: "e1", type: "utility", status: "completed", cost: 0.5, error: null,
          link_kind: "sch_run", link_id: "l1", started_at: null, ended_at: null,
          created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z",
          organization_id: "o1", context: { user_id: "owner-9" },
        },
      ],
      error: null,
      count: 383367,
    });
  };
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: (s: string) => {
      schemaName = s;
      return { from: (t: string) => { tableName = t; return builder(); } };
    },
  }),
}));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "me-1" }));

import { executionsService } from "../services/executions-service";

beforeEach(() => {
  calls.length = 0;
  window.history.pushState({}, "", "/");
});

describe("executionsService.list", () => {
  it("reads runtime.global_execution, never the retired ai_tasks table", async () => {
    await executionsService.list({ limit: 50 });
    expect(schemaName).toBe("runtime");
    expect(tableName).toBe("global_execution");
  });
  it("on the admin seat applies NO owner filter and maps the owner from context", async () => {
    window.history.pushState({}, "", "/administration/ai/ai-tasks");
    const { executions, total } = await executionsService.list({ limit: 50 });
    expect(calls.some((c) => c.method === "eq")).toBe(false);
    expect(executions[0]?.user_id).toBe("owner-9");
    expect(total).toBe(383367);
  });
  it("on a user page narrows to the caller's own runs", async () => {
    await executionsService.list({ limit: 50 });
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["context->>user_id", "me-1"]);
  });
});
