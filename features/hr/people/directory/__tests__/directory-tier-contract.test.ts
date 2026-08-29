// features/hr/people/directory/__tests__/directory-tier-contract.test.ts
//
// 🚨 THE DIRECTORY NARROWS AT THE DOOR, AND THIS FILE ONLY GUARDS THE SECOND HALF.
//
// `hr_directory_list` resolved a persona on every call and then narrowed NOTHING with
// it: measured live through PostgREST with four real minted sessions, a contractor
// holding an EMPTY capability set received the SAME 24 fields as the employer's HR
// owner — `fte`, `flsa_status`, `worker_class`, `schedule_class`, `hire_date`,
// `employment_id`, `row_basis` — and could ASK for the three not-yet-started hires
// with their start dates, and for the three former employees. `hr_l1_64` removes
// those keys from the payload and refuses those filters.
//
// The client half exists so nothing renders a header over data that is no longer on
// the wire. It is NOT the security boundary: hiding a column cannot unsend a payload,
// and a test that only checked the client would pass over a door that still leaks.
// The DOOR's own guarantee is pinned in `hr.function_contract`
// (home `hr_l1_64_the_directory_narrows_to_the_viewer.sql`), which reddens the
// blocking conformance check if a later lane re-emits the body without the narrowing.
//
// 🚨 IF THIS TEST FAILS, DO NOT DELETE THE GATE TO GET GREEN. Every assertion here
// corresponds to a field a colleague may not have, or to a filter that discloses a
// population. Take it back to the register.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (relative: string) =>
  readFileSync(join(process.cwd(), relative), "utf8");

const columns = read("features/hr/people/directory/directoryColumns.tsx");
const surface = read("features/hr/people/directory/HrDirectory.tsx");
const types = read("features/hr/types.ts");
const migration = read(
  "migrations/hr_l1_64_the_directory_narrows_to_the_viewer.sql",
);

/** Source with comments stripped — the question is what the CODE does. */
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The seven `hr.employment` / `hr.position_assignment` keys, §3.2's `—` for an org member. */
const WORKING_RECORD_FIELDS = [
  "employment_id",
  "worker_class",
  "flsa_status",
  "schedule_class",
  "fte",
  "hire_date",
  "row_basis",
] as const;

describe("the door strips the working-record fields (SPEC-ACCESS §3.1/§3.2)", () => {
  it("names every one of the seven in the migration's strip list", () => {
    const strip = migration.slice(
      migration.indexOf("v_strip := case"),
      migration.indexOf("-- ONE query"),
    );
    expect(strip).toContain("'directory'");
    for (const field of WORKING_RECORD_FIELDS) {
      expect(strip).toContain(`'${field}'`);
    }
  });

  it("removes the keys rather than nulling them — absent, never masked", () => {
    // `jsonb - text[]` deletes the keys. A `case when … then null end` projection
    // would keep the key present and holding null, which announces that the field
    // exists and that this viewer is not getting it.
    expect(migration).toContain("(to_jsonb(r) - 'rn') - v_strip");
  });

  it("resolves the tier from a CAPABILITY, never from the persona string", () => {
    // `_l1_persona` answers `hr_admin` only for identity.write / working_record.write,
    // so an employee_relations investigator and a leave_administrator both come back
    // `employee` — and five live pickers read `employment_id` off these rows. A
    // persona test would have silently emptied every one of them.
    expect(migration).toContain("'working_record.read' = any(v_caps)");
  });
});

describe("the withheld statuses are refused, and All means all-you-may-see", () => {
  it("refuses a status outside the viewer's allowed set", () => {
    expect(migration).toContain("status filter is not yours in this directory");
  });

  it("refuses the worker-class filter below the working-record tier", () => {
    // Otherwise the filter is a per-person probe for the answer the stripped
    // `worker_class` column no longer gives.
    expect(migration).toContain(
      "worker-class filter is not yours in this directory",
    );
  });

  it("resolves `all` to the allowed set, not to the default set", () => {
    expect(migration).toContain("'all' = any(v_requested)");
    expect(migration).toContain("v_statuses := v_allowed;");
  });

  it("keeps the no-filter default distinct from All (route 10 excludes terminated)", () => {
    const defaults = migration.slice(
      migration.indexOf("v_default := case"),
      migration.indexOf("select coalesce(array_agg(value"),
    );
    expect(defaults).toContain("'active','on_leave','prehire'");
    expect(defaults).not.toContain("'terminated'");
  });
});

describe("nothing renders a field the payload no longer carries", () => {
  const code = codeOnly(columns);

  it("gates the worker-class COLUMN on what the door published", () => {
    expect(code).toContain("if (publishes.worker_class)");
  });

  it("gates the start-date column on what the door published", () => {
    expect(code).toContain("if (publishes.hire_date)");
  });

  it("builds the status options from the viewer's allowed set", () => {
    // A literal `HR_DIRECTORY_STATUSES.map(...)` option list would offer `prehire`
    // and `terminated` to a viewer whose door refuses them — and the option itself
    // discloses that a category of people exists which this viewer may not see.
    expect(code).toContain("hrStatusOptions(allowedStatuses)");
    expect(code).not.toMatch(/HR_DIRECTORY_STATUSES\.map\(/);
  });

  it("offers an explicit All rather than leaving the cleared state to mean it", () => {
    expect(code).toContain("ALL_STATUSES_OPTION");
  });

  it("defaults every publish flag to FALSE before the door has answered", () => {
    const fallback = codeOnly(surface).slice(
      codeOnly(surface).indexOf("const publishes = page?.columns ??"),
    );
    for (const flag of [
      "hire_date",
      "manager",
      "worker_class",
      "employment_detail",
    ]) {
      expect(fallback.slice(0, 260)).toContain(`${flag}: false`);
    }
  });
});

describe("the wire type says the fields can be absent", () => {
  const row = types.slice(
    types.indexOf("export type HrDirectoryRow = {"),
    types.indexOf("export type HrDirectoryPage = {"),
  );

  it.each(WORKING_RECORD_FIELDS)(
    "`%s` is optional, so `undefined` is type-visible to every caller",
    (field) => {
      expect(row).toMatch(new RegExp(`\\b${field}\\?:`));
    },
  );

  it("publishes the per-viewer column map and status vocabulary", () => {
    const page = types.slice(types.indexOf("export type HrDirectoryPage = {"));
    for (const key of ["worker_class", "employment_detail"]) {
      expect(page.slice(0, 1800)).toContain(key);
    }
    expect(page).toContain("statuses: { allowed:");
  });
});

describe("no consumer treats an absent field as present", () => {
  // `undefined !== null` is `true`. Every guard on a field the door may omit has to
  // be `!= null`, or an absent field reads as a present one exactly for the viewers
  // the narrowing was written for.
  const consumers = [
    "features/hr/leave/policies/LeaveEnrollmentSurface.tsx",
    "features/hr/time/clock/EmployeeSearchSelect.tsx",
    "features/hr/leave/manager/LeaveDecisionDialogs.tsx",
  ];

  it.each(consumers)("%s guards with != null", (relative) => {
    const code = codeOnly(read(relative));
    for (const field of WORKING_RECORD_FIELDS) {
      expect(code).not.toContain(`${field} !== null`);
    }
  });
});
