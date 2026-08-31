import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const dispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
}));

import { setCanvasAvailable } from "@/features/canvas/redux/canvasSlice";
import { CanvasUnavailableBoundary } from "./CanvasUnavailableBoundary";

describe("CanvasUnavailableBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dispatch.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("suppresses impossible nested Canvas actions and restores availability on exit", () => {
    act(() => {
      root.render(
        <CanvasUnavailableBoundary>
          <div>Shared canvas</div>
        </CanvasUnavailableBoundary>,
      );
    });
    expect(dispatch).toHaveBeenCalledWith(setCanvasAvailable(false));

    act(() => root.unmount());
    expect(dispatch).toHaveBeenLastCalledWith(setCanvasAvailable(true));
  });
});
