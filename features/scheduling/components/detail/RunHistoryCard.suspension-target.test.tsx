import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AgendaTask, SchRunRow } from "../../types";

const useTaskRuns = jest.fn();

jest.mock("../../hooks/useTaskRuns", () => ({
  useTaskRuns: (...args: unknown[]) => useTaskRuns(...args),
}));
jest.mock("../../hooks/useRunStream", () => ({ useRunStream: jest.fn() }));
jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: () => null,
}));

import { RunHistoryCard } from "./RunHistoryCard";

const historicalRunId = "78c5de02-545e-45b3-9ab9-85f05525c433";
const run: SchRunRow = {
  id: historicalRunId,
  task_id: "task-1",
  trigger_id: null,
  user_id: "user-1",
  status: "success",
  surface: null,
  queue: null,
  output_ref: null,
  due_at: "2026-08-26T04:41:17.839Z",
  claimed_at: null,
  started_at: null,
  finished_at: "2026-08-26T04:41:18.839Z",
  claim_token: null,
  claim_expires_at: null,
  result_summary: "839 units committed",
  error_message: null,
  result_metadata: null,
  created_at: "2026-08-26T04:41:17.839Z",
};
const task = {
  id: "task-1",
  metadata: {
    auto_suspended_history: [{ run_id: historicalRunId }],
  },
} as AgendaTask;

describe("RunHistoryCard suspension targets", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    useTaskRuns.mockReturnValue({
      runs: [run],
      status: "success",
      error: null,
      retry: jest.fn(),
      requiredRunsSettled: true,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("requests every suspension run id and renders the matching fragment target", () => {
    act(() => root.render(<RunHistoryCard taskId="task-1" task={task} />));

    expect(useTaskRuns).toHaveBeenCalledWith("task-1", 20, [historicalRunId]);
    expect(container.querySelector(`#run-${historicalRunId}`)).not.toBeNull();
  });

  it("keeps the fragment destination honest when a referenced run was purged", () => {
    useTaskRuns.mockReturnValue({
      runs: [],
      status: "success",
      error: null,
      retry: jest.fn(),
      requiredRunsSettled: true,
    });
    act(() => root.render(<RunHistoryCard taskId="task-1" task={task} />));

    const target = container.querySelector(`#run-${historicalRunId}`);
    expect(target).not.toBeNull();
    expect(target?.textContent).toContain(
      "This referenced run is no longer available",
    );
  });

  it("does not call a referenced run unavailable before its exact lookup settles", () => {
    useTaskRuns.mockReturnValue({
      runs: [],
      status: "success",
      error: null,
      retry: jest.fn(),
      requiredRunsSettled: false,
    });
    act(() => root.render(<RunHistoryCard taskId="task-1" task={task} />));

    expect(container.querySelector(`#run-${historicalRunId}`)).toBeNull();
    expect(container.textContent).toContain("Loading run history");
    expect(container.textContent).not.toContain(
      "This referenced run is no longer available",
    );
  });
});
