// features/hr/__tests__/no-type-only-components.test.ts
//
// 🚨 A COMPONENT NOBODY RENDERS IS NOT SHIPPED, AND THIS LANE HAS NOW LEARNED THAT
// THREE TIMES.
//
//   1. `SelfServiceToggle` — the directory opt-out had no control at all, so nothing
//      in the product could set a field whose whole point was that the person owns it.
//   2. `PartyEmployeeCard` — reported as "does not exist"; it existed, mounted, and
//      the grep that looked for it searched the wrong directory.
//   3. `SelfServiceField` — imported ONLY as a type while `hr_self_update` ("THE ONLY
//      DOOR") and `useSelfUpdate` sat complete behind it, leaving `/hr/me` a read-only
//      mirror of a record its owner could not touch.
//
// Every one of those passed type-check, lint and review. A `.tsx` file exporting a
// component that no other module imports as a VALUE compiles perfectly — the failure
// is invisible until somebody opens the page and finds nothing there.
//
// So this test asks the one question the compiler cannot: is each component in this
// lane actually reachable? It is deliberately cheap and deliberately blunt — a grep,
// not a render — because the defect it catches is a grep-shaped defect.
//
// 🚨 IF THIS FAILS, DO NOT ADD THE FILE TO THE ALLOW-LIST TO GO GREEN. Either wire the
// component to a surface, or delete it. An allow-list entry is a promise that the
// absence is deliberate, and each one below carries the reason it is.

import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const HR_ROOT = join(process.cwd(), "features/hr");

/**
 * Files that legitimately export no rendered component.
 *
 * Each entry needs a REASON, because "it is on the list" is not one.
 */
const ALLOWED: Record<string, string> = {
  // Route-level surfaces are imported by `app/**` page files, which live outside
  // features/hr and are therefore invisible to this sweep.
  "HrPeopleShell.tsx": "mounted by app/(core)/hr/people/layout.tsx",
  "MyInfoSurface.tsx": "mounted by app/(core)/hr/me/page.tsx",
  "MyPaySurface.tsx": "mounted by app/(core)/hr/me/pay/page.tsx",
  "MeSurfaceShell.tsx": "mounted by the /hr/me/* route shells",
  "HrOrgChart.tsx": "mounted by app/(core)/hr/people/org-chart/page.tsx",
  "HrDirectory.tsx": "mounted by app/(core)/hr/people/page.tsx",
  "HrActivationWizard.tsx": "mounted by app/(core)/hr/settings/page.tsx",
  "HrNewEmployee.tsx": "mounted by app/(core)/hr/people/new/page.tsx",
  "EmployeeProfile.tsx": "mounted by the /hr/people/[employeeId] routes",
};

function tsxFilesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFilesUnder(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Does any module reference this name as a VALUE?
 *
 * 🚨 THE NAME IS SEARCHED BARE, NOT AS `import ... Name`, because a multi-line
 * import puts the name on its own line and `grep` is line-based. The first version
 * of this test required both words on one line and immediately produced a FALSE
 * POSITIVE on `MemberEmployeeSeam`, which is imported — over three lines — and
 * rendered. A guard against invisible defects that invents its own is worse than no
 * guard, so it matches any non-type, non-comment mention outside the file itself.
 */
function importedAsValue(name: string, ownPath: string): boolean {
  let hits: string;
  try {
    hits = execSync(
      `grep -rn --include=*.tsx --include=*.ts -w "${name}" features app 2>/dev/null || true`,
      { encoding: "utf8", cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024 },
    );
  } catch {
    return true; // never fail the suite on a grep problem
  }
  return hits
    .split("\n")
    .filter(Boolean)
    .filter((line) => !line.startsWith(ownPath))
    .some((line) => {
      const text = line.slice(line.indexOf(":", line.indexOf(":") + 1) + 1);
      if (/import\s+type\b/.test(text)) return false;
      // a mention inside a comment is documentation, not a call site
      if (/^\s*(\/\/|\*|\/\*)/.test(text)) return false;
      return true;
    });
}

describe("features/hr — every component is reachable", () => {
  it("has no component imported only as a type", () => {
    const orphans: string[] = [];

    for (const file of tsxFilesUnder(HR_ROOT)) {
      const base = file.split("/").pop() as string;
      if (ALLOWED[base]) continue;

      const name = base.replace(/\.tsx$/, "");
      const relative = file.replace(`${process.cwd()}/`, "");
      // Only judge files that actually export something by their own name.
      const exportsSelf = execSync(
        `grep -cE "export (default )?(function|const) ${name}\\b" "${file}" || true`,
        { encoding: "utf8" },
      ).trim();
      if (exportsSelf === "0") continue;

      if (!importedAsValue(name, relative)) orphans.push(relative);
    }

    expect(orphans).toEqual([]);
  });
});
