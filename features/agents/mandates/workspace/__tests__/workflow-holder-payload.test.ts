/**
 * WORKFLOW AS HOLDER — the wire shape.
 *
 * The defect this pins: `agent.mandate_binding` has BOTH an agent identity
 * (agent_id / agent_version_id) and a workflow identity (holder_id /
 * holder_version_id), and aidream's `bindings.py` 422s when the wrong pair is
 * populated for the declared holder_type. A UI that carried a leftover agent id
 * into a workflow save would be refused with a message about a field the user
 * never touched — or, worse, stored a binding naming two Holders.
 *
 * The rule: a workflow Holder carries NO agent identity, and an agent Holder
 * carries NO workflow identity. Ever.
 */

import { buildBindingSavePayload } from "../save-payload";

const base = {
  hasProvision: true,
  consumptionMap: {},
  capturedOverrides: undefined,
  storedOverrides: null,
} as const;

const WORKFLOW_ID = "3ffe233a-8ad6-43be-b1ee-42c232713bd4";

describe("buildBindingSavePayload — workflow Holder", () => {
  it("names the workflow and NOTHING agent-shaped", () => {
    const payload = buildBindingSavePayload({
      ...base,
      holder: { kind: "workflow", workflowId: WORKFLOW_ID },
    });
    expect(payload.holderType).toBe("workflow");
    expect(payload.holderId).toBe(WORKFLOW_ID);
    expect(payload.agentId).toBeNull();
    expect(payload.agentVersionId).toBeNull();
  });

  it("follows the live definition when no version is pinned", () => {
    const payload = buildBindingSavePayload({
      ...base,
      holder: { kind: "workflow", workflowId: WORKFLOW_ID },
    });
    expect(payload.holderVersionId).toBeNull();
    expect(payload.useLatest).toBe(true);
  });

  it("pins to a definition version when one is chosen", () => {
    const payload = buildBindingSavePayload({
      ...base,
      holder: {
        kind: "workflow",
        workflowId: WORKFLOW_ID,
        workflowVersionId: "11111111-2222-4333-8444-555555555555",
      },
    });
    expect(payload.holderVersionId).toBe("11111111-2222-4333-8444-555555555555");
    expect(payload.useLatest).toBe(false);
  });

  it("keeps the legacy-mandate map rule: no provision means no map on the wire", () => {
    const payload = buildBindingSavePayload({
      ...base,
      hasProvision: false,
      holder: { kind: "workflow", workflowId: WORKFLOW_ID },
    });
    expect(payload.consumptionMap).toBeUndefined();
  });

  it("keeps the settings wipe-guard: an unopened settings step reuses what is stored", () => {
    const stored = { model_id: "m-1" };
    const payload = buildBindingSavePayload({
      ...base,
      storedOverrides: stored,
      holder: { kind: "workflow", workflowId: WORKFLOW_ID },
    });
    expect(payload.configOverrides).toEqual(stored);
  });
});

describe("buildBindingSavePayload — agent Holder stays agent-only", () => {
  it("declares holder_type agent and names no workflow", () => {
    const payload = buildBindingSavePayload({
      ...base,
      holder: {
        agentId: "aaaaaaaa-0000-4000-8000-000000000000",
        agentVersionId: null,
        useLatest: true,
      },
    });
    expect(payload.holderType).toBe("agent");
    expect(payload.holderId).toBeUndefined();
    expect(payload.agentId).toBe("aaaaaaaa-0000-4000-8000-000000000000");
  });

  it("still refuses a UI state that drifted into both agent references", () => {
    expect(() =>
      buildBindingSavePayload({
        ...base,
        holder: {
          agentId: "aaaaaaaa-0000-4000-8000-000000000000",
          agentVersionId: "bbbbbbbb-0000-4000-8000-000000000000",
          useLatest: false,
        },
      }),
    ).toThrow(/ONE holder reference/);
  });
});
