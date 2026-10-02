import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CanvasProvider } from "@ai-matrx/canvas/react";

import { CanvasUnavailableBoundary } from "./CanvasUnavailableBoundary";
import { useCanvasOpenGuard } from "@/features/canvas/hooks/useCanvasOpenGuard";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

function Probe({ id }: { id: string }) {
  const { isCanvasAvailable } = useCanvasOpenGuard();
  return <span data-testid={id}>{isCanvasAvailable ? "yes" : "no"}</span>;
}

describe("CanvasUnavailableBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const read = (id: string) =>
    container.querySelector(`[data-testid="${id}"]`)?.textContent;

  it("suppresses impossible nested Canvas actions and leaves the rest of the page its canvas", () => {
    act(() => {
      root.render(
        <CanvasProvider persistence={null} hotkeys={false}>
          <Probe id="outside" />
          <CanvasUnavailableBoundary>
            <Probe id="inside" />
          </CanvasUnavailableBoundary>
        </CanvasProvider>,
      );
    });
    expect(read("outside")).toBe("yes");
    expect(read("inside")).toBe("no");
  });

  it("restores availability once the immersive viewer is gone", () => {
    const tree = (immersive: boolean) => (
      <CanvasProvider persistence={null} hotkeys={false}>
        {immersive ? (
          <CanvasUnavailableBoundary>
            <Probe id="probe" />
          </CanvasUnavailableBoundary>
        ) : (
          <Probe id="probe" />
        )}
      </CanvasProvider>
    );
    act(() => root.render(tree(true)));
    expect(read("probe")).toBe("no");
    act(() => root.render(tree(false)));
    expect(read("probe")).toBe("yes");
  });
});
