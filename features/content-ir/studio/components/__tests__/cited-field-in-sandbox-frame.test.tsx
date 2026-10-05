/**
 * @jest-environment jsdom
 *
 * Live 2026-10-05: a saved-result citation opened /shapes/study_summary/
 * instances?i=…&field=summary — the instance renders in its sandboxed kind
 * frame, which this page cannot search, so no ring appeared anywhere. The
 * cited place is then shown, ringed, above the frame.
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import CitedFieldHighlight from "../CitedFieldHighlight";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = () => {};

function render(ui: ReactNode): { container: HTMLElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(ui);
  });
  return { container };
}

const data = { title: "Photosynthesis in Kelp Forests", sections: [{ heading: "Light" }] };

describe("a cited field the page cannot reach", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("is shown ringed above an instance rendered in a sandbox frame", () => {
    const { container } = render(
      <CitedFieldHighlight field="summary" data={data}>
        <iframe title="Study Summary — component" />
      </CitedFieldHighlight>,
    );
    act(() => {
      jest.advanceTimersByTime(300);
    });
    const marked = container.querySelector("[data-cited-field='summary']");
    expect(marked).not.toBeNull();
    expect(marked?.className).toContain("ring-2");
    expect(marked?.textContent).toContain("Cited · Summary");
  });

  it("rings the element itself when the instance renders in the page", () => {
    const { container } = render(
      <CitedFieldHighlight field="summary" data={data}>
        <div>
          <h2>Photosynthesis in Kelp Forests</h2>
        </div>
      </CitedFieldHighlight>,
    );
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(container.querySelector("h2")?.getAttribute("data-cited-field")).toBe("summary");
    expect(container.textContent).not.toContain("Cited · Summary");
  });
});
