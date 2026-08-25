import { act } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceViewToggle } from "./WorkspaceViewToggle";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceViewToggle", () => {
  it("keeps every ratified mode name visible and accessible", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onChange = jest.fn();

    act(() =>
      root.render(<WorkspaceViewToggle mode="studio" onChange={onChange} />),
    );

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Current",
      "Plan",
      "Studio",
    ]);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Current — everything observed on the page today",
      "Plan — everything you intend: targets, drafts, tasks",
      "Studio — Current and Plan side by side",
    ]);
    expect(buttons[2]?.getAttribute("aria-pressed")).toBe("true");

    act(() => buttons[1]?.click());
    expect(onChange).toHaveBeenCalledWith("plan");

    act(() => root.unmount());
    container.remove();
  });
});
