import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MarkdownTableScrollArea } from "../MarkdownTableScrollArea";
import { TooltipProvider } from "@/components/ui/tooltip";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let notifyResize: (() => void) | undefined;

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    notifyResize = () => callback([], this as unknown as ResizeObserver);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("MarkdownTableScrollArea", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    global.ResizeObserver = ResizeObserverMock;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows directional controls only for overflow and scrolls by the viewport", () => {
    act(() => {
      root.render(
        <TooltipProvider>
          <MarkdownTableScrollArea>
            <table>
              <tbody>
                <tr>
                  <td>Wide table</td>
                </tr>
              </tbody>
            </table>
          </MarkdownTableScrollArea>
        </TooltipProvider>,
      );
    });

    const area = host.querySelector("[data-markdown-table-scroll-area]")!;
    const viewport = area.firstElementChild as HTMLDivElement;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1000 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    viewport.scrollBy = jest.fn();

    act(() => notifyResize?.());

    const left = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll table left"]',
    )!;
    const right = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Scroll table right"]',
    )!;
    expect(left.disabled).toBe(true);
    expect(right.disabled).toBe(false);

    act(() => right.click());
    expect(viewport.scrollBy).toHaveBeenCalledWith({
      left: 300,
      behavior: "smooth",
    });

    viewport.scrollLeft = 600;
    act(() => viewport.dispatchEvent(new Event("scroll")));
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Scroll table left"]',
      )!.disabled,
    ).toBe(false);
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Scroll table right"]',
      )!.disabled,
    ).toBe(true);
  });
});
