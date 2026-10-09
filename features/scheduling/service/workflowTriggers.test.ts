/**
 * Triggers manager guards: the flags, the seat-aware doors, and that each seat
 * asks the database for exactly its own scope. (The database refuses the rest;
 * those refusals were proven against live data with rolled-back transactions.)
 */
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ rpc }) } }));
jest.mock("@/utils/supabase/schedulerDb", () => ({
  schedulerDb: (c: { schema: (s: string) => unknown }) => c.schema("scheduler"),
}));
jest.mock("@ai-matrx/data", () => ({ pgErrorToError: (e: { message: string }) => new Error(e.message) }));

import {
  fetchManagedTriggers,
  setWorkflowTriggerState,
  triggerExtraFlags,
  triggerRunHref,
  triggerWorkflowHref,
  type ManagedTrigger,
  type WorkflowTriggerOverview,
} from "./workflowTriggers";

const overview = (o: Partial<WorkflowTriggerOverview> = {}): WorkflowTriggerOverview => ({
  trigger_id: "t1",
  kind: "cron",
  cron_expression: "0 9 * * *",
  timezone: "UTC",
  is_active: true,
  created_at: "2026-10-01T00:00:00Z",
  created_by: "u1",
  created_by_email: "ann@example.com",
  creator_is_platform_admin: false,
  organization_id: "o1",
  organization_name: "Green Co",
  organization_is_system: false,
  definition_id: "d1",
  workflow_name: "News monitor run",
  last_fired_at: null,
  next_run_at: null,
  fire_count: 0,
  event_source: null,
  ...o,
});

async function managed(o: Partial<WorkflowTriggerOverview>, name: string): Promise<ManagedTrigger> {
  rpc.mockImplementation(async (fn: string) =>
    fn === "workflow_trigger_overview"
      ? { data: [overview(o)], error: null }
      : { data: [], error: null },
  );
  const [t] = await fetchManagedTriggers("o1");
  return { ...t, cost: { ...t.cost, name } };
}

beforeEach(() => rpc.mockReset());

describe("trigger flags", () => {
  it("[disposable] is a hard flag", async () => {
    const f = triggerExtraFlags(await managed({}, "News: [disposable] x"));
    expect(f.find((x) => x.id === "disposable")?.severity).toBe("critical");
  });
  it("a name that merely looks like a test is only a hint", async () => {
    const f = triggerExtraFlags(await managed({}, "Weekly walk report"));
    expect(f.find((x) => x.id === "disposable")).toBeUndefined();
    expect(f.find((x) => x.id === "test_looking_name")?.severity).toBe("hint");
  });
  it("an ordinary name gets neither", async () => {
    const f = triggerExtraFlags(await managed({}, "Referral follow-up"));
    expect(f.map((x) => x.id)).toEqual(["no_approval"]);
  });
  it("admin and test accounts are flagged, even with no runs", async () => {
    expect(triggerExtraFlags(await managed({ created_by_email: "admin@admin.com" }, "x")).some((x) => x.id === "test_account")).toBe(true);
    expect(triggerExtraFlags(await managed({ creator_is_platform_admin: true }, "x")).some((x) => x.id === "test_account")).toBe(true);
  });
  it("a paused trigger is not 'firing with no approval'", async () => {
    expect(triggerExtraFlags(await managed({ is_active: false }, "x")).some((x) => x.id === "no_approval")).toBe(false);
  });
  it("a trigger with no runs still names its own organization", async () => {
    const t = await managed({}, "x");
    expect(t.cost.organization_name).toBe("Green Co");
  });
});

describe("seats", () => {
  it("an org seat asks for its own org; the admin seat asks for all", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchManagedTriggers("o1");
    await fetchManagedTriggers(null);
    const overviewCalls = rpc.mock.calls.filter((c) => c[0] === "workflow_trigger_overview");
    expect(overviewCalls[0][1]).toEqual({ p_org_id: "o1" });
    expect(overviewCalls[1][1]).toEqual({ p_org_id: null });
  });
  it("a refusal from the database surfaces, never an empty list", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Forbidden: organization admin required" } });
    await expect(fetchManagedTriggers("o2")).rejects.toThrow(/Forbidden/);
    await expect(setWorkflowTriggerState("t1", "pause")).rejects.toThrow(/Forbidden/);
  });
  it("org admins get the org-scoped run page, never the owner-only workflow-run page; the workflow is always a link", () => {
    const run = { run_id: "r1", workflow_run_id: "w1" };
    expect(triggerRunHref("org", "green", "t1", run)).toBe("/organizations/green/admin/triggers/t1/runs/r1");
    expect(triggerRunHref("admin", undefined, "t1", run)).toBe("/workflows/runs/w1");
    expect(triggerWorkflowHref("org", "d1")).toBe("/workflows/d1/triggers");
    expect(triggerWorkflowHref("admin", "d1")).toBe("/workflows/d1/triggers");
  });
});
