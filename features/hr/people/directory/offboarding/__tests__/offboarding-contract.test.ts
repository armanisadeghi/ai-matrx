import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  HR_SEPARATION_CATEGORIES,
  HR_SEPARATION_CATEGORY_LABELS,
  HR_SEPARATION_INITIATORS,
  HR_SEPARATION_INITIATOR_LABELS,
} from "../types";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("HR offboarding — separation contract", () => {
  // 🚨 The two closed vocabularies must match hr.separation's live CHECK constraints
  // (measured 2026-08-29). A list that disagrees with the door silently breaks every
  // submission carrying the wrong value — the failure the verification-kinds list shipped once.
  test("separation_category vocabulary matches the CHECK", () => {
    expect([...HR_SEPARATION_CATEGORIES].sort()).toEqual([
      "involuntary",
      "other",
      "voluntary",
    ]);
    for (const c of HR_SEPARATION_CATEGORIES) {
      expect(HR_SEPARATION_CATEGORY_LABELS[c]).toBeTruthy();
    }
  });

  test("initiator vocabulary matches the CHECK", () => {
    expect([...HR_SEPARATION_INITIATORS].sort()).toEqual([
      "employee",
      "employer",
      "mutual",
      "third_party",
    ]);
    for (const i of HR_SEPARATION_INITIATORS) {
      expect(HR_SEPARATION_INITIATOR_LABELS[i]).toBeTruthy();
    }
  });

  // 🚨 recordHrSeparation must MAP field-by-field to the door's keys, not forward an untyped
  // bag. An `unknown` payload lets a misnamed key sail through as a no-op the door never sees
  // (the cast-at-a-seam class that silently dropped every verification-request field once).
  test("recordHrSeparation is typed and maps to the door's payload keys", () => {
    const svc = source("features/hr/service.ts");
    // Typed args object, not Record<string, unknown>.
    expect(svc).toContain("export function recordHrSeparation(args: {");
    expect(svc).not.toMatch(
      /recordHrSeparation\(\s*payload:\s*Record<string, unknown>/,
    );
    // Every key the door reads is written explicitly on the p_payload it posts.
    expect(svc).toContain('"hr_separation_record"');
    for (const key of [
      "employment_id: args.employmentId",
      "separation_category: args.separationCategory",
      "reason_category_id: args.reasonCategoryId",
      "initiator: args.initiator",
      "last_day_worked: args.lastDayWorked",
      "termination_date: args.terminationDate",
      "rehire_eligible: args.rehireEligible",
    ]) {
      expect(svc).toContain(key);
    }
  });

  test("the offboarding verb is wired to the dialog, not a coming-soon stub", () => {
    const menu = source(
      "features/hr/people/directory/useHrEmployeeMenu.tsx",
    );
    // The stub call is gone from the offboarding item.
    expect(menu).not.toContain(
      'announceComingSoon("hr.people.start-offboarding")',
    );
    // The verb hands the subject up to the parent-hosted dialog.
    expect(menu).toContain("onStartOffboarding?.(subject)");

    // And the coming-soon registry no longer declares the id (no dead path).
    const registry = source("lib/coming-soon/registry.ts");
    expect(registry).not.toContain('"hr.people.start-offboarding": {');
  });
});
