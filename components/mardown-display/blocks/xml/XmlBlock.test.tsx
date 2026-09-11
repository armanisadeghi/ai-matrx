import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// MarkdownCore is intentionally exercised through its real implementation;
// only Next's dynamic client boundary is replaced for Jest.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () =>
    jest.requireActual("@/components/markdown-core/MarkdownCoreImpl").default,
}));

import XmlBlock from "./XmlBlock";

const XML_WITH_MARKDOWN = `<?xml version="1.0"?>
<db_schema xmlns:x="urn:example">
  **Core tables** contain \`identity\` data and \`<inline-literal />\`.

  [unsafe link](javascript:alert("never follow"))

  | Table | Purpose |
  | --- | --- |
  | \`users\` | **Identity** |

  <x:relationships>
    - one user has many sessions
    - one session belongs to a user
  </x:relationships>

  \`\`\`xml
  <literal-rich-payload><script>alert("never execute")</script></literal-rich-payload>
  {"__kind":"artifact","content":"stays literal"}
  \`\`\`
  <!-- comment with <unparsed> tags
       across multiple lines -->
  <![CDATA[<opaque><still-not-a-tag /></opaque>]]>
</db_schema>`;

describe("XmlBlock Markdown text rendering", () => {
  let container: HTMLDivElement;
  let root: Root;
  const writeText = jest.fn<Promise<void>, [string]>();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders contiguous XML text through real GFM instead of literal line fragments", () => {
    act(() => {
      root.render(<XmlBlock content={XML_WITH_MARKDOWN} />);
    });

    expect(container.querySelector("strong")?.textContent).toContain(
      "Core tables",
    );
    expect(
      [...container.querySelectorAll("p code")].some(
        (code) => code.textContent === "<inline-literal />",
      ),
    ).toBe(true);
    expect(container.querySelector("table")?.textContent).toContain("Identity");
    expect(
      container.querySelector("a")?.getAttribute("href") ?? "",
    ).not.toMatch(/^javascript:/);
    expect(container.querySelector("ul")?.textContent).toContain(
      "many sessions",
    );
    expect(container.querySelector("pre code")?.textContent).toContain(
      "literal-rich-payload",
    );
    expect(container.querySelector("pre code")?.textContent).toContain(
      '"__kind":"artifact"',
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("comment with <unparsed> tags");
    expect(container.textContent).toContain(
      "<opaque><still-not-a-tag /></opaque>",
    );
    expect(container.textContent).toContain("x:relationships");
  });

  it("keeps XML collapse and raw-copy controls while Markdown content is present", async () => {
    act(() => {
      root.render(<XmlBlock content={XML_WITH_MARKDOWN} />);
    });

    const collapse = container.querySelector<HTMLButtonElement>(
      '[aria-label="Collapse db_schema"]',
    );
    expect(collapse).not.toBeNull();
    act(() => collapse?.click());
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("...");
    const expand = container.querySelector<HTMLButtonElement>(
      '[aria-label="Expand db_schema"]',
    );
    act(() => expand?.click());
    expect(container.querySelector("table")?.textContent).toContain("Identity");

    const copy = container.querySelector<HTMLButtonElement>(
      '[aria-label="Copy XML"]',
    );
    await act(async () => {
      copy?.click();
    });
    expect(writeText).toHaveBeenCalledWith(XML_WITH_MARKDOWN);
  });

  it("leaves an unclosed XML body and an unclosed fenced payload readable while streaming", () => {
    act(() => {
      root.render(
        <XmlBlock
          content={"<root>\n**still streaming**\n```xml\n<literal />"}
        />,
      );
    });

    expect(container.querySelector("strong")?.textContent).toBe(
      "still streaming",
    );
    expect(container.querySelector("pre code")?.textContent).toContain(
      "<literal />",
    );
  });

  it("keeps deeply-indented fences and indented code opaque inside arbitrary XML wrappers", () => {
    act(() => {
      root.render(
        <XmlBlock
          content={`<outer>
    Prose establishes the XML text indentation.

        const source = "<not-a-tag />";
    \`\`\`xml
    <also-not-a-tag />
    \`\`\`
</outer>`}
        />,
      );
    });

    const codeBlocks = [...container.querySelectorAll("pre code")].map(
      (code) => code.textContent,
    );
    expect(codeBlocks.some((code) => code?.includes("<not-a-tag />"))).toBe(
      true,
    );
    expect(codeBlocks).toContain("<also-not-a-tag />\n");
    expect(container.querySelector("script")).toBeNull();
  });

  it("does not turn an escaped backtick into an XML parser boundary", () => {
    act(() => {
      root.render(<XmlBlock content={"<root>\\`<escaped />`\nplain</root>"} />);
    });

    expect(container.textContent).toContain("<escaped />");
    expect(container.textContent).toContain("plain");
  });

  it("leaves malformed XML syntax as Markdown text instead of consuming later markup", () => {
    act(() => {
      root.render(
        <XmlBlock content={"<root>\n  <broken attribute=unquoted>\n</root>"} />,
      );
    });

    expect(container.textContent).toContain("<broken attribute=unquoted>");
    expect(container.textContent).toContain("root");
  });
});
