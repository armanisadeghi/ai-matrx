import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isFullUuid } from "@/utils/supabase-search";

const employeePages = [
  "app/(core)/hr/people/[employeeId]/page.tsx",
  "app/(core)/hr/people/[employeeId]/[tab]/page.tsx",
  "app/(core)/hr/people/[employeeId]/c/[tabKey]/page.tsx",
] as const;

describe("employee profile route identifiers", () => {
  it("rejects malformed employee ids before PostgREST can parse them", () => {
    expect(isFullUuid("not-a-uuid")).toBe(false);
    expect(isFullUuid("zzz-throwaway-surface-test-org")).toBe(false);
    expect(isFullUuid("20149d3f-6572-4263-b43c-7e52f0e42058")).toBe(true);
  });

  it.each(employeePages)("guards %s before mounting the profile reader", (relative) => {
    const source = readFileSync(join(process.cwd(), relative), "utf8");
    const guard = source.indexOf("if (!isFullUuid(employeeId)) notFound();");
    const render = source.indexOf("<EmployeeProfile", guard);

    expect(guard).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(guard);
  });
});
