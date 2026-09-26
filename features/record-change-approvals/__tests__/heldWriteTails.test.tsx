/** @jest-environment jsdom */
//
// HELD-WRITE-TAILS (2026-09-26) — a held change is shown as held, with its card,
// wherever it happens, and the setting that decides it is a real choice.
//
// THE USE CASE. Harbor Dental Group keeps "Agent changes to this organization's
// data" on the platform default, Ask. Its front desk runs a workflow whose step
// "Save Table Row" writes the morning's recall confirmations into the Hygiene
// Recall Schedule. Before this lane:
//
//   1. On organization Settings, Configuration the setting was a FREE-TEXT box
//      for a five-way choice — a person had to type `always_ask` from memory.
//   2. The workflow step never asked the setting at all (server half, aidream
//      test_held_write_tails.py). Now it holds, and the run view has to draw
//      the same approval card the chat and the table's page draw — from the
//      step's `held_write`, whether it rides the output (`records.table_ensure`)
//      or the failure's details (`data.table.upsert`).
//   3. A run stopped by a held step must read as waiting, never as a fault, and
//      never offer "Run it again" (a rerun queues the change twice).
//
// Every clause fails against the HEAD copies of choices.ts / ladder.ts /
// KnobOverrideRow.tsx / recordChangeApproval.ts / workflow-runs.slice.ts /
// run-failure-explanation.ts, and passes after.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { KnobOverrideRow } from "@/lib/scoped-config/KnobOverrideRow";
import { resolveKnobLadder } from "@/lib/scoped-config/ladder";
import type { ScopedKnob } from "@/lib/scoped-config/types";
import * as approval from "@/features/record-change-approvals/recordChangeApproval";
import { explainRunFailure } from "@/features/workflow-runtime/run-failure-explanation";
import runsReducer, {
  applyRunEvent,
  attachRun,
} from "@/features/workflow-runtime/redux/workflow-runs.slice";
import type { WorkflowRunEvent } from "@/features/workflow-runtime/types";

jest.mock("@/lib/scoped-config/service", () => ({
  setKnobOverride: jest.fn(),
  setKnobRungLock: jest.fn(),
  writeKnobOverrideThroughDoor: jest.fn(),
}));
jest.mock("@/features/admin/limits/service", () => ({ setFeatureKnob: jest.fn() }));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async () => true),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const HARBOR = "11f4e747-0000-4000-8000-000000000001";
const RECALL_TABLE = "b00bde4d-0000-4000-8000-000000000002";

