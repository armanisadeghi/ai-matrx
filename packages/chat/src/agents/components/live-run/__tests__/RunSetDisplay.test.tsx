import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mockUseFloatingLiveRun = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => [{ id: "run-1" }],
}));

jest.mock("@/features/overlays/openers/liveRunWindow", () => ({
  useFloatingLiveRun: (options: unknown) => mockUseFloatingLiveRun(options),
}));

import { RunSetWindowController } from "../RunSetDisplay";

describe("RunSetWindowController", () => {
  beforeEach(() => {
    mockUseFloatingLiveRun.mockClear();
  });

  it("uses one overlay identity for every controller bound to the same run set", () => {
    const setKey = "content-plan-ai:site-1:page-step:node-1";

    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <>
          <RunSetWindowController
            setKey={setKey}
            instanceId="page-content:node-1"
            label="Page content"
          />
          <RunSetWindowController
            setKey={setKey}
            instanceId="page-step:node-1"
            label="Page pipeline step"
          />
        </>,
      );
    });

    expect(mockUseFloatingLiveRun).toHaveBeenCalledTimes(2);
    expect(
      mockUseFloatingLiveRun.mock.calls.map(([options]) => options.instanceId),
    ).toEqual([
      `run-set:${setKey}`,
      `run-set:${setKey}`,
    ]);
    act(() => root.unmount());
  });
});
