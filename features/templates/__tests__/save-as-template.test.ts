/**
 * @jest-environment node
 */
// Save as template: a drafted spec (custom.template_from_tables, a real answer captured from live)
// plus the agents that read its tables compiles through @ai-matrx/records' templateDeclaration —
// every binding carried with template-local handles, nothing dropped silently.
import fs from "fs";
import { templateDeclaration } from "@ai-matrx/records/templates";
import { buildTemplateSpec, rowKeyOf, templateBindingOf, type SaveDraft } from "../saveAsTemplate";

const DRAFT_FILE = process.env.SAVE_AS_TEMPLATE_DRAFT;
const TABLE = "e86fdaee-14b9-4a1c-b6c7-08e40a578785";
const RECORD = "7048fd81-5ccf-4dc5-9c49-fe5e4c6b0542";

const draft: SaveDraft = DRAFT_FILE
  ? (JSON.parse(fs.readFileSync(DRAFT_FILE, "utf8")) as SaveDraft)
  : ({ spec: { catalogueId: "ORG-X", tables: [{ token: "company_profile", name: "Company Profile", rows: [{ key: rowKeyOf(RECORD) }] }] } } as SaveDraft);

const agents = [
  {
    id: "agent-1",
    name: "Strengths",
    variables: [
      { name: "company_name", binding: { kind: "merge_field", table_id: TABLE, record_id: RECORD, field_key: "company_name", semantic_type: "value", missing: "absent" } },
      { name: "everything", binding: { kind: "merge_field", table_id: TABLE, semantic_type: "collection", limit: 50 } },
      { name: "elsewhere", binding: { kind: "merge_field", table_id: "other-table", semantic_type: "collection" } },
    ],
  },
];

describe("save as template", () => {
  it("swaps a table id for its token and a record id for its seed row index", () => {
    const tokens = { [TABLE]: "company_profile" };
    expect(templateBindingOf(agents[0]!.variables[0]!.binding, tokens, draft.spec.tables)).toEqual({
      binding: { semantic: "value", table: "company_profile", rowIndex: 0, field: "company_name", missing: "absent" },
    });
    expect(templateBindingOf(agents[0]!.variables[2]!.binding, tokens, draft.spec.tables)).toEqual({ why: "it reads a table outside this template" });
  });

  it("builds a spec whose agents carry their bindings, says what it left out", () => {
    const { spec, left } = buildTemplateSpec(draft, { name: "Our setup", describes: "d", agents, tableNames: { [TABLE]: "Company Profile" } }, "120000");
    expect((spec.agent as { variables: unknown[] }).variables).toHaveLength(2);
    expect(spec.extraAgents).toEqual([]);
    expect(left).toEqual(["Strengths — elsewhere: it reads a table outside this template"]);
    expect(String(spec.catalogueId)).toMatch(/-120000$/);
  });

  (DRAFT_FILE ? it : it.skip)("a real draft compiles to a declaration with a card and a plan", () => {
    const { spec } = buildTemplateSpec(draft, { name: "Our setup", describes: "d", agents: agents.map((a) => ({ ...a, variables: a.variables.slice(0, 2) })), tableNames: { [TABLE]: "Company Profile" } }, "120000");
    const d = templateDeclaration(spec as never, "org-1") as unknown as { card: { name: string; footprint: { line: string } }; installPlan: { steps: unknown[] } };
    expect(d.card.name).toBe("Our setup");
    expect(d.card.footprint.line).toMatch(/^1 table · .*1 agent$/);
    expect(d.card.footprint.line).not.toMatch(/(^| )0 /);
    expect(d.installPlan.steps.length).toBeGreaterThan(0);
  });
});
