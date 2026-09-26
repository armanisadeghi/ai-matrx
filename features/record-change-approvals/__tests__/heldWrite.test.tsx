/**
 * A WRITE THE STORE HELD FOR A PERSON — the chip and the card, for EVERY tool.
 *
 * VERIFIER-26 item 5 (2026-09-26, production): an agent added a row to a moved
 * table with the `dataset` tool, the store held it for approval, and
 *   (a) nothing let the person approve it — the card was mounted only by the
 *       `records` tool's renderer; and
 *   (b) the chip said "The agent sent invalid arguments", which was false.
 *
 * These clauses assert the fixed world through the real shell
 * (`ToolCallVisualization`), the real reader and the real chip label. Run
 * against the pre-fix copies they fail: the dataset entry draws the dataset
 * renderer (no card), and the label reads "The agent sent invalid arguments".
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => "default",
}));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({ openOverlay: jest.fn() }));
jest.mock("@/components/loaders/ShimmerText", () => ({
  ShimmerText: ({ text }: { text: string }) => <span>{text}</span>,
}));
jest.mock(
  "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors",
  () => ({ selectToolDisplayPreference: jest.fn() }),
);
jest.mock("@/features/tool-call-visualization/registry/registry", () => ({
  getInlineRenderer: jest.fn(() => () => <div data-testid="dataset-renderer">dataset body</div>),
  getToolDisplayName: jest.fn(() => "Dataset"),
  getToolPhaseLabel: jest.fn(
    (_tool: string, _name: string, phase: string) =>
      phase === "error" ? "Dataset action failed" : "Updated dataset",
  ),
  getHeaderSubtitle: jest.fn(() => null),
  getToolDisplayMode: jest.fn(() => "auto"),
  getToolGlyph: jest.fn(() => ({ icon: () => null, accent: "slate" })),
  getToolChrome: jest.fn(() => "line"),
  hasCustomRenderer: jest.fn(() => true),
}));
jest.mock("@/features/tool-call-visualization/renderers/_shared-entity/ToolGlyph", () => ({
  ToolGlyph: () => <span />,
}));
jest.mock("@/features/tool-call-visualization/db-renderer/useDbToolMeta", () => ({
  useDbToolRendererState: jest.fn(() => ({ meta: null, resolution: "custom" })),
}));
jest.mock("@/features/tool-call-visualization/db-renderer/toolRendererCache", () => ({
  prefetchToolRenderer: jest.fn(),
}));
jest.mock("@/features/tool-call-visualization/renderers/useAutoScrollOnStream", () => ({
  useAutoScrollOnStream: () => ({ current: null }),
}));
jest.mock("@/features/tool-call-visualization/components/toolCardUiSession", () => ({
  getToolCardUserChoice: () => null,
  setToolCardUserChoice: jest.fn(),
  markToolCardLive: jest.fn(),
  wasToolCardLive: () => false,
}));
jest.mock("@/features/tool-call-visualization/components/ToolUpdatesOverlay", () => ({
  ToolUpdatesOverlay: () => null,
}));
jest.mock("@/features/tool-call-visualization/registry/toolArtifact", () => ({
  getToolArtifact: () => null,
}));
jest.mock("@/features/tool-call-visualization/components/ArtifactResultBar", () => ({
  ArtifactResultBar: () => null,
}));
// The card's own doors are the store's; what is under test is THAT the shell
// mounts it, with the wait the tool carried.
jest.mock("@/features/record-change-approvals/RecordChangeApprovalCard", () => ({
  RecordChangeApprovalCard: ({ wait }: { wait: { approvalId: string } }) => (
    <div data-testid="held-write-card" data-approval-id={wait.approvalId}>
      Approve Refuse
    </div>
  ),
}));
jest.mock("@/features/record-change-approvals/useHeldWriteTableName", () => ({
  useHeldWriteTableName: () => "Hygiene Recall Schedule",
}));

import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import { toolErrorLabel } from "@/features/tool-call-visualization/result-fields/ToolErrorCard";
import {
  heldWriteHeadline,
  readRecordChangeWait,
  waitFromQueueRow,
} from "../recordChangeApproval";

const TABLE = "b00bde4d-1adc-4682-88eb-57453aabf014";
const APPROVAL = "82384354-ca7f-4e7e-a549-669620a874e8";

/** The dataset tool's answer for a held write, as the server now sends it. */
const HELD_OUTPUT = {
  action: "record_write",
  applied: false,
  table_id: TABLE,
  records: [{ patient: "Elena Marchetti", hygienist: "Jonah", recall_due: "2027-03-15" }],
  approval_id: APPROVAL,
  approvers: [{ user_id: "87a6e699-3622-4869-8843-d0867456c0dd", name: "admin", why: "owner" }],
  approval: {
    setting: "ask",
    approval_required: true,
    own_table: false,
    reason: "existing_table_needs_a_person",
    why: "That table already existed in this organization, so a person is asked before an agent changes it.",
    how_to_change: "An administrator changes this on the organization's data settings.",
  },
  awaiting_approval: true,
  status: "held_for_approval",
  held_for_approval: true,
  not_done: "1 record was NOT written, and is waiting for a person. It is waiting for admin.",
};