/** The registry row as platform.feature_knob holds it after the campaign file. */
function agentChanges(overrides: Partial<ScopedKnob> = {}): ScopedKnob {
  return {
    feature: "custom",
    key: "agent_schema_changes",
    full_key: "custom.agent_schema_changes",
    label: "Agent changes to this organization's data",
    description: "What happens when an agent asks to change this organization's data.",
    value_type: "string",
    unit: null,
    allowed_values: ["never_ask", "ask", "always_ask", "propose", "auto"],
    min_value: null,
    max_value: null,
    basis: null,
    set_by: "agent",
    review_due: null,
    overridable_by: ["organization"],
    override_direction: "any",
    bound_value: null,
    platform_locked: false,
    org_locked_kinds: [],
    user_override_locked: false,
    platform_default: "ask",
    shipped_default: "ask",
    org_override: null,
    user_override: null,
    effective_value: "ask",
    origin: "platform",
    origin_scope_id: null,
    origin_precedence: 0,
    is_overridden: false,
    out_of_range: false,
    ui: {
      options: [
        { value: "never_ask", label: "Never ask", help: "Agents change tables and write records without asking anyone." },
        { value: "ask", label: "Ask", help: "A change to any table that already existed waits for a person to approve it." },
        { value: "always_ask", label: "Always ask", help: "Every change an agent wants to make waits for a person." },
        { value: "propose", label: "Ask (older name)", help: "The older word for Ask." },
        { value: "auto", label: "Never ask (older name)", help: "The older word for Never ask." },
      ],
    },
    propagation: "next_load",
    scope_chain: [
      { kind: "organization", precedence: 10, scope_id: HARBOR, value: null, is_set: false, locked: false, is_effective: false },
    ],
    locked: null,
    write_rung: { kind: "organization", scope_id: HARBOR },
    can_write: true,
    can_write_reason: null,
    secret: null,
    ...overrides,
  } as unknown as ScopedKnob;
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("1 — the approval setting is a choice, not a text box", () => {
  test("a string setting with registered values derives a select, even with no ui.control", () => {
    const ladder = resolveKnobLadder(agentChanges(), "organization", { isOrgAdmin: true });
    expect(ladder.control).toBe("select");
  });

  test("Settings, Configuration draws a select, never a free-text box", () => {
    const knob = agentChanges();
    act(() =>
      root.render(
        <KnobOverrideRow
          knob={knob}
          scopeKind="organization"
          scopeId={HARBOR}
          organizationId={HARBOR}
          blastRadius="Applies to everyone in Harbor Dental Group."
          ladder={resolveKnobLadder(knob, "organization", { isOrgAdmin: true })}
          onChanged={jest.fn()}
        />,
      ),
    );
    const typed = [...host.querySelectorAll("input")].filter(
      (input) => (input.getAttribute("aria-label") ?? "") === knob.label,
    );
    expect(typed).toHaveLength(0);
    const picker = host.querySelector('[role="combobox"]');
    expect(picker).not.toBeNull();
    expect(picker!.getAttribute("aria-label")).toBe(knob.label);
    // The closed select names the value in force in the registry's words, never the token.
    expect(picker!.textContent?.trim()).toBe("Ask");
  });
});

const WAIT = {
  action: "record_write",
  applied: false,
  table_id: RECALL_TABLE,
  records: [{ patient: "Ruth Adebayo", hygienist: "Dana Whitfield", recall_due: "2026-10-14" }],
  approval_id: "c0ffee00-0000-4000-8000-000000000003",
  approvers: [{ user_id: "87a6e699-3622-4869-8843-d0867456c0dd", name: "admin" }],
  approval: {
    setting: "ask",
    approval_required: true,
    own_table: false,
    reason: "existing_table_needs_a_person",
    why: "An agent asked to change a table that already existed.",
    how_to_change: "An owner or admin changes this in the organization's Settings, Configuration.",
  },
  awaiting_approval: true,
  not_done: "1 record was NOT written, and is waiting for a person.",
};

describe("2 — a held workflow step is read as the same wait the chat reads", () => {
  const heldWriteOfStep = (approval as Record<string, unknown>)["heldWriteOfStep"] as
    | ((step: { output?: unknown; error?: { details?: unknown } | null }) => approval.RecordChangeWait | null)
    | undefined;

  test("from a failure's details (Save Table Row)", () => {
    expect(typeof heldWriteOfStep).toBe("function");
    const wait = heldWriteOfStep!({ output: null, error: { details: { held_write: WAIT } } });
    expect(wait?.approvalId).toBe(WAIT.approval_id);
    expect(wait?.change.change).toBe("records");
  });

  test("from an output (Make Sure a Table Exists)", () => {
    expect(typeof heldWriteOfStep).toBe("function");
    const wait = heldWriteOfStep!({ output: { created: false, held_for_approval: true, held_write: WAIT } });
    expect(wait?.approvalId).toBe(WAIT.approval_id);
  });

  test("an ordinary step output or failure draws no card", () => {
    expect(typeof heldWriteOfStep).toBe("function");
    expect(heldWriteOfStep!({ output: { row_id: "x", created: true } })).toBeNull();
    expect(heldWriteOfStep!({ error: { details: { door: "custom.record" } } })).toBeNull();
  });

  test("the run slice keeps the failure's details, so the card can be drawn", () => {
    const runId = "run-harbor-recalls";
    let state = runsReducer(undefined, { type: "@@init" });
    state = runsReducer(state, attachRun({ runId }));
    const failed = {
      event: "node_failed",
      run_id: runId,
      step: 2,
      node_id: "save_row",
      spec_type: "data.table.upsert",
      attempt: 1,
      dispatch_id: "",
      item_index: 0,
      invocation_count: 1,
      error_type: "held_for_approval",
      error_message: "data.table.upsert: Held for approval: nothing was written yet.",
      error: { __kind: "node_error", code: "held_for_approval", message: "Held", details: { held_write: WAIT } },
      ts: "2026-09-26T19:00:00Z",
    } as unknown as WorkflowRunEvent;
    state = runsReducer(state, applyRunEvent({ runId, event: failed, seq: 3, replay: false }));
    const invocations = Object.values(state.byRunId[runId]?.nodes ?? {});
    expect(invocations).toHaveLength(1);
    expect(invocations[0]!.error?.details?.["held_write"]).toEqual(WAIT);
  });
});

describe("3 — a run stopped by a held step reads as waiting, not as a fault", () => {
  test("the explanation says it is waiting for approval, and never 'run it again'", () => {
    const explained = explainRunFailure(
      {
        cause: "held_for_approval",
        step_label: "Save Table Row",
        message: "data.table.upsert: Held for approval: nothing was written yet.",
      },
      "Morning recall sync",
    );
    expect(explained.cause).toBe("held_for_approval");
    expect(explained.headline).toContain("waiting for your approval");
    expect(explained.unrecognized).toBe(false);
    expect(explained.nextStep).not.toMatch(/run it again/i);
  });
});
