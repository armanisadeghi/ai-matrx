/**
 * WORKFLOW PARITY, round 2 — a job a workflow holds is GRADED in the admin
 * list, the same way an agent-held job is.
 *
 * Before: the Grade column asked only the agent impact read, which gives a
 * workflow rung `unsupported_holder`, so `wfparity.text_summary` (held by the
 * workflow "Summarize text to markdown") read "Not graded" forever and a red
 * workflow change never reached the Grade filter or the Health cell.
 */
import { buildAdminRows } from "../rows";
import { buildFacts } from "../facts";
import type { MandateConsoleData, MandateDefinitionRow } from "@/features/mandates/admin/service";
import {
  isWorkflowDrift,
  leadWorkflowVerdict,
  type WorkflowImpactReport,
  type WorkflowImpactVerdict,
} from "@/features/mandates/admin/workflow-impact";

const WF = "256695b0-537e-4e80-a4b2-8fdd91557e59";
const KEY = "wfparity.text_summary";

const MANDATE = {
  id: "11111111-1111-1111-1111-111111111111",
  mandate_key: KEY,
  label: "Text summary",
  is_enabled: true,
  output_kind: "markdown",
  metadata: null,
  updated_at: "2026-09-25T09:00:00Z",
  default_holder_type: "agent",
  default_holder_id: null,
  default_holder_version_id: null,
} as unknown as MandateDefinitionRow;

const DATA = {
  mandates: [MANDATE],
  agentsById: {},
  versionsById: {},
  bindingsByMandateId: {},
  outputSchemas: {},
  workflowsById: { [WF]: { id: WF, name: "Summarize text to markdown", isArchived: false } },
  workflowVersionsById: {},
} as unknown as MandateConsoleData;

function verdict(overrides: Partial<WorkflowImpactVerdict>): WorkflowImpactVerdict {
  return {
    holder_kind: "binding",
    row_id: "ddef2aac-a6dd-45fc-937b-5b19ebab7e1d",
    mandate_key: KEY,
    principal_kind: "user",
    organization_id: null,
    subject_user_id: null,
    workflow_id: WF,
    workflow_name: "Summarize text to markdown",
    pinned_version_id: "v4",
    pinned_version_number: 4,
    latest_version_id: "v5",
    latest_version_number: 5,
    grade: "red",
    blocker: null,
    set_aside_reason: null,
    findings: [
      {
        rule_id: "inputs.removed",
        grade: "red",
        message: "the input 'text' was removed",
        field: "text",
        before: null,
        after: null,
      },
    ],
    breaks: { inputs: "red", output: "identical", steps: "identical", overrides: "identical" },
    contract_broken: false,
    behind_latest: true,
    ...overrides,
  };
}

const REPORT: WorkflowImpactReport = {
  verdicts: [verdict({})],
  withheld: { total: 0, by_principal_kind: {}, sentence: null },
  workflows_examined: 1,
  computed_at: "2026-09-25T10:00:00Z",
};

function rowsWith(workflowImpact: WorkflowImpactReport | null) {
  return buildAdminRows({
    console: DATA,
    codeTruth: null,
    coverage: null,
    catalogue: null,
    impact: { verdicts: [] } as never,
    impactFailed: false,
    workflowImpact,
    serveLinks: [],
    organizationNames: {},
  });
}

test("a workflow-held job is graded by its workflow rung — never 'not graded'", () => {
  const [row] = rowsWith(REPORT);
  expect(row.workflowVerdicts).toHaveLength(1);
  expect(row.impactGrade).toBe("red");
  expect(row.impactBlocker).toBe("none");
  expect(row.ungraded).toBeNull();
});

test("without the workflow read the row still says it is not graded", () => {
  const [row] = rowsWith(null);
  expect(row.impactGrade).toBe("ungraded");
  expect(row.ungraded).not.toBeNull();
});

test("the Grade and Blocker filters see the workflow grade", () => {
  const facts = buildFacts(
    { codeTruth: null, coverage: null, impact: null, workflowImpact: REPORT },
    ["grade", "blocker"],
  ) as { grade: Record<string, string[]>; blocker: Record<string, string[]> };
  expect(facts.grade.red).toEqual([KEY]);
  expect(facts.blocker.none).toEqual([KEY]);
});

test("the mandate's own default rung speaks before any binding", () => {
  const lead = leadWorkflowVerdict([
    verdict({ grade: "red" }),
    verdict({ holder_kind: "mandate_default", principal_kind: "system", grade: "green" }),
  ]);
  expect(lead?.holder_kind).toBe("mandate_default");
});

test("drift = the job is already affected, not merely a red change above a pin", () => {
  expect(isWorkflowDrift(verdict({}))).toBe(false);
  expect(isWorkflowDrift(verdict({ contract_broken: true }))).toBe(true);
  expect(isWorkflowDrift(verdict({ blocker: "tracks_latest" }))).toBe(true);
});
