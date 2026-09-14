import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TableToolbarAction } from "./TableToolbarAction";

jest.mock("@ai-matrx/tap-target", () => ({
  TapTargetButton: ({ ariaLabel, icon }: { ariaLabel: string; icon: React.ReactNode }) => (
    <button type="button" aria-label={ariaLabel}>{icon}</button>
  ),
  TapTargetButtonTransparent: ({ ariaLabel, icon }: { ariaLabel: string; icon: React.ReactNode }) => (
    <button type="button" aria-label={ariaLabel}>{icon}</button>
  ),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TableToolbarAction", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("passes the actual action SVG to the tap target at the canonical 20px size", () => {
    act(() => {
      root.render(
        <TableToolbarAction ariaLabel="Edit" onClick={() => undefined}>
          <svg className="matrx-tap-icon" aria-hidden="true" />
        </TableToolbarAction>,
      );
    });

    const button = host.querySelector<HTMLButtonElement>("button[aria-label='Edit']");
    const icon = button?.querySelector<SVGSVGElement>("svg.matrx-tap-icon");
    expect(icon).not.toBeNull();
    expect(icon?.className.baseVal).toContain("!h-5");
    expect(icon?.className.baseVal).toContain("!w-5");
    expect(button?.querySelector("span")).toBeNull();
  });
});
