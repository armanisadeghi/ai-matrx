/**
 * FORCING FUNCTION: content INSIDE content renders formatted, through the same
 * core, depth-bounded — in the real chat engine (full level) and at the
 * standard level.
 *
 * The breaks this catches (each fails on the pre-RC-B2 code):
 *  - an <info> section whose body carries a ```markdown document rendered
 *    that document as a highlighted code snippet — its table and math showed
 *    as raw `| … |` / `\(…\)` source (block-dispatch sent section bodies to
 *    the bare prose leaf, which never splits blocks);
 *  - prose between tags in an XML card rendered through a GFM-only preset, so
 *    `\(…\)` math printed as source;
 *  - nesting had no depth guard at all: `MarkdownKindBlock` mounted the full
 *    engine recursively without bound.
 *
 * Use case: a recycling company's operations lead asks the assistant for the
 * weekly route summary as a pasteable markdown document, with an <info>
 * section about the landfill tipping-fee change.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const mockState = () => ({
  activeRequests: { byRequestId: {} },
  conversations: { byConversationId: {} },
  instanceUIState: { byConversationId: {} },
  messages: { byId: {}, byConversationId: {} },
});
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (value: unknown) => unknown) =>
    selector(mockState()),
  useAppDispatch: () => () => undefined,
}));

// Only Next's dynamic boundaries are replaced: the markdown core and the
// engine's BlockRenderer load their REAL implementations.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    const source = String(loader);
    if (source.includes("MarkdownCoreImpl")) {
      return jest.requireActual("@/components/markdown-core/MarkdownCoreImpl")
        .default;
    }
    if (source.includes("block-registry/BlockRenderer")) {
      const { BlockRenderer } = jest.requireActual(
        "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer",
      ) as { BlockRenderer: React.ComponentType<Record<string, unknown>> };
      return function DynamicBlockRenderer(props: Record<string, unknown>) {
        return React.createElement(BlockRenderer, props);
      };
    }
    if (source.includes("RichContentStandardImpl")) {
      return jest.requireActual("@/components/rich-content/RichContentStandardImpl")
        .default;
    }
    return () => null;
  },
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));

// The engine's block registry, trimmed to the REAL components this test is
// about; every other block component is a named stub.
jest.mock(
  "@/components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry",
  () => {
    const real = {
      BasicMarkdownContent: jest.requireActual(
        "@/components/mardown-display/chat-markdown/BasicMarkdownContent",
      ).default,
      MarkdownPreviewBlock: jest.requireActual(
        "@/components/mardown-display/blocks/markdown-preview/MarkdownPreviewBlock",
      ).default,
      XmlBlock: jest.requireActual("@/components/mardown-display/blocks/xml/XmlBlock")
        .default,
    };
    const stub = (name: string) => {
      const Component = (props: { children?: React.ReactNode }) =>
        React.createElement("div", { "data-stub": name }, props.children);
      Component.displayName = name;
      return Component;
    };
    const proxy = new Proxy(real, {
      get: (target, prop) =>
        typeof prop === "string"
          ? ((target as Record<string, unknown>)[prop] ?? stub(prop))
          : undefined,
    });
    return { __esModule: true, BlockComponents: proxy, LoadingComponents: proxy };
  },
);
// The highlighter/editor is a heavy lazy engine; the fence's code and language
// are what this test reads.
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code, language }: { code: string; language: string }) => (
    <pre data-code-block={language}>{code}</pre>
  ),
}));
jest.mock("@/features/canvas/materialization/CodeBlockWithContextAttach", () => ({
  CodeBlockWithContextAttach: ({ code, language }: { code: string; language: string }) => (
    <pre data-code-block={language}>{code}</pre>
  ),
}));
jest.mock("@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/components/mardown-display/chat-markdown/internal-handlers/ToolHandlers", () => ({
  InlineToolCard: () => null,
  DbToolCard: () => null,
  InlineToolBatch: () => null,
  DbToolBatch: () => null,
}));
jest.mock(
  "@/components/mardown-display/chat-markdown/internal-handlers/InlineStatusIndicator",
  () => ({ InlineStatusIndicator: () => null }),
);
jest.mock(
  "@/components/mardown-display/chat-markdown/internal-handlers/InlineThinkingSlot",
  () => ({ InlineThinkingSlot: () => null }),
);
jest.mock(
  "@/components/mardown-display/chat-markdown/internal-handlers/InlineAssistantError",
  () => ({ InlineAssistantError: () => null }),
);

import { EnhancedChatMarkdownInternal } from "@/components/mardown-display/chat-markdown/EnhancedChatMarkdown";
import XmlBlock from "@/components/mardown-display/blocks/xml/XmlBlock";
import { RichContent } from "@/components/rich-content/RichContent";
import { NestedRichContent } from "@/components/rich-content/standard/NestedRichContent";
import { RichContentDepthProvider } from "@/components/rich-content/depth";

const F = "```";

const ROUTE_DOC = `# Week 39 route summary

| Route | Pickups | Tons |
|---|---|---|
| North Industrial | 14 | 22.5 |
| Harbor Commercial | 9 | 11.0 |

Diversion rate: \\(\\frac{33.5}{41.2}\\)

${F}bash
pnpm routes:export --week 39
${F}`;

const MESSAGE = `Here is the summary.

<info>
Tipping fees rise **4%** on October 1.

${F}markdown
${ROUTE_DOC}
${F}
</info>

Anything else for Thursday's crew?`;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(node: React.ReactElement) {
  await act(async () => {
    root.render(node);
  });
  // Lazy code blocks resolve on the next tick.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function assertRouteDocRendered(scope: Element) {
  const table = scope.querySelector("table");
  expect(table).not.toBeNull();
  expect(table?.textContent).toContain("Harbor Commercial");
  // Math inside the nested document renders through KaTeX, not as source.
  const tex = [...scope.querySelectorAll("annotation")].map((a) => a.textContent);
  expect(tex).toContain("\\frac{33.5}{41.2}");
  // The nested ```bash fence is its own code block — never raw fence markup.
  expect(
    [...scope.querySelectorAll("pre, code")].some((el) =>
      (el.textContent ?? "").includes("pnpm routes:export --week 39"),
    ),
  ).toBe(true);
  expect(scope.textContent).not.toContain(`${F}bash`);
  expect(scope.textContent).not.toContain("| Route |");
}

describe("nested content renders through the same core", () => {
  it("full level: an <info> section carrying a ```markdown document renders its table, math and code", async () => {
    await render(<EnhancedChatMarkdownInternal content={MESSAGE} hideCopyButton />);
    const section = container.querySelector('[data-rich-content="standard"]');
    expect(section).not.toBeNull();
    assertRouteDocRendered(section!);
    expect(section?.querySelector("strong")?.textContent).toBe("4%");
    // The closing sentence stays top-level prose, outside the section.
    expect(section?.textContent).not.toContain("Thursday's crew");
    expect(container.textContent).toContain("Anything else for Thursday's crew?");
  });

  it("standard level: the same message renders the same nested document", async () => {
    await render(<RichContent level="standard" source={MESSAGE} />);
    assertRouteDocRendered(container);
    expect(container.textContent).toContain("Anything else for Thursday's crew?");
  });

  it("prose between XML tags renders math and fenced code, not source", async () => {
    await render(
      <XmlBlock
        content={`<route_note>\nDiversion: \\(\\frac{33.5}{41.2}\\)\n\n${F}bash\npnpm routes:export\n${F}\n</route_note>`}
      />,
    );
    const tex = [...container.querySelectorAll("annotation")].map((a) => a.textContent);
    expect(tex).toContain("\\frac{33.5}{41.2}");
    expect(container.querySelector('[data-code-block="bash"], pre code')).not.toBeNull();
    expect(container.textContent).not.toContain("\\(");
  });
});

describe("depth guard", () => {
  // Five sections deep; cap 3 renders three and shows the rest as text with a
  // visible way to render it.
  const deep = `<info>\nLevel one **bold**\n<info>\nLevel two\n<info>\nLevel three\n<info>\nLevel four **still text**\n</info>\n</info>\n</info>\n</info>`;

  it("stops at the cap with plain text and an open affordance, then renders on demand", async () => {
    await render(
      <RichContentDepthProvider depth={0} cap={3}>
        <NestedRichContent source={deep.replace(/^<info>\n|<\/info>$/g, "")} />
      </RichContentDepthProvider>,
    );
    const capped = container.querySelector("[data-rich-content-capped]");
    expect(capped).not.toBeNull();
    // Below the cap: formatted. At the cap: the source, verbatim.
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(capped?.textContent).toContain("Level four **still text**");
    const button = [...capped!.querySelectorAll("button")].find((b) =>
      /render/i.test(b.textContent ?? ""),
    );
    expect(button).toBeDefined();
    await act(async () => {
      button!.click();
    });
    expect(container.querySelector("[data-rich-content-capped]")).toBeNull();
    expect(
      [...container.querySelectorAll("strong")].map((s) => s.textContent),
    ).toContain("still text");
  });

  it("a larger cap renders the same nesting fully formatted", async () => {
    await render(
      <RichContentDepthProvider depth={0} cap={6}>
        <NestedRichContent source={deep.replace(/^<info>\n|<\/info>$/g, "")} />
      </RichContentDepthProvider>,
    );
    expect(container.querySelector("[data-rich-content-capped]")).toBeNull();
    expect(
      [...container.querySelectorAll("strong")].map((s) => s.textContent),
    ).toEqual(["bold", "still text"]);
  });
});

describe("streaming partial input", () => {
  it("an unclosed inner fence inside a streaming ```markdown fence renders as a pending code block", async () => {
    const partial = `Draft:\n\n${F}markdown\n# Week 39\n\n${F}bash\npnpm routes:export --we`;
    await render(<RichContent level="standard" source={partial} isStreaming />);
    expect(container.textContent).not.toContain(F);
    // The heading may carry the core's quiet "#" anchor link after its text.
    expect(container.querySelector("h1")?.textContent).toMatch(/^Week 39#?$/);
    const code = container.querySelector('[data-code-block="bash"], pre');
    expect(code?.textContent).toContain("pnpm routes:export --we");
  });

  it("a half-arrived tag and a half-typed fence marker never print as text", async () => {
    await render(
      <RichContent level="standard" source={"Route board ready.\n<inf"} isStreaming />,
    );
    expect(container.textContent).toContain("Route board ready.");
    expect(container.textContent).not.toContain("<inf");
    await render(
      <RichContent level="standard" source={"Route board ready.\n``"} isStreaming />,
    );
    expect(container.textContent).not.toContain("``");
  });
});
