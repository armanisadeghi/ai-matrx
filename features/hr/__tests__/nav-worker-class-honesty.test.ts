/*
  🚨 NAV MUST NOT OFFER A SURFACE THE SERVER REFUSES FOR THIS WORKER CLASS.

  T-13 found a contractor holding a "My Timesheet" nav entry whose destination
  `hr.clock_state` blocks outright — "Contractors do not clock in. Your time is
  invoiced through your engagement." — while her own profile had already dropped
  the matching tab. Two parts of one screen described the same person
  differently, and the nav was the half that was wrong.

  The cause was that the nav could not see what she is: `hr_my_context().active`
  carried no worker class at all (fixed in `hr_l1_35`). This test pins the
  client half, because the failure mode is silent — nothing errors, an entry is
  simply offered to somebody it cannot work for, and it only shows up when a
  human walks the surface as a contractor.

  These assertions mirror rules the SERVER already enforces. They are not a
  second source of truth: every destination stays refused server-side.
*/

import { resolveHrNav } from "../shared/hr-nav";

const base = {
  persona: "employee" as const,
  capabilities: [] as string[],
  employmentId: "11dfa190-0000-0000-0000-000000000000",
  org: { slug: "acme" } as never,
};

const keysFor = (workerClass: string | null) =>
  resolveHrNav({ ...base, active: { worker_class: workerClass } as never }).items.map(
    (i) => i.key,
  );

describe("self-service nav is honest about worker class", () => {
  it("offers an employee the time, schedule and leave surfaces", () => {
    const keys = keysFor("employee");
    expect(keys).toContain("time");
    expect(keys).toContain("schedule");
    expect(keys).toContain("leave");
  });

  it("does not offer a contractor a surface whose door refuses her", () => {
    const keys = keysFor("contractor");
    // `hr.clock_state` blocks a contractor from the clock, by name.
    expect(keys).not.toContain("time");
    expect(keys).not.toContain("schedule");
    // No leave accrual, so there is no balance to show.
    expect(keys).not.toContain("leave");
    // ...and she still has her own record and documents. Absence is targeted,
    // not a stripped menu — a contractor is a person here, not a lesser one.
    expect(keys).toContain("me");
    expect(keys).toContain("documents");
  });

  it("hides leave from a volunteer but leaves the clock alone", () => {
    const keys = keysFor("volunteer");
    expect(keys).not.toContain("leave");
    expect(keys).toContain("time");
  });

  /*
    An unknown class must not silently strip somebody's menu. Hiding on null
    would mean a payload regression — or any employment the class query cannot
    resolve — quietly deletes nav entries for real employees, which is a far
    worse failure than showing one entry too many.
  */
  it("hides nothing when the worker class is unknown", () => {
    expect(keysFor(null)).toEqual(keysFor("employee"));
  });
});
