/*
  🚨 THE HINT MUST NOT HOLD AN OPINION THE DOOR DOES NOT SHARE.

  `HR_SELF_SERVICE_DEFAULTS` was hand-kept and disagreed with `hr_self_update` FOUR
  separate times. Every one failed SILENTLY — a hint STRICTER than the boundary
  renders a padlock over a capability nobody can reach, and the server is never
  asked, so nothing errors and no one finds out:

    1. legal names   — said `hr_only`; the door accepts a request_approval request
    2. work_phone    — said `hr_only`; the door applies it freely (self_free)
    3. work_permit_type — never a column at all; it is `work_authorization_kind`
    4. worker_class  — said `hr_only`; it is not on the employee record. It lives on
                       the position assignment, and the door says so in words:
                       "Worker class is not a field on your record."

  The table is now GENERATED from the same two sources the door reads — the catalog
  for existence, `hr.field_policy` for policy. These cases are pinned here because a
  regression would be invisible again: nothing throws, a control just quietly stops
  being offered or starts being offered wrongly.

  This is a source-contract test in this directory's idiom — it reads the generated
  file rather than the database, so it runs offline and still catches a hand edit.
*/

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  selfServicePolicyFor,
  resolveSelfServicePolicy,
} from "../me/selfServicePolicy";

const generated = readFileSync(
  join(process.cwd(), "features/hr/me/selfServicePolicy.generated.ts"),
  "utf8",
);

describe("the self-service hint agrees with the door", () => {
  it("is generated, and says so", () => {
    expect(generated).toContain("GENERATED FILE — DO NOT EDIT BY HAND");
    expect(generated).toContain("scripts/hr/generate_self_service_policy.py");
    // Keyed by TOKEN. A flat column-name map is what made worker_class look like a
    // field of the employee record.
    expect(generated).toMatch(/hr_employee:\s*\{/);
    expect(generated).toMatch(/hr_employee_private:\s*\{/);
    expect(generated).toMatch(/hr_emergency_contact:\s*\{/);
  });

  it("answers null for a column that is not on the token's table (drift #4)", () => {
    // The door: "Worker class is not a field on your record."
    expect(selfServicePolicyFor("hr_employee", "worker_class")).toBeNull();
    // ...and these are on other tables too, so the employee record has no opinion.
    expect(selfServicePolicyFor("hr_employee", "hire_date")).toBeNull();
    expect(selfServicePolicyFor("hr_employee", "flsa_status")).toBeNull();
  });

  it("keeps null distinct from hr_only — they are different answers", () => {
    // Real column, held by HR → read-only with "contact HR".
    expect(selfServicePolicyFor("hr_employee", "employee_number")).toBe("hr_only");
    // Not a column here at all → the surface renders nothing.
    expect(selfServicePolicyFor("hr_employee", "worker_class")).toBeNull();
  });

  it("matches the door on the three earlier disagreements", () => {
    // 1 — legal names are request_approval, not hr_only.
    expect(selfServicePolicyFor("hr_employee", "legal_first_name")).toBe("request_approval");
    expect(selfServicePolicyFor("hr_employee", "legal_last_name")).toBe("request_approval");
    // 2 — work_phone is free.
    expect(selfServicePolicyFor("hr_employee", "work_phone")).toBe("free");
    // 3 — the real column name, and the invented one.
    expect(selfServicePolicyFor("hr_employee_private", "work_authorization_kind")).toBe(
      "request_approval",
    );
    expect(selfServicePolicyFor("hr_employee_private", "work_permit_type")).toBeNull();
  });

  it("puts the confidential fields on the private token, not the employee one", () => {
    // The seam that could never have saved: these are keyed under hr_employee_private.
    expect(selfServicePolicyFor("hr_employee_private", "personal_email")).toBe("free");
    expect(selfServicePolicyFor("hr_employee", "personal_email")).toBeNull();
  });

  it("holds the address law above whatever the table says", () => {
    // An org override to `free` is refused by the server's validation predicate, so
    // the client refuses to offer it in either direction.
    expect(selfServicePolicyFor("hr_employee_private", "home_address")).toBe("request_approval");
    expect(resolveSelfServicePolicy("hr_employee_private", "home_address", {
      home_address: "free",
    })).toBe("request_approval");
  });

  it("fails closed for an unknown pair through the resolver", () => {
    expect(resolveSelfServicePolicy("hr_employee", "zzz_not_a_column")).toBe("hr_only");
  });
});
