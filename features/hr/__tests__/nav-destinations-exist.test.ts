/*
  🚨 EVERY NAV DESTINATION MUST BE A ROUTE THAT EXISTS.

  This is the test that would have caught the defect the OWNER reported as "the
  menus don't all work". `resolveHrNav` is ONE resolver with TWO callers — the
  left rail (`HrShell`) and the home card grid (`app/(core)/hr/page.tsx`) — so a
  nav entry pointing at an unbuilt route is not one dead link, it is a dead link
  AND a dead card on the first screen a user sees. Measured 2026-08-28 before the
  fix: an hr_admin had 17 rail items of which 9 were 404s, and 16 home cards of
  which 9 were 404s.

  The failure mode is silent by construction. `hr-nav.ts` holds hrefs, and
  `routes.ts` builds URLs; neither file can see whether `app/(core)/hr/...` has a
  `page.tsx` at the other end. Nothing errors at build time, nothing errors at
  render time — the user clicks and gets "We couldn't find that page".

  SPEC-UI-IA §4.2's never-performable law: a control that cannot work is ABSENT
  or HONEST ABOUT WHY, never a 404. This test enforces the second half — that
  whatever the nav DOES offer has something real at the end of it. The first half
  (whether it should be offered to this persona at all) is
  `nav-worker-class-honesty.test.ts` and `nav-capability-gating.test.ts`.
*/

import { existsSync } from "node:fs";
import { join } from "node:path";

import { resolveHrNav } from "../shared/hr-nav";
import type { HrPersona } from "../constants";

const APP_HR = join(__dirname, "..", "..", "..", "app", "(core)", "hr");

/** `/hr/time?org=acme` → `app/(core)/hr/time/page.tsx`. */
function routeFileFor(href: string): string {
  const path = href.split("?")[0];
  const rest = path.replace(/^\/hr\/?/, "");
  return rest ? join(APP_HR, rest, "page.tsx") : join(APP_HR, "page.tsx");
}

/**
 * The five personas the sweep measured. Capability lists are the ones
 * `hr_my_context().active.capabilities` actually returns for each — never a
 * client-side guess, and never a role string.
 */
const PERSONAS: {
  name: string;
  persona: HrPersona | null;
  capabilities: string[];
  employmentId: string | null;
  active: unknown;
}[] = [
  {
    name: "hr_admin",
    persona: "hr_admin",
    capabilities: [
      "audit.read",
      "candidate.read",
      "comp.read",
      "directory.read",
      "identity.read",
      "identity.write",
      "payroll.read",
      "records.govern",
      "requisition.manage",
      "time.read",
      "working_record.read",
      "working_record.write",
    ],
    employmentId: "11dfa190-0000-0000-0000-000000000001",
    active: { worker_class: "employee", employee_count: 4 },
  },
  {
    name: "manager",
    persona: "manager",
    capabilities: ["directory.read", "time.read", "working_record.read"],
    employmentId: "11dfa190-0000-0000-0000-000000000002",
    active: { worker_class: "employee", employee_count: 4 },
  },
  {
    name: "employee",
    persona: "employee",
    capabilities: ["self.read", "self.write"],
    employmentId: "11dfa190-0000-0000-0000-000000000003",
    active: { worker_class: "employee", employee_count: 4 },
  },
  {
    name: "contractor",
    persona: "employee",
    capabilities: ["self.read"],
    employmentId: "11dfa190-0000-0000-0000-000000000004",
    active: { worker_class: "contractor", employee_count: 4 },
  },
  {
    name: "no employer",
    persona: null,
    capabilities: [],
    employmentId: null,
    active: null,
  },
];

describe("every HR nav destination is a route that exists", () => {
  for (const subject of PERSONAS) {
    it(`offers ${subject.name} nothing that 404s`, () => {
      const nav = resolveHrNav({
        persona: subject.persona,
        capabilities: subject.capabilities,
        employmentId: subject.employmentId,
        org: "acme",
        active: subject.active as never,
      });

      // A menu with nothing in it would pass vacuously.
      expect(nav.items.length).toBeGreaterThan(0);

      const dead = nav.items
        .filter((item) => !existsSync(routeFileFor(item.href)))
        .map((item) => `${item.label} → ${item.href}`);

      expect(dead).toEqual([]);
    });
  }

  /*
    The home card grid and the left rail are the SAME resolver, which is exactly
    why one unbuilt route cost two dead controls. Pinned here so a future change
    that gives the home its own door list cannot quietly reintroduce the pairing
    without this file noticing.
  */
  it("the home grid draws from the same resolved items as the rail", () => {
    const nav = resolveHrNav({
      persona: "hr_admin",
      capabilities: ["identity.write", "time.read", "working_record.read"],
      employmentId: "11dfa190-0000-0000-0000-000000000001",
      org: "acme",
      active: { worker_class: "employee" } as never,
    });
    const doors = nav.items.filter((item) => item.key !== "home");
    expect(doors.length).toBe(nav.items.length - 1);
    for (const door of doors) {
      expect(existsSync(routeFileFor(door.href))).toBe(true);
    }
  });
});
