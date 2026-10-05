/**
 * FORCING TEST — FTS-2b item 3. Wave 4b moved the employee profile onto the platform's one
 * custom-fields section and dropped it from the Job tab: a Job-tab field an HR admin added
 * (badge number, union local) vanished from the tab it lives on. Each built-in tab that carried
 * the section before wave 4b ends with it again — ONE mount per tab, below the built-ins
 * (§7.4), bound to the employee and the employee's own organization.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TABS = join(__dirname, "..", "tabs");
const MOUNT = /<MoreSection\s+employeeId=\{profile\.header\.employee_id\}\s+organizationId=\{profile\.organization_id\}/g;

test.each(["JobTab.tsx", "PersonalTab.tsx"])("%s mounts the one custom-fields section once", (file) => {
  const src = readFileSync(join(TABS, file), "utf8");
  expect(src.match(MOUNT)?.length ?? 0).toBe(1);
});

test("the Job tab's section sits after the built-in sections, not between them", () => {
  const src = readFileSync(join(TABS, "JobTab.tsx"), "utf8");
  const section = src.search(MOUNT);
  expect(section).toBeGreaterThan(src.indexOf("<Engagements"));
});
