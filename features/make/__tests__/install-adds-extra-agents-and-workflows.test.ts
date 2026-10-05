// features/make/__tests__/install-adds-extra-agents-and-workflows.test.ts
//
// THE USE CASE (Kits → Template merge, 2026-10-04). A member installs a template that came from a kit:
// three agents read one company-profile row, field by field, and a workflow runs one of them. The
// install door answers a `host` block; the gallery must copy every agent with its merge-field bindings
// resolved to the rows the install made, create the workflow with its placeholders resolved, record
// each on the install, and — on a re-open — make nothing twice.
//
// BREAKS THIS CATCHES: an extra agent never copied · a binding written without its record id · a row
// pointer resolved to the wrong row · a workflow created with a raw {{agent:…}} · a workflow not
// recorded (kind 'workflow') · a re-open copying again.

jest.mock("@/features/templates/agentCopyHost", () => ({ templateAgentCopier: jest.fn(), templateAgentArchiver: jest.fn() }));

import { addInstalledAgent, hostStepsPending, type InstallAnswer } from "../gallery/installAgent";

const ANSWER: InstallAnswer = {
  install_id: "inst-1",
  state: "installed",
  done: true,
  made: [{ kind: "table", id: "tbl-1", ref: "tables.company_profile", title: "Company profile", table_id: null }],
  agent: {
    platform_agent: { id: "plat-1", name: "Endowment Portfolio Builder" },
    name: "Portfolio builder",
    copied: false,
    bindings: [
      {
        variable: "company_name",
        tableToken: "company_profile",
        describes: "the name",
        table_id: "tbl-1",
        binding: { semantic: "value", table: "company_profile", rowKey: "r1", field: "company_name" },
      },
    ],
  },
  host: {
    ids: { "tables.company_profile": "tbl-1", "row.company_profile.r1": "rec-1" },
    extra_agents: [
      {
        key: "org_chart",
        platformAgent: { id: "plat-2", name: "Org Chart Creator" },
        name: "Org chart",
        bindings: [{ variable: "employee_info", describes: "the team", binding: { semantic: "value", table: "company_profile", rowKey: "r1", field: "team" } }],
      },
    ],
    workflows: [{ key: "weekly", name: "Weekly chart", description: "d", definition: { nodes: [{ agent: "{{agent:org_chart}}", table: "{{table:company_profile}}", first: "{{agent:agent}}" }] } }],
  },
};

function ports() {
  let made = [...(ANSWER.made ?? [])];
  const note = jest.fn(async (_i: string, id: string, label: string, kind?: "workflow") => {
    made = [...made, { kind: kind ?? "agent", id, ref: kind ?? "agent", title: label, table_id: null }];
    return { ...ANSWER, made } as InstallAnswer;
  });
  const copier = jest.fn().mockResolvedValueOnce({ agentId: "agent-1" });
  const extraCopier = jest.fn().mockResolvedValueOnce({ agentId: "agent-2" });
  const createWorkflow = jest.fn().mockResolvedValue("wf-1");
  return { note, copier, extraCopier, createWorkflow };
}

describe("a template install adds its extra agents and workflows", () => {
  it("copies every agent with resolved bindings, creates the workflow resolved, and records each", async () => {
    const p = ports();
    expect(hostStepsPending(ANSWER)).toBe(true);
    const r = await addInstalledAgent(ANSWER, "org-1", p);
    expect(r.ok).toBe(true);

    expect(p.copier.mock.calls[0][0].bindings[0].binding).toEqual({
      kind: "merge_field",
      source: "record",
      semantic_type: "value",
      field_key: "company_name",
      table_id: "tbl-1",
      record_id: "rec-1",
      missing: "absent",
      override_policy: "shown_locked",
    });
    expect(p.extraCopier.mock.calls[0][0]).toMatchObject({ platformAgentId: "plat-2", name: "Org chart" });
    expect(p.extraCopier.mock.calls[0][0].bindings[0].binding).toMatchObject({ field_key: "team", record_id: "rec-1", table_id: "tbl-1" });

    expect(p.createWorkflow).toHaveBeenCalledWith("org-1", {
      name: "Weekly chart",
      description: "d",
      definition: { nodes: [{ agent: "agent-2", table: "tbl-1", first: "agent-1" }] },
    });
    expect(p.note).toHaveBeenCalledWith("inst-1", "wf-1", "Weekly chart", "workflow");
    expect(hostStepsPending(r.answer)).toBe(false);

    // A re-open makes nothing twice.
    const again = ports();
    const r2 = await addInstalledAgent(r.answer, "org-1", again);
    expect(r2.ok).toBe(true);
    expect(again.copier).not.toHaveBeenCalled();
    expect(again.extraCopier).not.toHaveBeenCalled();
    expect(again.createWorkflow).not.toHaveBeenCalled();
  });

  it("names a row the install did not make instead of binding nothing", async () => {
    const p = ports();
    const broken = { ...ANSWER, host: { ...(ANSWER["host"] as object), ids: { "tables.company_profile": "tbl-1" } } } as InstallAnswer;
    const r = await addInstalledAgent(broken, "org-1", p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/row "r1" of "company_profile", which was not created/);
    expect(p.copier).not.toHaveBeenCalled();
  });
});
