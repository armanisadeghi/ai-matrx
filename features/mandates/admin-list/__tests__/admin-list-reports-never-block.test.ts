/**
 * THE LIST NEVER WAITS FOR A SERVER REPORT (2026-09-25).
 *
 * The admin mandate list used to hold its first database page behind two
 * aidream reports (code truth + coverage), and the grades behind a third. The
 * page must paint from the database at once; each report lands on its own and
 * fills its cells, and until it does the row says the cell is still being
 * read — never blank, never a guessed verdict.
 *
 * RED against the blocking store: `ensureMandateAdminReports` did not resolve
 * while code truth and coverage were still in flight.
 */
import type { MandateCodeTruthReport } from "@/features/mandates/admin/service";
import type { MandateCoverageResponse } from "@/features/mandates/coverage";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const truth = deferred<MandateCodeTruthReport>();
const coverage = deferred<MandateCoverageResponse>();
const agents = deferred<string[]>();

jest.mock("@/features/mandates/admin/service", () => ({
  fetchMandateCodeTruthReport: jest.fn(() => truth.promise),
}));
jest.mock("@/features/mandates/coverage", () => ({
  fetchMandateCoverage: jest.fn(() => coverage.promise),
}));
jest.mock("@/features/mandates/admin/impact", () => ({
  fetchStandingImpact: jest.fn(() => new Promise(() => {})),
}));
jest.mock("../rpc", () => ({
  callMandateAdminList: jest.fn(() => agents.promise),
}));

import {
  ensureMandateAdminReports,
  getMandateAdminListState,
} from "../store";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const dispatch = (() => undefined) as never;

describe("the admin mandate list's server reports", () => {
  it("hand back the reports as they stand without waiting for any of them", async () => {
    const answer = await Promise.race([
      ensureMandateAdminReports(dispatch).then(() => "answered"),
      new Promise((resolve) => setTimeout(() => resolve("still waiting"), 50)),
    ]);
    expect(answer).toBe("answered");
    const state = getMandateAdminListState();
    expect(state.reports).toEqual({ codeTruth: null, coverage: null, impact: null });
    expect(state.settled).toEqual({ codeTruth: false, coverage: false, impact: false });
  });

  it("each report fills in on its own and asks the list again", async () => {
    const before = getMandateAdminListState().version;
    coverage.resolve({ red: [], orange: [] } as unknown as MandateCoverageResponse);
    await flush();
    const afterCoverage = getMandateAdminListState();
    expect(afterCoverage.settled).toEqual({ codeTruth: false, coverage: true, impact: false });
    expect(afterCoverage.reports.coverage).not.toBeNull();
    expect(afterCoverage.version).toBeGreaterThan(before);
    expect(afterCoverage.status).toBe("loading");

    truth.reject(new Error("code truth is down"));
    agents.resolve([]);
    await flush();
    const done = getMandateAdminListState();
    expect(done.settled).toEqual({ codeTruth: true, coverage: true, impact: true });
    expect(done.reports.codeTruth).toBeNull();
    expect(done.failures.codeTruth).toBe("code truth is down");
    expect(done.status).toBe("ready");
  });

  it("a second ask while reading starts nothing new", async () => {
    const { fetchMandateCoverage } = jest.requireMock("@/features/mandates/coverage");
    await ensureMandateAdminReports(dispatch);
    expect(fetchMandateCoverage).toHaveBeenCalledTimes(1);
  });
});
