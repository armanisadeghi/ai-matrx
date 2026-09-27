/**
 * THE TRACKER HAS NO BARE SUCCESS. Only `settle(outcome)` can write
 * run_complete, and only for a `success` outcome; a failure posts run_error
 * with the refusal reason; a stopped run posts run_cancelled (success stays
 * NULL, error_type "cancelled"); an unresolved run posts nothing.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
jest.mock("@/hooks/useApiAuth", () => ({ useApiAuth: () => ({ fingerprintId: "fp-1" }) }));

import { useAgentAppTracker, type RunTracker } from "./useAgentAppTracker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = jest.fn(() => Promise.resolve(new Response("{}")));
(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

function events(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown[])[1] && ((c as unknown[])[1] as RequestInit).body)));
}

it("posts run_error with the reason for a refused run, run_complete only for success", () => {
  let startRun: ((v?: Record<string, unknown>) => RunTracker) | null = null;
  function Probe() {
    startRun = useAgentAppTracker("app-1").startRun;
    return null;
  }
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<Probe />));
  const refused = startRun!();
  refused.settle({ kind: "failure", errorType: "guest_limit_reached", message: "You've used your free runs." });
  const ok = startRun!();
  ok.settle({ kind: "success" });
  const stopped = startRun!();
  stopped.settle({ kind: "cancelled" });
  const kinds = events().map((e) => e.event);
  // A stopped run is recorded as cancelled — neither success nor failure.
  expect(kinds.filter((k) => k === "run_cancelled")).toHaveLength(1);
  expect(kinds.filter((k) => k === "run_complete")).toHaveLength(1);
  const err = events().find((e) => e.event === "run_error");
  expect(err).toMatchObject({ errorType: "guest_limit_reached", errorMessage: "You've used your free runs." });
  expect(kinds.filter((k) => k === "run_start")).toHaveLength(3);
  act(() => root.unmount());
});
