import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// XML prose now renders through the shared prose leaf (BasicMarkdownContent),
// whose table scroll area observes its size; jsdom has no ResizeObserver.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

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
    // The ```xml fence inside the prose is content INSIDE content: it renders
    // one level deeper through the same core — as its own XML card, exactly
    // as a top-level ```xml fence does — and its payload stays literal text:
    // no <script> element, no kind promotion.
    const nested = [
      ...container.querySelectorAll('[data-rich-content="standard"]'),
    ].map((el) => el.textContent ?? "");
    expect(nested.some((t) => t.includes("literal-rich-payload"))).toBe(true);
    expect(nested.some((t) => t.includes('"__kind":"artifact"'))).toBe(true);
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
    expect(container.querySelector("[data-xml-card-body]")).toBeNull();
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

  it("uses the outer XML element as the collapsible card title instead of rendering wrapper tags in the body", () => {
    act(() => {
      root.render(<XmlBlock content={XML_WITH_MARKDOWN} />);
    });

    const title = container.querySelector<HTMLButtonElement>(
      '[aria-label="Collapse db_schema"]',
    );
    const body = container.querySelector<HTMLElement>("[data-xml-card-body]");
    expect(title?.textContent).toBe("db_schema");
    expect(body?.textContent).not.toContain("db_schema");
    expect(body?.textContent).not.toContain("</db_schema>");

    act(() => title?.click());
    expect(container.querySelector("[data-xml-card-body]")).toBeNull();
    expect(
      container.querySelector('[aria-label="Expand db_schema"]'),
    ).not.toBeNull();
  });

  it.each([
    ["an empty paired root", "<empty_root></empty_root>", "empty_root"],
    ["a self-closing root", "<empty_root />", "empty_root"],
  ])("keeps the root name in the header for %s", (_, content, rootName) => {
    act(() => {
      root.render(<XmlBlock content={content} />);
    });

    expect(container.querySelector("[data-xml-root-name]")?.textContent).toBe(
      rootName,
    );
    expect(container.querySelector("[data-xml-card-body]")).not.toBeNull();
    expect(container.querySelector("[data-xml-card-body]")?.textContent).toBe(
      "",
    );
  });

  it("gives every XML action a 44px touch target through tablet widths while preserving compact desktop controls", () => {
    act(() => {
      root.render(
        <XmlBlock
          content={`<report>\n  <relationships>\n    <relationship />\n  </relationships>\n</report>`}
        />,
      );
    });

    const actions = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ];
    expect(actions.map((action) => action.getAttribute("aria-label"))).toEqual([
      "Collapse report",
      "Copy XML",
      "Collapse relationships",
    ]);
    for (const action of actions) {
      expect(action.classList).toContain("size-11");
      expect(action.classList).toContain("lg:size-auto");
      expect(action.classList).not.toContain("-my-2");
    }
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
    // The unclosed inner fence is a pending nested XML card — the tag reads
    // as XML, never as raw fence markup.
    expect(container.textContent).not.toContain("```");
    expect(container.querySelectorAll("[data-xml-card-body]").length).toBe(2);
    expect(container.textContent).toContain("literal");
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

    // Indented code and the ```xml fence stay opaque: the indented line reads
    // as literal text (never an element), the fence becomes a nested XML card
    // whose tag is a token, not markup.
    expect(container.textContent).toContain('const source = "<not-a-tag />";');
    expect(container.querySelector("not-a-tag")).toBeNull();
    expect(container.querySelectorAll("[data-xml-card-body]").length).toBe(2);
    expect(container.textContent).toContain("also-not-a-tag");
    expect(container.querySelector("also-not-a-tag")).toBeNull();
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
