/**
 * Guard: a floating run whose launch is REFUSED before any stream exists must
 * stop saying "Starting…" and show the reason in its window.
 *
 * The incident (Spaces "Build with AI", 2026-10-07): `spaces.build` had no
 * Holder in the person's organization, the resolution door answered 409
 * `mandate_unfulfilled`, the run rejected — and the LiveRunWindow stayed at
 * "Building your Space — Starting…" forever, because nothing ever told the
 * window the launch had failed. Every `useFloatingAgentRun` caller and every
 * `useFloatingRunWindow().start()` caller shared that hole.
 *
 * SUT: the REAL `useFloatingAgentRun` / `useFloatingRunWindow`. Only the
 * launcher (`useLiveAgentRun`), the instance handle and the window opener are
 * stand-ins, and the opener records every patch the hook sends the window.
 *
 * Proven failing before passing: against the pre-fix hook the first case sees
 * the window's last state `{pending: true}` with no `failure`, and `settle`
 * does not exist.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { HeadlessAgentRunError } from "../useHeadlessAgentJson";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

type WindowState = Record<string, unknown>;
const windows: { state: WindowState; closed: boolean }[] = [];

jest.mock("../../../host/window-openers", () => ({
  useOpenLiveRunWindow: () => (opts: WindowState) => {
    const w = { state: { ...opts }, closed: false };
    windows.push(w);
    return {
      instanceId: String(opts.instanceId ?? "w"),
      update: (patch: WindowState) => {
        w.state = { ...w.state, ...patch };
      },
      close: () => {
        w.closed = true;
      },
    };
  },
}));

jest.mock("../useLiveRunHandle", () => ({
  useLiveRunHandle: () => ({ claim: jest.fn(), release: jest.fn() }),
}));

let launch: () => Promise<unknown> = () => Promise.resolve(null);
jest.mock("../useLiveAgentRun", () => ({
  useLiveAgentRun: () => ({
    run: () => launch(),
    isRunning: false,
    error: null,
    conversationId: null,
    activeRequestId: null,
    hasLiveRun: false,
    dismiss: jest.fn(),
  }),
}));

import {
  useFloatingAgentRun,
  useFloatingRunWindow,
  type UseFloatingAgentRun,
  type UseFloatingRunWindow,
} from "../useFloatingAgentRun";

const REFUSAL =
  "Mandate 'spaces.build': no rung answers this job — nothing names a Holder that can run it.";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount<T>(useHook: () => T): { current: T } {
  const ref = { current: null as unknown as T };
  function Probe() {
    ref.current = useHook();
    return null;
  }
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root!.render(<Probe />));
  return ref;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container = null;
  windows.length = 0;
});

describe("a floating run whose launch fails says why", () => {
  it("useFloatingAgentRun: a refused launch leaves the reason, not Starting…", async () => {
    launch = () =>
      Promise.reject(
        new HeadlessAgentRunError("The agent failed before returning a result.", {
          detail: REFUSAL,
        }),
      );
    const hook = mount<UseFloatingAgentRun>(() =>
      useFloatingAgentRun({ instanceId: "spaces-build" }),
    );
    await act(async () => {
      await expect(
        hook.current.run({
          mandateKey: "spaces.build" as never,
          surfaceKey: "spaces-page",
          sourceFeature: "documents",
          label: "Building your Space",
        }),
      ).rejects.toThrow("The agent failed before returning a result.");
    });
    expect(windows).toHaveLength(1);
    expect(windows[0].state.pending).toBe(false);
    expect(windows[0].state.failure).toBe(REFUSAL);
    expect(windows[0].closed).toBe(false);
  });

  it("closing the organization picker closes the window — nothing happened", async () => {
    const cancelled = Object.assign(new Error(""), {
      name: "OrganizationSelectionCancelled",
    });
    launch = () => Promise.reject(cancelled);
    const hook = mount<UseFloatingAgentRun>(() => useFloatingAgentRun());
    await act(async () => {
      await expect(
        hook.current.run({
          mandateKey: "spaces.build" as never,
          surfaceKey: "spaces-page",
          sourceFeature: "documents",
        }),
      ).rejects.toBe(cancelled);
    });
    expect(windows[0].closed).toBe(true);
    expect(windows[0].state.failure).toBeUndefined();
  });

  it("useFloatingRunWindow: settle fails an unbound window and leaves a bound one alone", () => {
    const hook = mount<UseFloatingRunWindow>(() => useFloatingRunWindow());
    const refused = hook.current.start("Reading your work");
    refused.settle("The grading run could not start.");
    expect(windows[0].state).toMatchObject({
      pending: false,
      failure: "The grading run could not start.",
    });

    const streamed = hook.current.start("Reading your work");
    streamed.bind("conversation-1");
    streamed.settle("The grading run could not start.");
    expect(windows[1].state.failure).toBeUndefined();
    expect(windows[1].state.conversationId).toBe("conversation-1");
  });
});
