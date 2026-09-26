/**
 * Lane TRASH-2 — the Trash listing lint and the timing judgement, proven RED then GREEN.
 *
 * RED: the pre-TRASH-2 bodies of public.trash_list / public.trash_counts (the inverse file carries
 * them byte for byte, captured live 2026-09-25) — a per-row iam.has_access over every archived row
 * in every organization the caller belongs to. GREEN: the bodies the campaign file installs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isTrashListingDoorName,
  judgeTrashCoverage,
  judgeTrashDoorBody,
  judgeTrashTimings,
  STORE_TRASH_KINDS,
  TRASH_COVERAGE_EXEMPT,
} from "../trash-doors";

const ROOT = resolve(__dirname, "..", "..", "..");
const UP = readFileSync(
  resolve(ROOT, "migrations/campaign/trash2_personal_trash_is_yours_and_the_organization_has_its_own.sql"),
  "utf8",
);
const DOWN = readFileSync(
  resolve(ROOT, "migrations/inverse/trash2_personal_trash_is_yours_and_the_organization_has_its_own_down.sql"),
  "utf8",
);

/** The whole CREATE FUNCTION statement for `name`, from its header to the closing `$function$;`. */
function body(sql: string, name: string): string {
  const start = sql.search(new RegExp(`create or replace function ${name.replace(".", "\\.")}\\(`, "i"));
  if (start < 0) throw new Error(`${name} not found`);
  const end = sql.indexOf("$function$;", sql.indexOf("$function$", start) + 10);
  return sql.slice(start, end + "$function$;".length);
}

describe("Trash listing lint (judgeTrashDoorBody)", () => {
  test.each(["public.trash_list", "public.trash_counts"])(
    "RED on the pre-TRASH-2 %s: a per-row access check over every organization's archived rows",
    (door) => {
      const problems = judgeTrashDoorBody({ door, body: body(DOWN, door) }).map((f) => f.problem);
      expect(problems.some((p) => p.includes("per-row access question"))).toBe(true);
      expect(problems.some((p) => p.includes("every organization"))).toBe(true);
    },
  );

  test.each([
    "public.trash_list",
    "public.trash_counts",
    "public._trash_kind_rows",
    "public._trash_kind_counts",
    "public.org_trash_list",
    "public.org_trash_counts",
  ])("GREEN on the TRASH-2 %s", (door) => {
    expect(judgeTrashDoorBody({ door, body: body(UP, door) })).toEqual([]);
  });

  test("an Organization Trash door that skips the owner/admin gate is refused", () => {
    const ungated = body(UP, "public.org_trash_counts").replace(/public\._org_trash_gate\(p_organization_id\)/, "(select auth.uid())");
    expect(judgeTrashDoorBody({ door: "public.org_trash_counts", body: ungated }).map((f) => f.problem))
      .toEqual([expect.stringContaining("_org_trash_gate")]);
  });

  test("an organization-wide grant is not a named grant", () => {
    const widened = body(UP, "public._trash_kind_rows").replace(
      "where g.granted_to_user_id = $1",
      "where (g.granted_to_user_id = $1 or g.granted_to_organization_id is not null)",
    );
    expect(judgeTrashDoorBody({ door: "public._trash_kind_rows", body: widened }).map((f) => f.problem))
      .toEqual([expect.stringContaining("organization-wide grant")]);
  });

  test("restore and gate functions are not listing doors", () => {
    expect(isTrashListingDoorName("public.org_trash_restore")).toBe(false);
    expect(isTrashListingDoorName("public._org_trash_gate")).toBe(false);
    expect(isTrashListingDoorName("public.trash_list")).toBe(true);
    expect(isTrashListingDoorName("rag.fn_list_library_trash")).toBe(true);
  });
});

describe("Trash timing judgement (judgeTrashTimings)", () => {
  test("RED on the measured pre-TRASH-2 production timings (file kind cancelled, counts cancelled)", () => {
    const findings = judgeTrashTimings([
      { label: "trash_list file (admin@admin.com)", class: "kind", ms: null, error: "canceling statement due to statement timeout" },
      { label: "trash_counts (admin@admin.com)", class: "counts", ms: null, error: "canceling statement due to statement timeout" },
      { label: "trash_list file (test@test.com)", class: "kind", ms: 3049.2 },
      { label: "trash_counts (test@test.com)", class: "counts", ms: 3333.0 },
    ]);
    expect(findings).toHaveLength(4);
  });

  test("GREEN on the measured post-TRASH-2 production timings", () => {
    expect(judgeTrashTimings([
      { label: "trash_list file (admin@admin.com)", class: "kind", ms: 1.8 },
      { label: "trash_counts (admin@admin.com)", class: "counts", ms: 57.2 },
      { label: "org_trash_list merged page (AI Matrx)", class: "kind", ms: 21.8 },
    ])).toEqual([]);
  });

  test("the ceilings are exactly 300 ms per kind and 2 s for counts", () => {
    expect(judgeTrashTimings([{ label: "k", class: "kind", ms: 300 }])).toEqual([]);
    expect(judgeTrashTimings([{ label: "k", class: "kind", ms: 300.1 }])).toHaveLength(1);
    expect(judgeTrashTimings([{ label: "c", class: "counts", ms: 2000 }])).toEqual([]);
    expect(judgeTrashTimings([{ label: "c", class: "counts", ms: 2000.1 }])).toHaveLength(1);
  });
});


/**
 * Lane TRASH-TABLES — the coverage judgement. The live pass (pnpm check:trash-doors) was RED on the
 * dev clone under the inverse (store:table, store:record, entity:platform_saved_view not in Trash)
 * and GREEN after the up; these cases pin the judgement itself.
 */
describe("Trash coverage (judgeTrashCoverage)", () => {
  test("RED: an archived data Table that no Trash lists fails, by name (VERIFIER-25 item 11)", () => {
    const found = judgeTrashCoverage([{ thing: "store:table", covered: false, detail: "not in its owner's Trash" }], {});
    expect(found).toHaveLength(1);
    expect(found[0]!.door).toBe("store:table");
    expect(found[0]!.problem).toContain("not in Trash");
  });

  test("RED: a brand-new soft-deletable Entity with archived rows and no Trash kind fails", () => {
    const found = judgeTrashCoverage([{ thing: "entity:brand_new_kind", covered: false }]);
    expect(found.map((f) => f.door)).toEqual(["entity:brand_new_kind"]);
  });

  test("GREEN: covered things and reasoned exemptions pass", () => {
    expect(
      judgeTrashCoverage([
        { thing: "store:table", covered: true },
        { thing: "store:record", covered: true },
        { thing: "store:field", covered: false },
        { thing: "entity:record", covered: false },
      ]),
    ).toEqual([]);
  });

  test("RED: an exemption for a thing Trash now covers is stale and fails (the list only shrinks)", () => {
    const found = judgeTrashCoverage([{ thing: "entity:rulebook", covered: true }]);
    expect(found).toHaveLength(1);
    expect(found[0]!.problem).toContain("stale");
  });

  test("the store's Trash kinds are exactly Table and Record, and never exempted", () => {
    expect(STORE_TRASH_KINDS).toEqual({ table: "table", record: "record" });
    expect(TRASH_COVERAGE_EXEMPT["store:table"]).toBeUndefined();
    expect(TRASH_COVERAGE_EXEMPT["store:record"]).toBeUndefined();
    for (const why of Object.values(TRASH_COVERAGE_EXEMPT)) expect(why.length).toBeGreaterThan(40);
  });
});
