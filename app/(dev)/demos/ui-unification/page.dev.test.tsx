import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import UiUnificationPage from "./page.dev";
import { DECISIONS } from "./_components/decisions";
import { TooltipProvider } from "@/components/ui/tooltip";

const STORAGE_KEY = "ui-unification-decisions-v1";

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("UiUnificationPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <TooltipProvider>
          <UiUnificationPage />
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
    expect(container.querySelectorAll("section")).toHaveLength(DECISIONS.length);
    expect(container.textContent).toContain(`0 of ${DECISIONS.length} decided`);
    unmount();
  });

  it("persists a pick across a remount and clears it", () => {
    mount();
    const firstRadio = () =>
      container.querySelector<HTMLButtonElement>('section#D0 [role="radio"]')!;
    act(() => firstRadio().click());
    expect(firstRadio().getAttribute("aria-checked")).toBe("true");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored.D0.winner).toBe("a");
    unmount();

    mount();
    expect(firstRadio().getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain(`1 of ${DECISIONS.length} decided`);
    const clear = Array.from(
      container.querySelectorAll<HTMLButtonElement>("section#D0 button"),
    ).find((b) => b.textContent === "Clear")!;
    act(() => clear.click());
    expect(firstRadio().getAttribute("aria-checked")).toBe("false");
    unmount();
  });

  it("still renders when storage throws", () => {
    const spy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    mount();
    expect(container.querySelectorAll("section")).toHaveLength(DECISIONS.length);
    unmount();
    spy.mockRestore();
  });
});
