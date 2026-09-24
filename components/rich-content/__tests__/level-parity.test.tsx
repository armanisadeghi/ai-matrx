/**
 * FORCING FUNCTION: one core — a construct every level shares renders to the
 * SAME element at every level, and `inline` stays phrasing-only.
 *
 * The break this catches: a level that prepares prose, picks plugins or maps
 * inline marks its own way (the pre-RC-B2 state: card faces through the
 * "rich" preset and their own style map, chat through "chat" + the prose
 * leaf's map, the XML card through "gfm" — bold, math and links rendered
 * three different ways). Any divergence in the shared prose preparation, the
 * math dialect, the preset or the inline-mark map turns this red.
 *
 * Use cases: a chemistry teacher's flashcard front, and a recycling
 * company's dispatcher note — two sources with different constructs, so a
 * renderer that returns one canned output cannot pass both.
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

jest.mock("@/components/markdown-core/MarkdownCore", () => ({
  __esModule: true,
  default: jest.requireActual("@/components/markdown-core/MarkdownCoreImpl")
    .default,
}));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({
  InlineCopyButton: () => null,
}));
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

import { RichContentInline } from "@/components/rich-content/RichContentInline";
import { StandardBlocks } from "@/components/rich-content/standard/StandardBlocks";
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";

const SOURCES = [
  {
    name: "chemistry flashcard front",
    source:
      "What is the molar mass of \\(H_2O\\)? **Show your work** in *grams per mole* — see [the periodic table](https://ptable.com) and `M = m/n`.",
    marks: { strong: "Show your work", em: "grams per mole", code: "M = m/n", tex: "H_2O", variables: 0, literalTags: [] },
  },
  {
    name: "dispatcher note",
    source:
      "Route **North Industrial** for {{customer_name}} runs *Tuesday* (gate code held by <Supervisor>); load factor \\(\\frac{22.5}{30}\\) — ask `dispatch@allgreen` or read [the board](https://example.com/routes).\n\nSecond stop is Harbor Commercial.",
    marks: { strong: "North Industrial", em: "Tuesday", code: "dispatch@allgreen", tex: "\\frac{22.5}{30}", variables: 1, literalTags: ["<Supervisor>"] },
  },
] as const;

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

function renderLevel(node: React.ReactElement): HTMLElement {
  act(() => root.render(node));
  return container;
}

/** The shared constructs, as their rendered HTML. */
function marks(scope: HTMLElement) {
  const html = (sel: string) =>
    [...scope.querySelectorAll(sel)].map((el) => el.outerHTML);
  return {
    strong: html("strong"),
    em: html("em"),
    // Inline code spans (not code inside a fenced <pre>).
    code: [...scope.querySelectorAll("code")]
      .filter((el) => !el.closest("pre"))
      .map((el) => el.outerHTML),
    katex: html(".katex"),
    tex: [...scope.querySelectorAll("annotation")].map((a) => a.textContent),
    // `{{variable}}` chips — the chat preset's variable plugin.
    variables: html("[data-name]"),
    // Non-HTML angle-bracket tokens read as literal text (prose preparation).
    literalTags: (scope.textContent ?? "").match(/<[A-Z][a-z]+>/g) ?? [],
  };
}

describe("every level renders shared constructs identically", () => {
  it.each(SOURCES)("$name", ({ source, marks: expected }) => {
    const inline = marks(renderLevel(<RichContentInline source={source} />));
    const standard = marks(renderLevel(<StandardBlocks source={source} />));
    const full = marks(
      renderLevel(<BasicMarkdownContent content={source} showCopyButton={false} />),
    );

    // Anchored to the source, not to the renderer's own output.
    expect(inline.tex).toEqual([expected.tex]);
    expect(inline.strong).toHaveLength(1);
    expect(inline.strong[0]).toContain(`>${expected.strong}<`);
    expect(inline.em[0]).toContain(`>${expected.em}<`);
    expect(inline.code[0]).toContain(`>${expected.code}<`);
    expect(inline.variables).toHaveLength(expected.variables);
    expect(inline.literalTags).toEqual(expected.literalTags);

    // One core: byte-identical elements across the three levels.
    expect(standard).toEqual(inline);
    expect(full).toEqual(inline);
  });
});

describe("inline is phrasing content only", () => {
  const BLOCKY =
    "# Photosynthesis\n\n- light reactions\n- Calvin cycle\n\n| Stage | Site |\n|---|---|\n| light | thylakoid |\n\n> chlorophyll absorbs red and blue\n\n```\nCO2 + H2O -> C6H12O6\n```\n\n---\n\n$$E = mc^2$$";

  it("renders headings, lists, tables, quotes, fences and display math without a single block element", () => {
    const scope = renderLevel(
      <p>
        <RichContentInline source={BLOCKY} />
      </p>,
    );
    const inlineRoot = scope.querySelector('[data-rich-content="inline"]');
    expect(inlineRoot).not.toBeNull();
    const blockTags = inlineRoot!.querySelectorAll(
      "div, p, h1, h2, h3, h4, ul, ol, li, table, thead, tbody, tr, td, th, blockquote, pre, hr",
    );
    expect([...blockTags].map((el) => el.tagName)).toEqual([]);
    // …and nothing was dropped.
    const text = inlineRoot!.textContent ?? "";
    for (const piece of ["Photosynthesis", "Calvin cycle", "thylakoid", "chlorophyll", "C6H12O6"]) {
      expect(text).toContain(piece);
    }
    expect(
      [...inlineRoot!.querySelectorAll("annotation")].map((a) => a.textContent),
    ).toContain("E = mc^2");
    expect(inlineRoot!.querySelector('[role="table"]')).not.toBeNull();
  });
});
