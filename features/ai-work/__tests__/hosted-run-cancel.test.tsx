/**
 * FORCING GUARD — a hosted run can always be stopped.
 *
 * A run we start in a Matrx Sandbox on the user's behalf costs money and holds
 * a box. "Cancel" is therefore not decoration: while a hosted run is in flight
 * the control must be RENDERED, must name what stopping ends, and must call
 * the cancel door with the runtime id THE STREAM REPORTED — not an id invented
 * by the component.
 *
 * So this suite drives the real stream reader over a real
 * `MatrxRuntimeWarning`-shaped event, feeds the id it produces to the control,
 * clicks it, and asserts the exact door and path the request went to. The only
 * thing mocked is the wire.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { TypedStreamEvent } from "@/types/python-generated/stream-events";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const apiPost = jest.fn();

jest.mock("@/lib/api/typed-client", () => ({
  apiPost: (...args: unknown[]) => apiPost(...args),
  // The real interpolator, typed out: the guard must prove the runtime id
  // reaches the URL, so faking this would defeat the point.
  buildPath: (template: string, params: Record<string, string>) =>
    template.replace(/\{([^}]+)\}/g, (_m, key: string) =>
      encodeURIComponent(params[key]),
    ),
}));

// Mocked only so importing the module under test does not pull the execution
// system and the Redux store into a unit suite. Neither is exercised here.
jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));
jest.mock(
  "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream",
  () => ({ adoptForeignStream: jest.fn() }),
);

const toastError = jest.fn();
const toastSuccess = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

import { HostedRunControls } from "@/features/ai-work/compose/components/HostedRunControls";
import {
  HOSTED_CANCEL_PATH,
  readHostedRuntimeId,
} from "@/features/ai-work/lib/hostedSandboxRun";

/** An early run event exactly as the hosted stream emits it. */
const RUNTIME_WARNING_EVENT = {
  event: "info",
  data: {
    type: "MatrxRuntimeWarning",
    runtime_id: "rt_9f2c4b7a",
    message: "This sandbox stops when the run ends.",
  },
} as unknown as TypedStreamEvent;

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

function click(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => (candidate.textContent ?? "").includes(text),
  );
  if (!button) throw new Error(`No button containing "${text}" was rendered.`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  apiPost.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the hosted run's Stop control", () => {
  it("reads the runtime id out of the stream event the run reports", () => {
    expect(readHostedRuntimeId(RUNTIME_WARNING_EVENT)).toBe("rt_9f2c4b7a");
  });

  it("renders nothing while no hosted run is in flight", () => {
    render(<HostedRunControls running={false} runtimeId="rt_9f2c4b7a" />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("is present while a run is in flight and says what stopping ends", () => {
    const runtimeId = readHostedRuntimeId(RUNTIME_WARNING_EVENT);
    render(<HostedRunControls running runtimeId={runtimeId} />);
    expect(container.textContent).toContain("Stop the hosted session");
    expect(container.textContent).toContain("Matrx Sandbox");
    expect(container.textContent).toContain("anything in progress is lost");
  });

  it("stays honest — no button — until the sandbox reports the run id", () => {
    render(<HostedRunControls running runtimeId={null} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.textContent).toContain(
      "Stopping becomes available the moment it does",
    );
  });

  it("calls the cancel door with the runtime id the stream reported", async () => {
    apiPost.mockResolvedValue({
      data: { runtime_id: "rt_9f2c4b7a", cancelled: true },
      meta: {},
    });
    const onCancelled = jest.fn();
    const runtimeId = readHostedRuntimeId(RUNTIME_WARNING_EVENT);
    render(
      <HostedRunControls
        running
        runtimeId={runtimeId}
        onCancelled={onCancelled}
      />,
    );

    click("Stop the hosted session");
    await act(async () => {
      await Promise.resolve();
    });

    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost.mock.calls[0][0]).toBe(
      HOSTED_CANCEL_PATH.replace("{runtime_id}", "rt_9f2c4b7a"),
    );
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("surfaces the server's own sentence when the stop is refused", async () => {
    apiPost.mockRejectedValue(new Error("That runtime is already finished."));
    render(<HostedRunControls running runtimeId="rt_9f2c4b7a" />);

    click("Stop the hosted session");
    await act(async () => {
      await Promise.resolve();
    });

    expect(toastError).toHaveBeenCalledWith(
      "The hosted session could not be stopped — That runtime is already finished.",
    );
  });
});
