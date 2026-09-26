/**
 * A refused re-plan leaves the plan's days and blocks INTACT.
 *
 * The defect (2026-09-25): `planService.regeneratePlan` hard-deleted every
 * block and day, THEN ran the guarded update of the plan row. When that update
 * matched zero rows (RLS refused it, or the plan was archived meanwhile) the
 * person was told so — but the plan had already lost all of its children.
 *
 * The store below models what the database answers: the plan is readable, its
 * children can be deleted, but an UPDATE of the plan row matches zero rows
 * (PostgREST `{ data: [], error: null }`), and `education.regenerate_study_plan`
 * raises 42501 before touching a child (proven live against the real function:
 * a stranger's call returned 42501 and the plan kept 4 days / 5 blocks). Any
 * client that deletes children outside that one transaction fails this test —
 * the pre-fix four-call sequence did (RED), the RPC path passes (GREEN).
 */
type Row = Record<string, unknown>;

const store: { plan: Row; days: Row[]; blocks: Row[]; calls: string[] } = {
  plan: {},
  days: [],
  blocks: [],
  calls: [],
};

const REFUSAL =
  "Nothing was updated: this study plan no longer exists, or your access does not allow updating it.";

function builder(table: string) {
  let op: "select" | "update" | "delete" | "insert" = "select";
  let payload: unknown = null;
  const filters: [string, unknown][] = [];
  const run = () => {
    store.calls.push(`${op} ${table}`);
    const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
    if (table === "study_plan") {
      if (op === "update") return { data: [], error: null }; // RLS: zero rows
      return { data: match(store.plan) ? [store.plan] : [], error: null };
    }
    const key = table === "study_plan_day" ? "days" : "blocks";
    if (op === "delete") {
      const gone = store[key].filter(match);
      store[key] = store[key].filter((r) => !match(r));
      return { data: gone, error: null };
    }
    if (op === "insert") {
      const rows = (Array.isArray(payload) ? payload : [payload]) as Row[];
      store[key].push(...rows);
      return { data: rows, error: null };
    }
    return { data: store[key].filter(match), error: null };
  };
  const b = {
    select: () => b,
    update: (p: unknown) => ((op = "update"), (payload = p), b),
    delete: () => ((op = "delete"), b),
    insert: (p: unknown) => ((op = "insert"), (payload = p), b),
    eq: (k: string, v: unknown) => (filters.push([k, v]), b),
    is: () => b,
    order: () => b,
    single: () => {
      const r = run();
      return Promise.resolve({ data: r.data[0] ?? null, error: r.data[0] ? null : { code: "PGRST116", message: "0 rows" } });
    },
    maybeSingle: () => {
      const r = run();
      return Promise.resolve({ data: r.data[0] ?? null, error: null });
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  __esModule: true,
  supabase: {
    schema: () => ({
      from: (table: string) => builder(table),
      rpc: (name: string) => {
        store.calls.push(`rpc ${name}`);
        // The live function: the plan UPDATE runs first and raises 42501 on
        // zero rows — nothing after it runs, the transaction rolls back.
        return Promise.resolve({ data: null, error: { code: "42501", message: REFUSAL, details: null, hint: null } });
      },
    }),
  },
}));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "user-1" }));
jest.mock("@/lib/organizations/personalOrg", () => ({ ensureOrgId: async () => "org-1" }));

import { planService } from "../planService";
import type { PlanDraft } from "../../planner/types";

const PLAN_ID = "plan-1";

beforeEach(() => {
  store.plan = { id: PLAN_ID, organization_id: "org-1", created_by: "user-1" };
  store.days = [
    { id: "d1", plan_id: PLAN_ID, day_date: "2026-09-26" },
    { id: "d2", plan_id: PLAN_ID, day_date: "2026-09-27" },
  ];
  store.blocks = [
    { id: "b1", plan_id: PLAN_ID, day_id: "d1", label: "Review due cards" },
    { id: "b2", plan_id: PLAN_ID, day_id: "d2", label: "Practice quiz: cell biology" },
  ];
  store.calls = [];
});

const draft = {
  title: "Biology final — two-week plan",
  startDate: "2026-09-26",
  endDate: "2026-10-09",
  dailyMinutes: 30,
  dailyItemCap: 40,
  restDays: [],
  generatedBy: "heuristic",
  config: {},
  days: [
    {
      dayDate: "2026-09-26",
      targetMinutes: 30,
      isRestDay: false,
      blocks: [
        { dayDate: "2026-09-26", targetKind: "review", label: "Review due cards", estimatedMinutes: 30, ordering: 0 },
      ],
    },
  ],
} as unknown as PlanDraft;

test("a refused regenerate leaves the plan's days and blocks intact and says why", async () => {
  const res = await planService.regeneratePlan(PLAN_ID, draft);

  expect(res.data).toBeNull();
  expect(res.error).toContain("Nothing was updated");
  expect(store.days.map((d) => d.id)).toEqual(["d1", "d2"]);
  expect(store.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
  expect(store.calls.filter((c) => c.startsWith("delete"))).toEqual([]);
});
