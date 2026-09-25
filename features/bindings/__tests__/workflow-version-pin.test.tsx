/**
 * WORKFLOW PARITY — pinned vs latest is a property of EVERY binding.
 *
 * MANDATE-SYSTEM §6: "Every binding attaches to its agent or workflow in one
 * of two ways: pinned to a version, or latest." Until 2026-09-25 the holder
 * controls rendered a DISABLED "Latest" for a workflow with a note that pins
 * were unsupported — while the server resolved and ran pinned workflow
 * bindings — and the draft had no field for the pin, so every save from the
 * screen silently UNPINNED a workflow binding set anywhere else.
 *
 * Guards: (a) a chosen workflow gets a live version control listing its
 * published versions; (b) a stored pin seeds the draft and survives the save
 * payload; (c) picking a different workflow starts on Latest.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/agents/catalog/react", () => ({
  ...jest.requireActual("@ai-matrx/agents/catalog/react"),
  AgentListDropdown: () => <button data-testid="agent-picker" />,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve([]) }),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/features/agents/redux/agent-definition/thunks", () => ({
  fetchAgentsListFull: () => ({ type: "noop" }),
  fetchAgentVersionHistory: () => ({ type: "noop" }),
}));
let pickWorkflow: ((id: string) => void) | null = null;
jest.mock("@/features/workflow-runtime/listings/WorkflowListDropdown", () => ({
  WorkflowListDropdown: ({ onSelect }: { onSelect: (id: string) => void }) => {
    pickWorkflow = onSelect;
    return <div data-testid="workflow-picker" />;
  },
}));
const listWorkflowVersionChoices = jest.fn();
jest.mock("../workflow-versions", () => ({
  listWorkflowVersionChoices: (id: string) => listWorkflowVersionChoices(id),
}));

import { HolderAssignment } from "../HolderAssignment";
import type { HolderDraft } from "../ScopeHolderBar";
import { buildBindingSavePayload } from "@/features/mandates/workspace/save-payload";

const WF = "256695b0-537e-4e80-a4b2-8fdd91557e59";
const V4 = "11111111-1111-4111-8111-111111111111";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  listWorkflowVersionChoices.mockResolvedValue([
    { id: V4, versionNumber: 4, changeNote: "declare markdown answer" },
  ]);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(holder: HolderDraft, onHolderChange = jest.fn()) {
  await act(async () => {
    root.render(
      <HolderAssignment
        holder={holder}
        onHolderChange={onHolderChange}
        mandateKey="wfparity.text_summary"
        holderName="Summarize text to markdown"
      />,
    );
  });
  return onHolderChange;
}

const workflowHolder = (pin: string | null): HolderDraft => ({
  kind: "workflow",
  agentId: null,
  agentVersionId: null,
  useLatest: pin === null,
  workflowId: WF,
  workflowVersionId: pin,
});

test("(a) a chosen workflow gets a LIVE version control, fed by its versions", async () => {
  await render(workflowHolder(null));
  const version = host.querySelectorAll('[data-holder-control="version"]');
  expect(version).toHaveLength(1);
  const trigger = version[0].querySelector('[aria-label="Version"]') as HTMLButtonElement;
  expect(trigger).not.toBeNull();
  expect(trigger.disabled).toBe(false);
  expect(listWorkflowVersionChoices).toHaveBeenCalledWith(WF);
  expect(host.textContent).not.toMatch(/not supported/i);
});

test("(a) a pinned workflow shows its version, not Latest", async () => {
  await render(workflowHolder(V4));
  const trigger = host.querySelector('[aria-label="Version"]') as HTMLElement;
  expect(trigger.textContent).toContain("v4");
});

test("(b) the stored pin survives the save payload", () => {
  const payload = buildBindingSavePayload({
    holder: { kind: "workflow", workflowId: WF, workflowVersionId: V4 },
    hasOffer: true,
    consumptionMap: {},
    settingsOpened: false,
    capturedOverrides: undefined,
    storedOverrides: null,
  });
  expect(payload.holderVersionId).toBe(V4);
  expect(payload.useLatest).toBe(false);
});

test("(c) picking a different workflow starts on Latest", async () => {
  const onHolderChange = await render(workflowHolder(V4));
  act(() => pickWorkflow?.("22222222-2222-4222-8222-222222222222"));
  expect(onHolderChange).toHaveBeenCalledWith(
    expect.objectContaining({
      workflowId: "22222222-2222-4222-8222-222222222222",
      workflowVersionId: null,
    }),
  );
});

// ── (b) the stored pin SEEDS the draft — the half that actually unpinned ──
import { defaultHolderDraftOf, holderDraftOf } from "../holder-draft-seed";

test("(b) a stored workflow binding pin seeds the draft", () => {
  const draft = holderDraftOf({
    holder_type: "workflow",
    holder_id: WF,
    holder_version_id: V4,
  } as unknown as Parameters<typeof holderDraftOf>[0]);
  expect(draft.kind).toBe("workflow");
  expect(draft.workflowId).toBe(WF);
  expect(draft.workflowVersionId).toBe(V4);
});

test("(b) a pinned workflow DEFAULT holder seeds the draft", () => {
  const draft = defaultHolderDraftOf({
    default_holder_type: "workflow",
    default_holder_id: WF,
    default_holder_version_id: V4,
  } as unknown as Parameters<typeof defaultHolderDraftOf>[0]);
  expect(draft.workflowId).toBe(WF);
  expect(draft.workflowVersionId).toBe(V4);
});
