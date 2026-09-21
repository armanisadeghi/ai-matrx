// THE REPORT SURVIVES A BUSY DATABASE — and so does the search for it.
//
// THE USE CASE these rows come from. Cascade Ridge Grounds Care is a 14-crew
// commercial landscaping company in Portland, Oregon. Its dispatchers run the
// morning route board in Matrx, and when the board misbehaves the agent working
// beside them files what it hit. On 2026-09-20 two of those reports were
// destroyed by a single `57014` (statement timeout) on a 0.738 ms lookup — the
// database was momentarily busy, and the crew's written work was thrown away.
//
// This suite is the forcing function for that class: it is green only if a
// report and a search BOTH survive a transient cancellation, and only if a
// refusal that does not clear tells the caller what to do about it.

import {
  listFeedbackItems,
  submitFeedback,
} from "@/lib/services/agent-feedback.service";

const CASCADE_RIDGE_ORG = "6f2b1c48-0a3d-4c1e-9b77-1d2e3f4a5b60";
const DISPATCHER_USER = "b1d0c9a2-7e64-4a30-8f19-2c5b6d7e8f90";

/** The refusal the crew actually got, in the shape PostgREST hands back. */
const STATEMENT_TIMEOUT = {
  code: "57014",
  message: "canceling statement due to statement timeout",
};

/** A refusal that is the caller's fault and will never clear by waiting. */
const PERMISSION_DENIED = {
  code: "42501",
  message: "permission denied for table user_feedback",
};

const ROUTE_BOARD_ROW = {
  id: "0c7c9a51-5f8b-4a2d-9a1e-3b6c7d8e9f01",
  user_id: DISPATCHER_USER,
  organization_id: CASCADE_RIDGE_ORG,
  username: "Cascade Ridge dispatch agent",
  feedback_type: "bug",
  route: "/dispatch/route-board",
  description:
    "Moving the Beaverton Town Square mow from crew 4 to crew 7 on the Tuesday board silently reverts after the board refreshes.",
  status: "new",
  priority: "high",
  image_file_ids: [],
  metadata: { submitted_via: "agent_feedback_api" },
  created_at: "2026-09-20T15:04:11.000Z",
  updated_at: "2026-09-20T15:04:11.000Z",
  has_open_issues: false,
  admin_decision: "pending",
  ai_complexity: null,
  ai_suggested_priority: null,
  testing_result: null,
  work_priority: null,
  deleted_at: null,
};

/**
 * One PostgREST outcome per attempt. Every chained method returns the same
 * chainable object; awaiting it consumes the next queued outcome. The whole
 * chain is rebuilt from `supabase.schema(...)` on each attempt, so
 * `chainBuilds` counts how many times the service really went back to the
 * database rather than re-awaiting a settled promise.
 */
function makeSupabase(outcomes: Array<{ data: unknown; error: unknown }>) {
  const queue = [...outcomes];
  let chainBuilds = 0;
  const next = () => queue.shift() ?? { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const method of [
    "from",
    "select",
    "insert",
    "update",
    "eq",
    "is",
    "in",
    "order",
    "limit",
    "single",
    "maybeSingle",
  ]) {
    chain[method] = () => chain;
  }
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(next()).then(resolve, reject);

  const supabase = {
    schema: () => {
      chainBuilds += 1;
      return chain;
    },
    rpc: () => {
      chainBuilds += 1;
      return chain;
    },
  };
  return { supabase, builds: () => chainBuilds };
}

let currentSupabase: ReturnType<typeof makeSupabase>;

jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: () => currentSupabase.supabase,
}));

jest.mock("@/lib/organizations/systemOrg", () => ({
  resolveSystemOrgId: jest.fn(async () => "6f2b1c48-0a3d-4c1e-9b77-1d2e3f4a5b60"),
}));

const silence = () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("a Cascade Ridge report is not destroyed by a busy database", () => {
  test("the report lands after the insert is cancelled once", async () => {
    silence();
    currentSupabase = makeSupabase([
      // resolveAgentUserId: the dispatcher IS a real Matrx user, so one lookup.
      { data: { id: DISPATCHER_USER }, error: null },
      { data: null, error: STATEMENT_TIMEOUT },
      { data: ROUTE_BOARD_ROW, error: null },
    ]);

    const result = await submitFeedback(
      DISPATCHER_USER,
      "Cascade Ridge dispatch agent",
      {
        feedback_type: "bug",
        description: ROUTE_BOARD_ROW.description,
        route: "/dispatch/route-board",
        priority: "high",
      },
    );

    expect(result.success).toBe(true);
    expect(result.data?.description).toBe(ROUTE_BOARD_ROW.description);
  });

  test("a report that never clears tells the agent to send it again", async () => {
    silence();
    currentSupabase = makeSupabase([
      { data: { id: DISPATCHER_USER }, error: null },
      { data: null, error: STATEMENT_TIMEOUT },
      { data: null, error: STATEMENT_TIMEOUT },
      { data: null, error: STATEMENT_TIMEOUT },
    ]);

    const result = await submitFeedback(DISPATCHER_USER, "Cascade Ridge dispatch agent", {
      feedback_type: "bug",
      description: ROUTE_BOARD_ROW.description,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("TRANSIENT database condition");
    expect(result.error).toContain("make the same request again");
  });
});

describe("searching the tracker survives the same condition", () => {
  test("list/search retries a cancelled statement and asks the database again", async () => {
    silence();
    currentSupabase = makeSupabase([
      { data: null, error: STATEMENT_TIMEOUT },
      { data: null, error: STATEMENT_TIMEOUT },
      { data: [ROUTE_BOARD_ROW], error: null },
    ]);

    const result = await listFeedbackItems({ query: "route-board", limit: 25 });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    // THE BUILDER IS REBUILT, NOT RE-AWAITED: three real trips to the database.
    expect(currentSupabase.builds()).toBe(3);
  });

  test("a search that never clears says the condition is transient", async () => {
    silence();
    currentSupabase = makeSupabase([
      { data: null, error: STATEMENT_TIMEOUT },
      { data: null, error: STATEMENT_TIMEOUT },
      { data: null, error: STATEMENT_TIMEOUT },
    ]);

    const result = await listFeedbackItems({ status: "new" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("TRANSIENT database condition");
  });

  test("a permission denial is returned at once, not retried", async () => {
    silence();
    currentSupabase = makeSupabase([{ data: null, error: PERMISSION_DENIED }]);

    const result = await listFeedbackItems({});

    expect(result.success).toBe(false);
    expect(result.error).toContain("permission denied");
    expect(result.error).not.toContain("TRANSIENT");
    expect(currentSupabase.builds()).toBe(1);
  });
});
