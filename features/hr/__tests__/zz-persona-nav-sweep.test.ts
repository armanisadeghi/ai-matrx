// TEMPORARY verification probe (plumbing sweep). Prints the resolved HR nav for
// each persona so a verifier can compare every destination against the routes
// that actually exist on disk. Delete after the sweep.
import { describe, it } from "vitest";

import { resolveHrNav } from "../shared/hr-nav";

const ADMIN_CAPS = [
  "identity.write",
  "records.govern",
  "audit.read",
  "time.read",
  "working_record.read",
  "requisition.manage",
  "candidate.read",
];

import { appendFileSync } from "node:fs";

const OUT = "/private/tmp/claude-501/-Users-armanisadeghi-code-common-docs/c70d36d3-9188-4d99-aaed-c2f11032e2eb/scratchpad/persona-nav.txt";

function show(label: string, res: ReturnType<typeof resolveHrNav>) {
  appendFileSync(
    OUT,
    `\n### ${label} (flat=${res.flat}, selfServiceCount=${res.selfServiceCount})\n` +
      res.items.map((i) => `${i.label} -> ${i.href}`).join("\n") +
      "\n",
  );
}

describe("persona nav sweep", () => {
  it("prints", () => {
    show(
      "HR ADMIN (all caps)",
      resolveHrNav({
        persona: "hr_admin" as never,
        capabilities: ADMIN_CAPS,
        employmentId: "emp-1",
        org: "acme",
        active: { worker_class: "employee" } as never,
      }),
    );
    show(
      "EMPLOYEE (worker_class=employee, has employment)",
      resolveHrNav({
        persona: "employee",
        capabilities: [],
        employmentId: "emp-1",
        org: "acme",
        active: { worker_class: "employee" } as never,
      }),
    );
    show(
      "CONTRACTOR (worker_class=contractor, no leave enrolment)",
      resolveHrNav({
        persona: "employee",
        capabilities: [],
        employmentId: "emp-1",
        org: "acme",
        active: { worker_class: "contractor" } as never,
      }),
    );
    show(
      "MANAGER (working_record.read + time.read only)",
      resolveHrNav({
        persona: "manager" as never,
        capabilities: ["working_record.read", "time.read"],
        employmentId: "emp-1",
        org: "acme",
        active: { worker_class: "employee" } as never,
      }),
    );
    show(
      "NO EMPLOYER (null active, no caps)",
      resolveHrNav({
        persona: null,
        capabilities: [],
        employmentId: null,
        org: null,
        active: null,
      }),
    );
  });
});
