/**
 * Math parity across every markdown entry point.
 *
 * The same source must produce the same math — same TeX, same inline/display
 * mode — whether it renders through BasicMarkdownContent (chat),
 * ConfigurableMarkdownContent (flashcards, notes), MarkdownRenderer (legacy
 * flashcard/AI modal) or the file previewer's MarkdownPreview. Currency must
 * stay currency, and code spans/fences must never become math.
 *
 * Renders the REAL pipeline (react-markdown + remark-math + rehype-katex); the
 * only stand-ins are the file blob fetch and the Prism highlighter for
 * MarkdownPreview, the code-editor block and MarkdownRenderer's copy button
 * (none of which touch math).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("@/components/markdown-core/MarkdownCore", () => {
  const actual = jest.requireActual(
    "@/components/markdown-core/MarkdownCoreImpl",
  ) as typeof import("@/components/markdown-core/MarkdownCoreImpl");
  return { __esModule: true, default: actual.default };
});

// One stable blob object per source — a fresh object each render would re-run
// the previewer's read effect forever.
let mockBlobText = "";
const mockBlobs = new Map<string, unknown>();
jest.mock("@/features/files/hooks/useFileBlob", () => ({
  useFileBlob: () => {
    if (!mockBlobs.has(mockBlobText)) {
      const text = mockBlobText;
      mockBlobs.set(text, {
        size: text.length,
        text: () => Promise.resolve(text),
        slice: () => ({ text: () => Promise.resolve(text) }),
      });
    }
    return { blob: mockBlobs.get(mockBlobText), loading: false, error: null };
  },
}));

// Syntax highlighting (refractor is ESM-only under jest) never touches math;
// a no-op plugin keeps the previewer's math pipeline real.
jest.mock("rehype-prism-plus", () => ({
  __esModule: true,
  default: () => () => undefined,
}));

// MarkdownRenderer's copy button opens overlays through Redux; not math.
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({
  InlineCopyButton: () => null,
}));

// The code-block surfaces are heavy editors; math parity only needs the text.
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { ConfigurableMarkdownContent } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import MarkdownRenderer from "@/components/mardown-display/MarkdownRenderer";
import { MarkdownPreview } from "@/features/files/components/core/FilePreview/previewers/MarkdownPreview";

type MathNode = { tex: string; display: boolean };

interface Case {
  name: string;
  source: string;
  math: MathNode[];
  /** Literal text that must survive un-mathed. */
  literal?: string[];
  /** How many <li> must contain math (list items stay list items). */
  listItemsWithMath?: number;
}

const inline = (tex: string): MathNode => ({ tex, display: false });
const display = (tex: string): MathNode => ({ tex, display: true });

const CASES: Case[] = [
  {
    name: "currency stays currency",
    source: "It costs $5 and $10, or $20.50 total.",
    math: [],
    literal: ["$5 and $10, or $20.50 total."],
  },
  {
    name: "\\(…\\) is inline math",
    source: "The roots \\(x = 2\\) and \\(y^2\\) are real.",
    math: [inline("x = 2"), inline("y^2")],
    literal: ["The roots", "are real."],
  },
  {
    name: "\\[…\\] is display math",
    source: "Consider\n\n\\[\\frac{a}{b}\\]\n\nthen stop.",
    math: [display("\\frac{a}{b}")],
    literal: ["Consider", "then stop."],
  },
  {
    name: "single-dollar math converts",
    source: "Let $x^2 + 1$ be positive and $n$ an integer.",
    math: [inline("x^2 + 1"), inline("n")],
    literal: ["be positive and", "an integer."],
  },
  {
    name: "currency beside single-dollar math",
    source: "Pay $5 for $x_1$ items, then $3 more.",
    math: [inline("x_1")],
    literal: ["Pay $5 for", "items, then $3 more."],
  },
  {
    name: "math inside code spans is untouched",
    source: "Use `$x^2$` and `\\(y\\)` literally.",
    math: [],
    literal: ["$x^2$", "\\(y\\)"],
  },
  {
    name: "math inside fences is untouched",
    source: "Before\n\n```\n$a^2$ \\(b\\) \\[c\\]\n```\n\nAfter",
    math: [],
    literal: ["$a^2$ \\(b\\) \\[c\\]"],
  },
  {
    name: "list items keep inline math inline",
    source: "- first \\(a+b\\) item\n- second $c^2$ item",
    math: [inline("a+b"), inline("c^2")],
    listItemsWithMath: 2,
  },
  {
    name: "$$ display block",
    source: "Energy:\n\n$$\nE = mc^2\n$$\n\nDone.",
    math: [display("E = mc^2")],
  },
];

