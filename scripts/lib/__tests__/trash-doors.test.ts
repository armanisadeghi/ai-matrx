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
describe("a trigger is never a Trash listing door (lane STORE-RESTORE-DOORS)", () => {
  const trigger = "CREATE OR REPLACE FUNCTION docproc.trash_the_whole_source()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $f$ begin update docproc.processed_documents set deleted_at = now(); return null; end $f$";
  test("GREEN: a cascade trigger named like Trash is not judged as a listing", () => {
    expect(judgeTrashDoorBody({ door: "docproc.trash_the_whole_source", body: trigger })).toEqual([]);
  });
  test("RED: the same body returning rows is still judged (it never reads auth.uid())", () => {
    const lister = trigger.replace("RETURNS trigger", "RETURNS TABLE(id uuid)");
    expect(judgeTrashDoorBody({ door: "docproc.trash_the_whole_source", body: lister }).length).toBeGreaterThan(0);
  });
});

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
        { thing: "store:work_approval", covered: false },
        { thing: "entity:record", covered: false },
      ]),
    ).toEqual([]);
  });

  test("RED: an exemption for a thing Trash now covers is stale and fails (the list only shrinks)", () => {
    const found = judgeTrashCoverage([{ thing: "entity:hr_leave_policy", covered: true }]);
    expect(found).toHaveLength(1);
    expect(found[0]!.problem).toContain("stale");
  });

  // lane TRASH-COVERAGE-2: the 31 kinds that became Trash kinds may never be excused again — if one
  // loses its Trash kind the coverage pass fails (RED), and with its kind it passes (GREEN).
  const TRASH_COVERAGE_2_KINDS = [
    "rulebook", "folder", "war_room", "thread", "scope_type", "scope", "context_item",
    "working_document", "user_memory", "wbx_highlight", "browser_profile", "media_source_library",
    "learn_doc", "seo_topical_map", "seo_rank_target", "hr_employee", "hr_employment",
    "hr_jurisdiction_rule_org_decision", "crm_blocklist_entry", "commerce_intake_batch",
    "interview_decision_interview", "workflow_runtime_surface", "workflow_trigger",
    "product_capture_item", "category", "flexible_data", "shared_canvas_item", "sch_task",
    "user_feedback", "agent_mandate_note", "processed_document",
  ].map((k) => `entity:${k}`);

  test("RED: any TRASH-COVERAGE-2 kind that is not findable in Trash fails — none is excused", () => {
    for (const thing of TRASH_COVERAGE_2_KINDS) expect(TRASH_COVERAGE_EXEMPT[thing]).toBeUndefined();
    const found = judgeTrashCoverage(TRASH_COVERAGE_2_KINDS.map((thing) => ({ thing, covered: false })));
    expect(found.map((f) => f.door)).toEqual(TRASH_COVERAGE_2_KINDS);
  });

  test("GREEN: the TRASH-COVERAGE-2 kinds pass once each is findable in Trash", () => {
    expect(judgeTrashCoverage(TRASH_COVERAGE_2_KINDS.map((thing) => ({ thing, covered: true })))).toEqual([]);
  });

  // lane STORE-RESTORE-DOORS: the five STORE GAPs are Trash kinds now — never excused again.
  const STORE_CHILDREN = ["field", "rule", "relation", "doc_template", "dashboard"];
  test("RED: a removed Field, Rule, link, template or dashboard that no Trash lists fails — none is excused", () => {
    for (const k of STORE_CHILDREN) expect(TRASH_COVERAGE_EXEMPT[`store:${k}`]).toBeUndefined();
    const found = judgeTrashCoverage(STORE_CHILDREN.map((k) => ({ thing: `store:${k}`, covered: false })));
    expect(found.map((f) => f.door)).toEqual(STORE_CHILDREN.map((k) => `store:${k}`));
  });

  test("GREEN: the five store kinds pass once each is findable in personal and Organization Trash", () => {
    expect(
      judgeTrashCoverage(STORE_CHILDREN.map((k) => ({ thing: `store:${k}`, covered: true, orgCovered: true }))),
    ).toEqual([]);
  });

  // lane STORE-RESTORE-DOORS: the blind spot. TRASH-COVERAGE-2 found Organization Trash silently skipping
  // every kind whose table has no visibility column (sandboxes, scope types, feedback) while personal
  // Trash listed them; a coverage pass that asked personal Trash alone stayed green over it.
  test("RED: a thing in its owner's personal Trash but missing from its organization's Trash fails", () => {
    const found = judgeTrashCoverage([{ thing: "entity:sandbox_instance", covered: true, orgCovered: false }]);
    expect(found).toHaveLength(1);
    expect(found[0]!.door).toBe("entity:sandbox_instance");
    expect(found[0]!.problem).toContain("not in its organization's Trash");
  });

  test("GREEN: a thing with no organization to ask (orgCovered undefined) is judged on personal Trash", () => {
    expect(judgeTrashCoverage([{ thing: "entity:credential_item", covered: true }])).toEqual([]);
    expect(judgeTrashCoverage([{ thing: "entity:sandbox_instance", covered: true, orgCovered: true }])).toEqual([]);
  });

  test("the store's Trash kinds are Table, Record and the five removed-on-their-own kinds, never exempted", () => {
    expect(STORE_TRASH_KINDS).toEqual({
      table: "table", record: "record", field: "field", rule: "rule", relation: "relation",
      doc_template: "doc_template", dashboard: "dashboard",
    });
    for (const k of Object.keys(STORE_TRASH_KINDS)) expect(TRASH_COVERAGE_EXEMPT[`store:${k}`]).toBeUndefined();
    for (const why of Object.values(TRASH_COVERAGE_EXEMPT)) expect(why.length).toBeGreaterThan(40);
  });
});