function entry(over: Partial<ToolLifecycleEntry> = {}): ToolLifecycleEntry {
  return {
    callId: "call-dataset-held",
    toolName: "dataset",
    displayName: "dataset",
    status: "completed",
    arguments: { action: "add_rows", dataset_id: TABLE },
    startedAt: "2026-09-26T14:14:03.000Z",
    completedAt: "2026-09-26T14:14:04.000Z",
    latestMessage: null,
    latestData: null,
    result: HELD_OUTPUT,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
    ...over,
  };
}

function mount(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("a held write in chat — the card, for every tool", () => {
  it("mounts the approval card for a DATASET tool's held write, open, instead of the dataset renderer", () => {
    const view = mount(<ToolCallVisualization entries={[entry()]} isPersisted />);
    const card = view.container.querySelector('[data-testid="held-write-card"]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute("data-approval-id")).toBe(APPROVAL);
    expect(view.container.querySelector('[data-testid="dataset-renderer"]')).toBeNull();
    view.unmount();
  });

  it("the chip tells the truth: held for approval, what, on which table — never 'failed' or 'invalid arguments'", () => {
    const view = mount(<ToolCallVisualization entries={[entry()]} isPersisted />);
    const chip = view.container.querySelector("button")?.textContent ?? "";
    expect(chip).toContain("Held for your approval: 1 new record on Hygiene Recall Schedule");
    expect(chip).not.toMatch(/invalid arguments|failed/i);
    view.unmount();
  });

  it("an older server's approval_required error still reads as held, never as invalid arguments", () => {
    const legacy = entry({
      status: "error",
      result: null,
      errorType: "approval_required",
      errorMessage: "1 record was NOT written, and is waiting for a person. It is waiting for admin.",
    });
    expect(toolErrorLabel(legacy)).toBe("Held for your approval");
    const view = mount(<ToolCallVisualization entries={[legacy]} isPersisted />);
    const chip = view.container.querySelector("button")?.textContent ?? "";
    expect(chip).toContain("Held for your approval");
    expect(chip).not.toMatch(/invalid arguments|action failed/i);
    view.unmount();
  });

  it("CONTROL: a real argument error still says so", () => {
    expect(
      toolErrorLabel(entry({ status: "error", errorType: "validation", errorMessage: "table_id is required." })),
    ).toBe("The agent sent invalid arguments");
  });
});

describe("one wait shape for every tool and for the queue", () => {
  it("reads the dataset tool's held output as a records wait", () => {
    const wait = readRecordChangeWait(HELD_OUTPUT);
    expect(wait?.change.change).toBe("records");
    expect(wait?.approvalId).toBe(APPROVAL);
    expect(heldWriteHeadline(wait!, "Hygiene Recall Schedule")).toBe(
      "Held for your approval: 1 new record on Hygiene Recall Schedule",
    );
  });

  it("reads a held PATCH (record_id + patch + table_id) and a held delete", () => {
    const patch = readRecordChangeWait({
      ...HELD_OUTPUT,
      records: undefined,
      record_id: "880b355a-0000-4000-8000-000000000001",
      patch: { hygienist: "Marisol" },
    });
    expect(patch?.change.change).toBe("patch");
    const del = readRecordChangeWait({
      ...HELD_OUTPUT,
      action: "record_delete",
      records: undefined,
      record_id: "880b355a-0000-4000-8000-000000000001",
    });
    expect(del?.change.change).toBe("delete");
  });

  it("reads the queue row the table's page lists as the SAME wait the chat card draws", () => {
    const wait = waitFromQueueRow({
      state: "pending",
      change: { kind: "record_add", rows: HELD_OUTPUT.records },
      origin: "agent",
      subject_id: TABLE,
      subject_kind: "table",
      approval_id: APPROVAL,
      approvers: HELD_OUTPUT.approvers,
    });
    expect(wait?.change).toEqual({ change: "records", tableId: TABLE, rows: HELD_OUTPUT.records });
    expect(wait?.approvalId).toBe(APPROVAL);
    expect(waitFromQueueRow({ state: "approved", change: {}, subject_id: TABLE, approval_id: APPROVAL })).toBeNull();
  });
});
