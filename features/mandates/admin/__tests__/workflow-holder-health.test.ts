/**
 * WORKFLOW PARITY — a job a workflow holds is judged as a workflow.
 *
 * `buildRow` read every holder id as an AGENT id: a workflow-held job found no
 * agent, and the console, the peek and the dashboard counts called it
 * "unresolved pin" (found 2026-09-25 with `wfparity.text_summary`). These pin
 * the three honest states: a readable workflow is ok and NAMED; a pinned one
 * shows its version; an unreadable one is still unresolved.
 */
import { buildRow } from "../mandate-health";
import type { MandateConsoleData, MandateDefinitionRow } from "../service";

const WF = "256695b0-537e-4e80-a4b2-8fdd91557e59";
const V4 = "85c3220f-9a0b-4f0c-bfa3-ceeaefc1cb96";

const DATA = {
  mandates: [],
  agentsById: {},
  versionsById: {},
  bindingsByMandateId: {},
  outputSchemas: {},
  workflowsById: { [WF]: { id: WF, name: "Summarize text to markdown", isArchived: false } },
  workflowVersionsById: { [V4]: { id: V4, workflowId: WF, versionNumber: 4 } },
} as unknown as MandateConsoleData;

function mandate(overrides: Record<string, unknown>): MandateDefinitionRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    mandate_key: "wfparity.text_summary",
    label: "Text summary",
    is_enabled: true,
    output_kind: "markdown",
    metadata: null,
    updated_at: "2026-09-25T09:00:00Z",
    default_holder_type: "workflow",
    default_holder_id: WF,
    default_holder_version_id: null,
    ...overrides,
  } as unknown as MandateDefinitionRow;
}

test("a readable workflow holder is ok and named — never 'unresolved pin'", () => {
  const row = buildRow(mandate({}), DATA);
  expect(row.health).toBe("ok");
  expect(row.agentName).toBe("Summarize text to markdown");
  expect(row.pinLabel).toBe("latest");
});

test("a pinned workflow holder shows its version", () => {
  const row = buildRow(mandate({ default_holder_version_id: V4 }), DATA);
  expect(row.health).toBe("ok");
  expect(row.pinLabel).toBe("v4");
});

test("an unreadable workflow holder is still unresolved", () => {
  const row = buildRow(
    mandate({ default_holder_id: "99999999-9999-4999-8999-999999999999" }),
    DATA,
  );
  expect(row.health).toBe("unresolved pin");
});
