/**
 * FORCING FUNCTION: the extended markdown syntax renders at EVERY level of
 * <RichContent> through the one core — and degrades cleanly mid-stream.
 *
 * Each case is a real authoring situation (a pottery studio's kiln manual, a
 * chemistry lesson, a dispatcher's checklist) written the way the ecosystem
 * it comes from writes it — GitHub alerts, Obsidian callouts and wikilinks,
 * MkDocs admonitions, Pandoc super/subscript and definition lists, front
 * matter — and each asserts on what a READER sees: the element, its text,
 * and that the raw marker is gone. On the pre-RC-B8 core every case prints
 * its markers as text.
 *
 * Renders the REAL pipeline (same harness and stand-ins as page-break-parity).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

jest.mock("@/components/markdown-core/MarkdownCore", () => {
  const actual = jest.requireActual("@/components/markdown-core/MarkdownCoreImpl") as typeof import("@/components/markdown-core/MarkdownCoreImpl");
  const heal = jest.requireActual("@/components/markdown-core/stream-heal") as typeof import("@/components/markdown-core/stream-heal");
  const Impl = actual.default;
  return {
    __esModule: true,
    default: ({ streaming, children, ...rest }: { streaming?: boolean; children: string }) => (
      <Impl {...rest}>{streaming ? heal.healStreamingMarkdown(children) : children}</Impl>
    ),
  };
});
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({ InlineCopyButton: () => null }));
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code, meta }: { code: string; meta?: string }) => <pre data-meta={meta}>{code}</pre>,
}));
jest.mock("@/components/mardown-display/blocks/csv/CsvBlock", () => ({
  __esModule: true,
  default: ({ content, delimiter }: { content: string; delimiter: string }) => {
    const rows = content.trim().split("\n").map((r) => r.split(delimiter));
    return (
      <table data-csv-table="">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));
// The platform search is the resolver's job; here it answers like the real
// one would for a studio that has a "Kiln schedule" note and no "Glaze notes".
jest.mock("@/components/markdown-core/syntax/elements/wikilink-resolver", () => ({
  splitHeading: (t: string) => ({ page: t.split("#")[0], heading: t.split("#")[1] ?? null }),
  resolveWikiTarget: (target: string) =>
    Promise.resolve(
      target.toLowerCase().startsWith("kiln schedule")
        ? { status: "found", token: "note", id: "11111111-1111-4111-8111-111111111111", title: "Kiln schedule", href: "/notes/11111111-1111-4111-8111-111111111111", typeLabel: "Note" }
        : { status: "missing", title: target },
    ),
  createWikiPage: jest.fn(() => Promise.resolve({ ok: true, href: "/notes/new-id" })),
}));
jest.mock("@/components/rich-content/standard/NestedRichContent", () => {
  const { StandardBlocks } = jest.requireActual("@/components/rich-content/standard/StandardBlocks");
  return { __esModule: true, NestedRichContent: ({ source }: { source: string }) => <StandardBlocks source={source} />, default: () => null };
});

jest.mock("@/features/organizations/people/visiblePeople", () => ({
  resolveVisiblePerson: (userId: string) =>
    Promise.resolve(
      userId === "9f1c0000-0000-4000-8000-000000000001"
        ? { userId, name: "Dana Ruiz", email: "dana@kilnworks.example", avatarUrl: null, role: "member" }
        : null,
    ),
}));

jest.mock("@/features/organizations/peek/ResourcePeekHost", () => ({
  ResourcePeekHost: ({ kind, id }: { kind: string; id: string }) => <div data-peek-kind={kind} data-peek-id={id} />,
}));

import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { projectSource, rangeToSource, CONTENT_CHROME_ATTR } from "@/features/rich-document/annotations/projection";

/**
 * RC-B11 verify F1 — THE CLASS: text the renderer ADDS (heading "#" anchors, "Figure 1." prefixes,
 * default callout titles, table-of-contents entries, code-block language labels) is not the
 * source's own words. When the text mapper matched it against the source, the cursor jumped past
 * the section and the first section under every heading became unselectable. The renderer now
 * marks every such element with the one attribute `data-content-chrome`; the mapper skips it.
 * These cases run the REAL renderer output — never hand-written HTML.
 */

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

async function render(source: string): Promise<HTMLElement> {
  await act(async () => {
    root.render(<BasicMarkdownContent content={source} showCopyButton={false} />);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return container;
}

function selectText(rootEl: HTMLElement, text: string): Range {
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode() as Text | null;
  while (n) {
    const at = n.data.indexOf(text);
    if (at >= 0 && !n.parentElement?.closest(`[${CONTENT_CHROME_ATTR}]`)) {
      const r = document.createRange();
      r.setStart(n, at);
      r.setEnd(n, at + text.length);
      return r;
    }
    n = walker.nextNode() as Text | null;
  }
  throw new Error(`"${text}" is not rendered`);
}

const GUIDE = [
  "# Kiln safety",
  "",
  "Load the kiln with at least one inch between shelves.",
  "",
  "## Firing",
  "",
  "Vent the kiln for the first two hours of the firing.",
  "",
  "> [!NOTE]",
  "> Wear heat-resistant gloves when unloading.",
  "",
  "## Cooling",
  "",
  "Never open the lid above 400 degrees.",
].join("\n");

describe("the first section under every heading is selectable", () => {
  it.each([
    ["Load the kiln with at least one inch"],
    ["Vent the kiln for the first two hours"],
    ["Wear heat-resistant gloves"],
    ["Never open the lid above 400 degrees"],
  ])("maps \"%s\" to its exact source range", async (phrase) => {
    const el = await render(GUIDE);
    const projection = projectSource(el, GUIDE);
    const mapped = rangeToSource(projection, selectText(el, phrase));
    expect(mapped).not.toBeNull();
    expect(GUIDE.slice(mapped!.start, mapped!.end)).toBe(phrase);
  });

  it("marks the renderer's own heading anchors as chrome", async () => {
    const el = await render(GUIDE);
    const anchors = el.querySelectorAll("a[data-heading-anchor]");
    expect(anchors.length).toBeGreaterThan(0);
    anchors.forEach((a) => expect(a.closest(`[${CONTENT_CHROME_ATTR}]`)).not.toBeNull());
  });
});
