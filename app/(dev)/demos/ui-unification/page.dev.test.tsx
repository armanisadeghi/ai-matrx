import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState } from "react";
import { DecisionBoardView, type Picks } from "./_components/DecisionBoard";
import { DECISIONS } from "./_components/decisions";
import { TooltipProvider } from "@/components/ui/tooltip";

function Harness() {
  const [picks, setPicks] = useState<Picks>({});
  return (
    <DecisionBoardView
      picks={picks}
      loading={false}
      error={null}
      onChange={(id, patch) => setPicks((p) => ({ ...p, [id]: patch(p[id] ?? {}) }))}
    />
  );
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("DecisionBoardView", () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <TooltipProvider>
          <Harness />
        </TooltipProvider>,
      ),
    );
  };

  const unmount = () => {
    act(() => root.unmount());
    container.remove();
  };

  beforeEach(() => window.localStorage.clear());

  it("renders one section per decision with live specimens", () => {
    mount();
    expect(container.querySelectorAll("section[id^=D]")).toHaveLength(DECISIONS.length);
    expect(container.textContent).toContain(`0 of ${DECISIONS.length} decided`);
    unmount();
  });

  it("records a pick and clears it", () => {
    mount();
    const firstRadio = () =>
      container.querySelector<HTMLButtonElement>('section#D0 [role="radio"]')!;
    act(() => firstRadio().click());
    expect(firstRadio().getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain(`1 of ${DECISIONS.length} decided`);
    expect(container.textContent).toContain(`1 of ${DECISIONS.length} decided`);
    const clear = Array.from(
      container.querySelectorAll<HTMLButtonElement>("section#D0 button"),
    ).find((b) => b.textContent === "Clear")!;
    act(() => clear.click());
    expect(firstRadio().getAttribute("aria-checked")).toBe("false");
    unmount();
  });
});
