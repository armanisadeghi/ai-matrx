/** @jest-environment jsdom */
//
// RUN-PAGE-TAILS (2026-09-27) — a run control never asks "Which workspace is
// this for?". Harbor Dental Group's "Morning recall confirmations" run is held
// on Marisol Okafor's confirmation; the person opens the run's link with no
// workspace chosen and presses a control. The run already belongs to Harbor
// Dental Group, so every verb that acts on an existing run names the RUN's
// organization on the call (`scopeOverrides.organization_id`) — the gate is
// never consulted, so it never asks. Fails against the HEAD hook, which sent
// no organization and let callApi fall back to the (empty) active one.

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const HARBOR = "11f4e747-c13a-49c7-81a3-66e6391f8a9b";
const RUN = "run-harbor-morning-recalls";

const sent: Array<Record<string, unknown>> = [];
jest.mock("@/lib/api/call-api", () => ({
  callApi: (config: Record<string, unknown>) => config,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => async (config: Record<string, unknown>) => {
    sent.push(config);
    return { error: null };
  },
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/utils/supabase/client", () => {
  const maybeSingle = jest.fn(async () => ({ data: { organization_id: HARBOR }, error: null }));
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle,
  };
  return { supabase: { schema: () => ({ from: () => chain }) } };
});

import {
  useWorkflowRunControls,
  type WorkflowRunControls,
} from "../useWorkflowRunControls";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function withControls(): WorkflowRunControls {
  let controls: WorkflowRunControls | null = null;
  function Harness() {
    controls = useWorkflowRunControls();
    return null;
  }
  const host = document.createElement("div");
  act(() => createRoot(host).render(<Harness />));
  return controls!;
}

describe("run controls take the run's own organization", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  const verbs: Array<[string, (c: WorkflowRunControls) => Promise<boolean>]> = [
    ["pause", (c) => c.pause(RUN)],
    ["resumePaused", (c) => c.resumePaused(RUN)],
    ["cancel", (c) => c.cancel(RUN)],
    ["answerInterrupt", (c) => c.answerInterrupt(RUN, "cp-1", {})],
    ["retryNode", (c) => c.retryNode(RUN, "save_confirmation")],
    ["skipNode", (c) => c.skipNode(RUN, "save_confirmation")],
    ["executeNode", (c) => c.executeNode(RUN, "save_confirmation")],
  ];

  test.each(verbs)("%s names the run's organization and never the active one", async (_name, press) => {
    const controls = withControls();
    await act(async () => {
      await press(controls);
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.scopeOverrides).toEqual({ organization_id: HARBOR });
  });
});