type Renderer = { name: string; render: (source: string) => React.ReactElement };

const RENDERERS: Renderer[] = [
  {
    name: "BasicMarkdownContent",
    render: (s) => <BasicMarkdownContent content={s} showCopyButton={false} />,
  },
  {
    name: "ConfigurableMarkdownContent",
    render: (s) => (
      <ConfigurableMarkdownContent content={s} showCopyButton={false} />
    ),
  },
  {
    name: "MarkdownRenderer",
    render: (s) => <MarkdownRenderer content={s} />,
  },
  {
    name: "MarkdownPreview",
    render: (s) => {
      mockBlobText = s;
      return <MarkdownPreview fileId="parity-test" />;
    },
  },
];

function readMath(container: HTMLElement): MathNode[] {
  return [...container.querySelectorAll(".katex")]
    .filter((el) => !el.parentElement?.closest(".katex"))
    .map((el) => ({
      tex: (
        el.querySelector('annotation[encoding="application/x-tex"]')
          ?.textContent ?? ""
      ).trim(),
      display: Boolean(el.closest(".katex-display")),
    }));
}

async function mount(element: React.ReactElement): Promise<{
  container: HTMLDivElement;
  root: Root;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  // MarkdownPreview reads the blob in an effect; let it settle.
  await act(async () => {
    await Promise.resolve();
  });
  return { container, root };
}

describe("math parity across markdown entry points", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      for (const r of RENDERERS) {
        it(`${r.name}`, async () => {
          const { container, root } = await mount(r.render(c.source));
          try {
            expect(readMath(container)).toEqual(c.math);
            const text = (container.textContent ?? "").replace(/ /g, " ");
            for (const lit of c.literal ?? []) {
              expect(text).toContain(lit);
            }
            if (c.listItemsWithMath !== undefined) {
              const lis = [...container.querySelectorAll("li")].filter((li) =>
                li.querySelector(".katex"),
              );
              expect(lis).toHaveLength(c.listItemsWithMath);
            }
          } finally {
            act(() => root.unmount());
            container.remove();
          }
        });
      }
    });
  }
});

describe("features/math components use the same dialect", () => {
  // Imported lazily so the describe above stays independent of them.
  const InlineMathText = (
    jest.requireActual("@/features/math/components/InlineMathText") as {
      default: React.FC<{ text: string }>;
    }
  ).default;
  const DisplayMath = (
    jest.requireActual("@/features/math/components/DisplayMath") as {
      default: React.FC<{ math: string }>;
    }
  ).default;

  const cases: Array<[string, React.ReactElement, MathNode[], string[]]> = [
    ["InlineMathText currency", <InlineMathText key="a" text={"Costs $5 and $10."} />, [], ["$5 and $10."]],
    ["InlineMathText \\(…\\)", <InlineMathText key="b" text={"Solve \\(x + 1 = 2\\) now"} />, [inline("x + 1 = 2")], ["Solve", "now"]],
    ["InlineMathText $…$", <InlineMathText key="c" text={"Let $x^2$ grow"} />, [inline("x^2")], []],
    ["InlineMathText bare TeX", <InlineMathText key="d" text={"Half is \\frac{1}{2} exactly"} />, [inline("\\frac{1}{2}")], ["exactly"]],
    ["DisplayMath formula", <DisplayMath key="e" math={"x = \\frac{-b}{2a}"} />, [display("x = \\frac{-b}{2a}")], []],
  ];

  it.each(cases)("%s", async (_name, element, math, literal) => {
    const { container, root } = await mount(element);
    try {
      expect(readMath(container)).toEqual(math);
      for (const lit of literal) expect(container.textContent).toContain(lit);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
