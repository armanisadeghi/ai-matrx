import { act } from "react";
import { createRoot } from "react-dom/client";

import { INITIAL_RUN_STATE } from "@/features/podcasts/generator/types";
import type { UseStudioRun } from "@/features/podcasts/studio/runs/useStudioRun";
import {
  RunRecoveryBanner,
  RunRecoveryBannerFor,
} from "./RunRecoveryBanner";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("RunRecoveryBanner", () => {
  it("does not let legacy flags restore source-gated recovery actions", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const run = {
      state: {
        ...INITIAL_RUN_STATE,
        status: "error",
        error:
          "Content gate failed: only 457 chars of usable content (need ≥ 1000).",
      },
      streaming: false,
      stalled: false,
      backgroundWorking: false,
      canReconnect: true,
      canRerun: true,
      orphaned: false,
      detail: { run_id: "captured-thin-source-run" },
      recovery: {
        kind: "failed",
        canResume: false,
        canRerun: false,
        showBanner: true,
      },
      reconnect: () => undefined,
      rerunFromSource: () => undefined,
    } as unknown as UseStudioRun;

    act(() => root.render(<RunRecoveryBannerFor run={run} />));

    expect(container.textContent).not.toContain("Resume");
    expect(container.textContent).not.toContain("Re-run from source");

    act(() => root.unmount());
  });

  it("does not offer a rerun for a source-gated orphan row", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const run = {
      state: {
        ...INITIAL_RUN_STATE,
        status: "error",
        error:
          "Content gate failed: only 457 chars of usable content (need ≥ 1000).",
      },
      streaming: false,
      stalled: false,
      backgroundWorking: false,
      canReconnect: false,
      canRerun: false,
      orphaned: true,
      detail: null,
      recovery: {
        kind: "stalled",
        canResume: false,
        canRerun: false,
        showBanner: false,
      },
      reconnect: () => undefined,
      rerunFromSource: () => undefined,
    } as unknown as UseStudioRun;

    act(() => root.render(<RunRecoveryBannerFor run={run} />));

    expect(container.textContent).not.toContain("Re-run from source");

    act(() => root.unmount());
  });

  it("renders the terminal error instead of background-working copy", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() =>
      root.render(
        <RunRecoveryBanner
          status="error"
          streaming={false}
          stalled={false}
          backgroundWorking
          canReconnect
          canRerun
          error="Content gate failed: only 457 chars of usable content (need ≥ 1000)."
          onResume={() => undefined}
          onRerun={() => undefined}
        />,
      ),
    );

    expect(container.textContent).toContain(
      "This source is too short to turn into an episode.",
    );
    expect(container.textContent).not.toContain("Still generating in the background");

    act(() => root.unmount());
  });

  it("keeps the background-working banner for a nonterminal run", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() =>
      root.render(
        <RunRecoveryBanner
          status="running"
          streaming={false}
          stalled={false}
          backgroundWorking
          canReconnect={false}
          canRerun={false}
          error={null}
          onResume={() => undefined}
          onRerun={() => undefined}
        />,
      ),
    );

    expect(container.textContent).toContain("Still generating in the background");

    act(() => root.unmount());
  });
});
