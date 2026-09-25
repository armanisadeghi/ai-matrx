import { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("next/dynamic", () => () => {
  return function MarkdownStub({ content }: { content: string }) {
    return <div data-markdown-stub>{content}</div>;
  };
});

import { ExtractionCellDisplay } from "./ExtractionCellDisplay";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderCell(value: string, onView = jest.fn()) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(<ExtractionCellDisplay value={value} onView={onView} />);
  });
  return { container, onView, root };
}

describe("ExtractionCellDisplay", () => {
  it("keeps plain prose to two lines and invokes the view-only full-value action", () => {
    const { container, onView, root } = renderCell("A ".repeat(800));

    expect(container.querySelector(".line-clamp-2")).not.toBeNull();
    expect(container.textContent).not.toContain("Show more");
    const open = container.querySelector(
      '[aria-label="Open full value"]',
    ) as HTMLButtonElement;
    act(() => open.click());
    expect(onView).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("caps Markdown cells at the same compact height", () => {
    const { container, root } = renderCell("**Heading**\n\nA long Markdown value");

    const content = container.querySelector(".extraction-cell-markdown");
    expect(content?.className).toContain("max-h-10");
    expect(content?.className).toContain("overflow-hidden");
    expect(container.querySelector("[data-markdown-stub]")?.textContent).toContain(
      "Heading",
    );

    act(() => root.unmount());
  });

  it("summarizes a structured value and opens the JSON viewer instead of printing raw JSON", () => {
    const value = '[{"kind":"depends_on","rule_id":"first"}]';
    const { container, onView, root } = renderCell(value);
    expect(container.textContent).toContain("1 item");
    expect(container.textContent).not.toContain("depends_on");
    const open = container.querySelector('[aria-label="Open JSON value"]') as HTMLButtonElement;
    act(() => open.click());
    expect(onView).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
