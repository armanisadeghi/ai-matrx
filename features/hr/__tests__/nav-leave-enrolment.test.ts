/*
  🚨 NAV VISIBILITY FOR MY TIME OFF IS AN ENROLMENT FACT, NOT A CLASS FACT.

  Round 32 found the failure this pins. `hr-nav.ts` hid My Time Off from anybody
  whose worker class sat in a static `NO_LEAVE_ACCRUAL` list — right when it was
  written, because those classes do not accrue leave. Then `hr_l5_27` gave
  SPEC-LEAVE §2.8's override a door ("adding a contractor requires an explicit
  override with a reason"), and the moment somebody used it the product held a
  contractor with a legitimate, reasoned, recorded leave enrolment whose menu
  entry was hidden by a list that cannot see enrolments. She could hold a
  balance, file a request and have it approved — and never find the page.

  A per-class list cannot express a per-person exception. `hr_my_context` now
  carries `has_active_leave_enrolment` (`hr_l5_30`) and the nav consults it.

  THE DIRECTION MATTERS: the flag can only ever REVEAL. `!== true` means an
  absent, null or false flag leaves every class default exactly as it was, so a
  payload regression can never strip a menu that the class list was not already
  stripping. That is why L1's own contractor assertions below still hold
  unchanged.

  These mirror rules the SERVER enforces; every destination stays refused
  server-side, and `hr.leave_request_submit` names the refusal
  (`worker_class_outside_policy_scope`) when there is no override.
*/

import { resolveHrNav } from "../shared/hr-nav";

const base = {
  persona: "employee" as const,
  capabilities: [] as string[],
  employmentId: "11dfa190-0000-0000-0000-000000000000",
  org: { slug: "acme" } as never,
};

// The resolver takes the whole context payload, so the tests build one too —
// exercising the same seam the product does rather than a flag list that no
// caller uses any more.
const keysFor = (workerClass: string | null, hasLeaveEnrolment?: boolean | null) =>
  resolveHrNav({
    ...base,
    active: {
      worker_class: workerClass,
      has_active_leave_enrolment: hasLeaveEnrolment ?? null,
    } as never,
  }).items.map((i) => i.key);

describe("My Time Off follows enrolment, not worker class", () => {
  it("shows leave to a contractor holding a §2.8 override enrolment", () => {
    // The case that was broken: she is enrolled deliberately and can transact.
    expect(keysFor("contractor", true)).toContain("leave");
  });

  it("still hides leave from a contractor with no enrolment", () => {
    // The original intent survives — this is the ordinary contractor.
    expect(keysFor("contractor", false)).not.toContain("leave");
  });

  it("shows leave to an employee who has no enrolment yet", () => {
    /*
      Enrolment-pending. The page answers "you are not on any leave policy yet"
      in words, which is an answer; a missing menu item is not. The class is not
      in the no-accrual default, so the flag never gets a say.
    */
    expect(keysFor("employee", false)).toContain("leave");
  });

  it("hides nothing extra when the flag is absent — only a positive reveals", () => {
    // A stale client or an older payload must behave exactly as before the flag
    // existed, which is what keeps L1's contractor assertions true.
    expect(keysFor("contractor", undefined)).toEqual(keysFor("contractor", null));
    expect(keysFor("employee", undefined)).toContain("leave");
    expect(keysFor("contractor", undefined)).not.toContain("leave");
  });

  it("leaves class-gated surfaces alone — an enrolment does not buy a timeclock", () => {
    /*
      The class list stays for surfaces that genuinely gate by class. A leave
      enrolment says nothing about whether somebody clocks, and `hr.clock_state`
      still refuses a contractor by name.
    */
    const enrolledContractor = keysFor("contractor", true);
    expect(enrolledContractor).not.toContain("time");
    expect(enrolledContractor).not.toContain("schedule");
    // ...and she keeps her own record, as before. Absence stays targeted.
    expect(enrolledContractor).toContain("me");
    expect(enrolledContractor).toContain("documents");
  });

  it("hides nothing when the worker class is unknown, flag or no flag", () => {
    // L1's law, unchanged on this axis.
    expect(keysFor(null, false)).toEqual(keysFor("employee", false));
    expect(keysFor(null, true)).toEqual(keysFor("employee", true));
  });
});
