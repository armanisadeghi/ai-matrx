import { act } from "react";
import { createRoot } from "react-dom/client";

import { INITIAL_RUN_STATE } from "../types";
import { LiveProgressRail } from "./LiveProgressRail";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("LiveProgressRail", () => {
  it("renders terminal failure truth without success-like progress", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() =>
      root.render(
        <LiveProgressRail
          state={{
            ...INITIAL_RUN_STATE,
            status: "error",
            progress: 99,
            stages: [
              {
                stage: "prepare_content",
                label: "Preparing content",
                status: "failed",
                step: 0,
                total: 1,
              },
            ],
          }}
          startedAt={null}
        />,
      ),
    );

    expect(container.textContent).toContain("Finished with errors");
    expect(container.textContent).toContain("Stopped");
    expect(container.textContent).toContain("0 completed · 1 failed");
    expect(container.textContent).not.toContain("99%");
    expect(container.textContent).not.toContain("1 of 1 steps done");

    act(() => root.unmount());
  });

  it("preserves a failed prepare stage after it was rendered live", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const runningStage = {
      stage: "prepare_content",
      label: "Preparing content",
      status: "running" as const,
      step: 0,
      total: 1,
    };

    act(() =>
      root.render(
        <LiveProgressRail
          state={{
            ...INITIAL_RUN_STATE,
            status: "running",
            stages: [runningStage],
          }}
          startedAt={null}
        />,
      ),
    );
    expect(container.textContent).toContain("Analyzing your content");

    act(() =>
      root.render(
        <LiveProgressRail
          state={{
            ...INITIAL_RUN_STATE,
            status: "error",
            progress: 99,
            stages: [{ ...runningStage, status: "failed" }],
          }}
          startedAt={null}
        />,
      ),
    );

    expect(container.textContent).toContain("0 completed · 1 failed");
    expect(container.textContent).not.toContain("1 of 1 steps done");

    act(() => root.unmount());
  });
});
