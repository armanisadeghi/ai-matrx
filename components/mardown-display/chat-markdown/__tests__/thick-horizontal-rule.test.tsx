import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/markdown-core/MarkdownCore", () => {
  const actual = jest.requireActual(
    "@/components/markdown-core/MarkdownCoreImpl",
  ) as typeof import("@/components/markdown-core/MarkdownCoreImpl");
  return { __esModule: true, default: actual.default };
});

import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import BasicMarkdownContent from "../BasicMarkdownContent";

const NOTE = `# Side by side comparison

a
===
a
***
a
---
a
#===
a

===
Here's the runbook. Do it in this order.

\`\`\`
===
\`\`\`
`;

function renderMarkdown(content: string): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <BasicMarkdownContent content={content} showCopyButton={false} />,
    );
  });
  return { container, root };
}

describe("standalone === thick rule", () => {
  let mounted: { container: HTMLDivElement; root: Root } | null = null;

  afterEach(() => {
    if (!mounted) return;
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = null;
  });

  it("draws a thick rule for === and never the sentinel token", () => {
    mounted = renderMarkdown(NOTE);
    const text = mounted.container.textContent ?? "";
    expect(text).not.toContain("THICK_HR");
    expect(text).toContain("Here's the runbook. Do it in this order.");
    expect(text).toContain("Side by side comparison");

    const thick = [...mounted.container.querySelectorAll("hr")].filter((hr) =>
      hr.className.includes("h-[3px]"),
    );
    expect(thick).toHaveLength(2);

    const code = mounted.container.querySelector("code");
    expect(code?.textContent).toContain("===");
    expect(code?.textContent).not.toContain("THICK_HR");
  });

  it("keeps === inside note text blocks after the notes splitter", () => {
    const blocks = splitContentIntoBlocksV2(NOTE);
    expect(blocks.some((block) => block.type === "accent-divider")).toBe(true);
    expect(blocks.some((block) => block.type === "heavy-divider")).toBe(true);

    const text = blocks
      .filter((block) => block.type === "text")
      .map((block) => block.content)
      .join("\n\n");
    expect(text).toContain("===");
    expect(text).not.toContain("***");
    expect(text).not.toContain("#===");

    mounted = renderMarkdown(text);
    const rendered = mounted.container.textContent ?? "";
    expect(rendered).not.toContain("THICK_HR");
    expect(rendered).toContain("Here's the runbook. Do it in this order.");
    const thick = [...mounted.container.querySelectorAll("hr")].filter((hr) =>
      hr.className.includes("h-[3px]"),
    );
    expect(thick).toHaveLength(2);
  });
});
