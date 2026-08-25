import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { WorkflowRunWireEvent } from "@/features/agents/redux/execution-system/thunks/follow-workflow-run-stream";
import { TryMasterworkBox } from "./TryMasterworkBox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let attachedOnEvent: ((event: WorkflowRunWireEvent) => void) | undefined;
const dispatch = jest.fn((action: unknown) => action);
const getMasterworkRunVerdict = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
}));

jest.mock(
  "@/features/agents/redux/execution-system/thunks/attach-workflow-run",
  () => ({
    attachWorkflowRun: (options: {
      onEvent?: (event: WorkflowRunWireEvent) => void;
    }) => {
      attachedOnEvent = options.onEvent;
      return { type: "test/attach-workflow-run" };
    },
  }),
);

jest.mock(
  "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream",
  () => ({
    adoptForeignStream: () => ({ type: "test/adopt-foreign-stream" }),
  }),
);

jest.mock("@/lib/api/call-api", () => ({
  callApi: () => ({ type: "test/call-api" }),
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: () => <textarea aria-label="Masterwork input" />,
}));

jest.mock("@/features/rich-document/RichDocument", () => ({
  RichDocument: () => <div>Rendered verdict</div>,
}));

jest.mock("../../service", () => ({
  getMasterworkRunFields: () => Promise.resolve([]),
  getMasterworkRunVerdict: (...args: unknown[]) =>
    getMasterworkRunVerdict(...args),
}));

jest.mock("@/features/workflow-runtime/run-failure-explanation", () => ({
  // The real primitive takes the WHOLE error record; the stub mirrors that so
  // this test would catch a caller that went back to passing one string.
  explainRunFailure: (input: unknown, whatItRuns: string) => ({
    headline: `${whatItRuns} stopped`,
    nextStep: "Try again.",
    technical:
      typeof input === "string"
        ? input
        : ((input as { message?: string } | null)?.message ?? null),
    unrecognized: false,
    action: null,
    cause: (input as { cause?: string } | null)?.cause ?? null,
  }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  attachedOnEvent = undefined;
  dispatch.mockClear();
  getMasterworkRunVerdict.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

it("settles an errored run from its live terminal event without the row-poll recovery alarm", async () => {
  const masterworkId = "11111111-1111-4111-8111-111111111111";
  const runId = "22222222-2222-4222-8222-222222222222";
  sessionStorage.setItem(`matrx.masterwork.run.${masterworkId}`, runId);
  getMasterworkRunVerdict
    .mockResolvedValueOnce({ status: "running" })
    .mockResolvedValueOnce({
      status: "errored",
      error: { message: "The worker rejected the input." },
    });
  const onRunFinished = jest.fn();
  const consoleError = jest.spyOn(console, "error").mockImplementation();

  await act(async () => {
    root.render(
      <TryMasterworkBox
        masterworkId={masterworkId}
        masterworkKind="edit"
        onRunFinished={onRunFinished}
      />,
    );
  });

  expect(attachedOnEvent).toBeDefined();

  await act(async () => {
    attachedOnEvent?.({
      event: "run_errored",
      run_id: runId,
      error_message: "The worker rejected the input.",
    });
  });

  expect(onRunFinished).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Your Masterwork stopped");
  expect(container.textContent).toContain("The worker rejected the input.");
  expect(consoleError).not.toHaveBeenCalled();
});
