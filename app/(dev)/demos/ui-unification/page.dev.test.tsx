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

  it("renders one card per decision with live specimens", () => {
    mount();
    expect(container.querySelectorAll("section")).toHaveLength(DECISIONS.length);
    expect(container.textContent).toContain(`0 of ${DECISIONS.length} decided`);
    unmount();
  });

  it("persists a pick across a remount and un-picks on a second click", () => {
    mount();
    const firstPick = () =>
      container.querySelector<HTMLButtonElement>("section#D1 button[aria-pressed]")!;
    act(() => firstPick().click());
    expect(firstPick().getAttribute("aria-pressed")).toBe("true");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored.D1.winner).toBe("a");
    unmount();

    mount();
    expect(firstPick().getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain(`1 of ${DECISIONS.length} decided`);
    act(() => firstPick().click());
    expect(firstPick().getAttribute("aria-pressed")).toBe("false");
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
