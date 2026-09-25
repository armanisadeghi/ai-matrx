/**
 * RC-B2 verification findings (common-docs rich-content-unification
 * evidence/verify-RC-B2.md) — each a failing test before its fix.
 *
 *  1. A partial tag (`<inf`, `<thinkin`) became an "XML block" whose body was
 *     itself; XmlBlock rendered that body nested, which split into the same
 *     block again — four empty XML cards and a depth-cap notice, and "Render
 *     it" nested four more. Recursion on identical content must be impossible
 *     by construction, and a fragment is text (pending while streaming).
 *  2. Same-name sections (`<info>…<info>…</info>…</info>`) closed at the
 *     inner closer; the outer tail and the real `</info>` leaked as raw text.
 *  4. A nested ```markdown document streaming in showed raw table pipes, raw
 *     TeX and raw `**` for a few frames.
 *
 * Use case: a recycling company's operations lead reading the assistant's
 * weekly route summary while it streams.
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

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    const source = String(loader);
    if (source.includes("MarkdownCoreImpl")) {
      return jest.requireActual("@/components/markdown-core/MarkdownCoreImpl")
        .default;
    }
    if (source.includes("RichContentStandardImpl")) {
      return jest.requireActual(
        "@/components/rich-content/RichContentStandardImpl",
      ).default;
    }
    return function Unloaded() {
      return null;
    };
  },
}));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({
  InlineCopyButton: () => null,
}));
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code, language }: { code: string; language: string }) => (
    <pre data-code-block={language}>{code}</pre>
  ),
}));

import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { RichContent } from "@/components/rich-content/RichContent";
import { NestedRichContent } from "@/components/rich-content/standard/NestedRichContent";
import { RichContentDepthProvider } from "@/components/rich-content/depth";
import { healStreamingTail } from "@/components/rich-content/standard/stream-holdback";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
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
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("1 — a partial tag is never an XML block that contains itself", () => {
  it.each([
    ["Some intro text.\n\n<inf", "<inf"],
    ["Route board ready.\n<thinkin", "<thinkin"],
  ])("static %j renders the fragment once, as text", async (source, fragment) => {
    await render(<RichContent level="standard" source={source} />);
    expect(container.querySelectorAll("[data-xml-card-body]")).toHaveLength(0);
    expect(container.querySelector("[data-rich-content-capped]")).toBeNull();
    const text = container.textContent ?? "";
    expect(text.split(fragment)).toHaveLength(2);
  });

  it("while streaming the fragment is pending — nothing of it shows", async () => {
    await render(
      <RichContent level="standard" source={"Some intro text.\n\n<inf"} isStreaming />,
    );
    expect(container.textContent).toContain("Some intro text.");
    expect(container.textContent).not.toContain("<inf");
    expect(container.querySelectorAll("[data-xml-card-body]")).toHaveLength(0);
  });

  it("a nested render of the same text as a section it sits inside is refused, even past a Render-it reset", async () => {
    const body = "<route_note>\nNorth Industrial runs **Tuesday**.\n</route_note>";
    await render(
      <RichContentDepthProvider depth={0} cap={3}>
        <NestedRichContent source={body} />
      </RichContentDepthProvider>,
    );
    // The legitimate card renders once …
    expect(container.querySelectorAll("[data-xml-card-body]")).toHaveLength(1);
    expect(container.querySelector("[data-rich-content-self-nested]")).toBeNull();
    // … and re-entering the same source from inside a section that already
    // renders it is refused — rendered once, as text.
    await render(
      <RichContentDepthProvider depth={0} cap={3} source={body}>
        <NestedRichContent source={body} />
      </RichContentDepthProvider>,
    );
    expect(container.querySelectorAll("[data-rich-content-self-nested]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-xml-card-body]")).toHaveLength(0);
  });
});

describe("2 — same-name sections balance", () => {
  const SOURCE =
    "<info>\nTipping fees rise **4%**.\n<info>\nCounty landfill only.\n</info>\nApplies from October 1.\n</info>\nAnything else?";

  function streamed(source: string, chunk: number) {
    const latest = new Map<string, RenderBlockPayload>();
    const accumulator = new StreamBlockAccumulator("same-name", (payload) => {
      latest.set(payload.block.blockId, payload.block);
      return payload;
    });
    const dispatch = (action: unknown) => action;
    for (let i = 0; i < source.length; i += chunk)
      accumulator.ingest(source.slice(i, i + chunk), dispatch);
    accumulator.finalize(dispatch);
    return [...latest.values()]
      .sort((a, b) => a.blockIndex - b.blockIndex)
      .filter((b) => (b.content ?? "").trim())
      .map((b) => ({ type: b.type, content: (b.content ?? "").trim() }));
  }

  const EXPECTED = [
    {
      type: "info",
      content:
        "Tipping fees rise **4%**.\n<info>\nCounty landfill only.\n</info>\nApplies from October 1.",
    },
    { type: "text", content: "Anything else?" },
  ];

  it("static splitter closes the OUTER section on its own closer", () => {
    const blocks = splitContentIntoBlocksV2(SOURCE)
      .filter((b) => b.content.trim())
      .map((b) => ({ type: b.type, content: b.content.trim() }));
    expect(blocks).toEqual(EXPECTED);
  });

  it.each([1, 5, 17])("live accumulator agrees at chunk size %i", (chunk) => {
    expect(streamed(SOURCE, chunk)).toEqual(EXPECTED);
  });

  it("renders with no raw closer anywhere", async () => {
    await render(<RichContent level="standard" source={SOURCE} />);
    expect(container.textContent).not.toContain("</info>");
    expect(container.textContent).toContain("Applies from October 1.");
  });
});

describe("4 — a nested document streaming in never shows raw markup", () => {
  const F = "```";
  const frames = [
    `Summary:\n\n${F}markdown\n# Week 39\n\n| Route | Tons |`,
    `Summary:\n\n${F}markdown\n# Week 39\n\n| Route | Tons |\n|---|---|\n| North Industrial | 22`,
    `Summary:\n\n${F}markdown\n# Week 39\n\nDiversion $$\\int_0^1 x`,
    `Summary:\n\n${F}markdown\n# Week 39\n\nLoad factor \\(\\frac{22.5}{30`,
    `Summary:\n\n${F}markdown\n# Week 39\n\nThe **bus`,
  ];

  it.each(frames)("frame %#", async (frame) => {
    await render(<RichContent level="standard" source={frame} isStreaming />);
    const text = container.textContent ?? "";
    expect(text).toContain("Week 39");
    for (const raw of ["|", "$", "\\int", "\\frac", "\\(", "**"]) {
      expect(text).not.toContain(raw);
    }
  });

  it("the holdback keeps what is complete and never touches currency", () => {
    expect(healStreamingTail("Paid $5 and $10.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3")).toBe(
      "Paid $5 and $10.\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    );
    expect(healStreamingTail("Paid $5 and $10 today")).toBe("Paid $5 and $10 today");
  });
});
