/**
 * The Preview⇄JSON pill was replaced with one quiet ghost `Braces` button
 * (Arman, 2026-08-25: "It's ugly … It's just horrible"). These assertions
 * pin the new contract so it can't regress back into a visible "Preview"
 * button or a bordered segmented control:
 *
 *  - default render shows exactly one control, labeled "View JSON" — no
 *    "Preview" text/label ever renders;
 *  - clicking it swaps the body to the JSON `<pre>` and relabels the same
 *    button "Back to preview";
 *  - a Copy control appears only while JSON is showing.
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { StructuredValueTabs } from "./StructuredValueTabs";

function mount(props: {
  value: unknown;
  hasSlot?: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <StructuredValueTabs value={props.value}>
        <div data-testid="preview-body">preview content</div>
      </StructuredValueTabs>,
    );
  });
  return { container, root };
}

describe("StructuredValueTabs — single ghost control", () => {
  it("renders exactly one control by default, labeled View JSON, no Preview button", () => {
    const { container } = mount({ value: { a: 1 } });

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("View JSON");
    expect(buttons[0].getAttribute("title")).toBe("View JSON");

    // No visible "Preview" button/label anywhere.
    expect(container.textContent).not.toMatch(/Preview/);
    expect(
      container.querySelector('[aria-label="Preview"]'),
    ).toBeNull();

    // No stray segmented-pill border chrome.
    expect(
      container.querySelector(".rounded-md.border.border-border.bg-muted\\/50"),
    ).toBeNull();

    expect(container.querySelector('[data-testid="preview-body"]')).not.toBeNull();
  });

  it("toggling to JSON swaps the body, relabels the button, and reveals Copy", () => {
    const { container } = mount({ value: { a: 1, b: [1, 2, 3] } });

    const toggle = container.querySelector<HTMLButtonElement>(
      '[aria-label="View JSON"]',
    );
    expect(toggle).not.toBeNull();

    act(() => {
      toggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Body swapped: preview content gone, JSON <pre> present.
    expect(container.querySelector('[data-testid="preview-body"]')).toBeNull();
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain('"a": 1');

    // Same button, new label.
    const back = container.querySelector<HTMLButtonElement>(
      '[aria-label="Back to preview"]',
    );
    expect(back).not.toBeNull();
    expect(container.querySelector('[aria-label="View JSON"]')).toBeNull();

    // Copy control now present.
    expect(container.querySelector('[aria-label="Copy JSON"]')).not.toBeNull();

    // Exactly two controls total while JSON is showing (toggle + copy).
    expect(container.querySelectorAll("button")).toHaveLength(2);

    // Toggling back restores the preview and drops Copy.
    act(() => {
      back!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="preview-body"]')).not.toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });
});
