// features/hr/shared/__tests__/hr-scope-fan-out.test.ts
//
// HR lists span employers (Arman, 2026-09-30). `fanOutHr` is the one place that happens, so
// these pin what a list may and may not do with several employers' answers:
//   - every employer's rows come back tagged with the employer they belong to;
//   - one employer refusing is NAMED, never turned into an empty list or hidden;
//   - only when EVERY employer refuses does the whole call refuse — and a single employer
//     behaves exactly as a bare door call did before.

jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({ organizationId: null }),
}));
jest.mock("@/lib/entity-list/components/EntityOrgFilter", () => ({
  EntityOrgFilter: () => null,
}));
jest.mock("@/lib/entity-list/orgFilterUrl", () => ({
  useOrgFilterParam: () => [null, () => {}],
}));
jest.mock("../useHrContext", () => ({ useHrContext: () => ({}) }));

import type { HrResult } from "../../types";
import { fanOutHr, type HrRowEmployer } from "../hrScope";

const A: HrRowEmployer = { organizationId: "org-a", name: "Alpha", slug: "alpha" };
const B: HrRowEmployer = { organizationId: "org-b", name: "Bravo", slug: null };

const denied: HrResult<never> = {
  ok: false,
  kind: "denied",
  reason: "no_standing",
  detail: null,
  auditId: null,
  field: null,
  door: null,
  payload: {},
};
const failed: HrResult<never> = {
  ok: false,
  kind: "failed",
  message: "The door could not be reached.",
  code: null,
};

describe("fanOutHr", () => {
  it("asks each employer's door once, and tags what came back with its employer", async () => {
    const asked: string[] = [];
    const result = await fanOutHr([A, B], async (organizationId) => {
      asked.push(organizationId);
      return { ok: true, data: [organizationId] } as HrResult<string[]>;
    });

    expect(asked.sort()).toEqual(["org-a", "org-b"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.parts.map((p) => [p.employer.name, p.data])).toEqual([
      ["Alpha", ["org-a"]],
      ["Bravo", ["org-b"]],
    ]);
    expect(result.data.unavailable).toEqual([]);
  });

  it("names an employer that refused instead of dropping it or showing an empty list", async () => {
    const result = await fanOutHr([A, B], async (organizationId) =>
      organizationId === "org-a"
        ? ({ ok: true, data: "rows" } as HrResult<string>)
        : denied,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.parts).toHaveLength(1);
    expect(result.data.unavailable).toEqual([{ employer: B, kind: "denied" }]);
  });

  it("refuses the whole call only when every employer refused, carrying the first refusal", async () => {
    const result = await fanOutHr([A, B], async () => denied);
    expect(result).toBe(denied);
  });

  it("a failure outranks a refusal when nothing answered, so the retry is offered", async () => {
    const result = await fanOutHr([A, B], async (organizationId) =>
      organizationId === "org-a" ? denied : failed,
    );
    expect(result).toBe(failed);
  });

  it("one employer behaves exactly like the bare door call", async () => {
    const result = await fanOutHr([A], async () => denied);
    expect(result).toBe(denied);
  });

  it("no employer in scope is an empty answer, not a refusal", async () => {
    const result = await fanOutHr([], async () => denied);
    expect(result).toEqual({ ok: true, data: { parts: [], unavailable: [] } });
  });
});
