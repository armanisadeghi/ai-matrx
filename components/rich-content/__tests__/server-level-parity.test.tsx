/**
 * FORCING FUNCTION: the server level is the SAME core as the client levels —
 * for every construct they share, <RichContentServer> (rendered the way a
 * React Server Component's HTML is produced, react-dom/server) emits exactly
 * the HTML the client level renders in the browser.
 *
 * The break this catches: a server path that parses with its own preset, its
 * own math handling, its own element map or its own prose preparation — the
 * pre-RC-B2b state, where SEO pages split text on "\n\n" into <p> tags and
 * showed `**bold**` and `\(x\)` literally. Change the server's preset, drop
 * the math normalizer, fork an element, or skip preprocessProse on either
 * side and this turns red.
 *
 * Use cases: a published chemistry study guide (the learn article — headings,
 * math, a table, a list, a quote, a short code line), a recycling company's
 * dispatcher note with a {{variable}} and an <info> section, and a physics
 * flashcard front at the inline level.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

jest.mock("server-only", () => ({}));
// The client edge, rendered synchronously (next/dynamic has no loader in jest).
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

import { RichContentServer } from "@/components/rich-content/server/RichContentServer";
import { RichContentInline } from "@/components/rich-content/RichContentInline";
import { StandardBlocks } from "@/components/rich-content/standard/StandardBlocks";
import { RichContentDepthProvider } from "@/components/rich-content/depth";
import { RichContentStaticProse } from "@/components/rich-content/RichContentStaticProse";
import { ProseServer } from "@/components/rich-content/server/RichContentServer";
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";

const STUDY_GUIDE = [
  "## Molar mass, step by step",
  "",
  "The molar mass of water is \\(M_{H_2O} = 2(1.008) + 16.00\\) **grams per mole** — see [the periodic table](https://ptable.com).",
  "",
  "$$",
  "n = \\frac{m}{M}",
  "$$",
  "",
  "1. Find each element's *atomic mass*.",
  "2. Multiply by its subscript.",
  "3. Add the products.",
  "",
  "===",
  "",
  "| Element | Atomic mass | Count |",
  "| --- | --- | --- |",
  "| H | 1.008 | 2 |",
  "| O | 16.00 | 1 |",
  "",
  "> A mole is \\(6.022 \\times 10^{23}\\) particles.",
  "",
  "Write it as `M = m/n` in your notes.",
].join("\n");

const DISPATCHER_NOTE = [
  "Route **North Industrial** for {{customer_name}} runs *Tuesday*.",
  "",
  "<info>",
  "Gate code is held by the site supervisor; the load factor is \\(\\frac{22.5}{30}\\).",
  "",
  "- Bring the **scale ticket**",
  "- Photograph the bin",
  "</info>",
  "",
  "Second stop is Harbor Commercial.",
].join("\n");

const FLASHCARD_FRONT =
  "What is the net force when \\(F_1 = 3\\,\\text{N}\\) and \\(F_2 = -3\\,\\text{N}\\)? **Explain** with *Newton's first law*.\n\nThen name the unit.";

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

/**
 * One serialization for both sides. The only normalization: a `style`
 * attribute is re-written from its parsed declarations, because the client
 * sets styles through the CSSOM (`height: 1em;`) while the server writes the
 * string (`height:1em`) — the same declaration, two spellings. Every tag,
 * class, attribute and text node is compared as-is.
 */
function canonical(scope: HTMLElement): string {
  scope.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    el.setAttribute("style", el.style.cssText);
  });
  return scope.innerHTML;
}

function clientHtml(node: React.ReactElement): string {
  act(() => root.render(node));
  const copy = document.createElement("div");
  copy.innerHTML = container.innerHTML;
  return canonical(copy);
}

/** Server HTML (what an RSC render streams), parsed by the same DOM. */
function serverHtml(node: React.ReactElement): string {
  const probe = document.createElement("div");
  probe.innerHTML = renderToStaticMarkup(node);
  return canonical(probe);
}

describe("server level renders the same HTML as the client levels", () => {
  it("standard: a chemistry study guide (headings, math, list, table, quote, code)", () => {
    const server = serverHtml(<RichContentServer level="standard" source={STUDY_GUIDE} />);
    const client = clientHtml(<StandardBlocks source={STUDY_GUIDE} />);
    // Not vacuous: the constructs really rendered (KaTeX, a table, a list).
    expect(server).toContain('class="katex"');
    expect(server).toContain("<table");
    expect(server).toContain("<ol");
    expect(server).toContain("grams per mole</strong>");
    expect(server).not.toContain("**grams");
    // preprocessProse ran: the standalone `===` became the thick rule.
    expect(server).toContain('role="separator"');
    expect(server).toBe(client);
  });

  it("standard: a dispatcher note with a {{variable}} and a nested <info> section", () => {
    const server = serverHtml(<RichContentServer level="standard" source={DISPATCHER_NOTE} />);
    const client = clientHtml(
      <RichContentDepthProvider depth={0}>
        <StandardBlocks source={DISPATCHER_NOTE} />
      </RichContentDepthProvider>,
    );
    expect(server).toContain('data-rich-content-section="info"');
    expect(server).toContain("scale ticket</strong>");
    expect(server).not.toContain("<info>");
    expect(server).toBe(client);
  });

  it("inline: a physics flashcard front", () => {
    const server = serverHtml(<RichContentServer level="inline" source={FLASHCARD_FRONT} />);
    const client = clientHtml(<RichContentInline source={FLASHCARD_FRONT} />);
    expect(server).toContain('class="katex"');
    expect(server).toContain("Explain</strong>");
    expect(server).not.toMatch(/<(p|div|h\d|ul|ol|table)\b/);
    expect(server).toBe(client);
  });

  it("past the depth cap the server hands the section to the client's capped view", () => {
    const deep = "<info>\nouter\n\n<task>\n**inner** text\n</task>\n</info>";
    const server = serverHtml(<RichContentServer level="standard" source={deep} depthCap={1} />);
    const client = clientHtml(
      <RichContentDepthProvider depth={0} cap={1}>
        <StandardBlocks source={deep} />
      </RichContentDepthProvider>,
    );
    expect(server).toContain("data-rich-content-capped");
    expect(server).toBe(client);
  });

  it("share pages: the static prose leaf (SSR'd client) equals the server and client prose", () => {
    const note = STUDY_GUIDE.split("| Element")[0];
    const server = serverHtml(<ProseServer content={note} />);
    const staticSsr = serverHtml(<RichContentStaticProse source={note} />);
    const client = clientHtml(<BasicMarkdownContent content={note} showCopyButton={false} />);
    expect(server).toContain('class="katex"');
    expect(staticSsr).toBe(server);
    expect(client).toBe(server);
  });
});
