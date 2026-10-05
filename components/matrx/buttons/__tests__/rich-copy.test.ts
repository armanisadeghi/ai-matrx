/**
 * @jest-environment jsdom
 */
// THE rich-content copy: which bytes each flavor writes.

jest.mock("@/lib/scoped-config/sessionKnob", () => ({ getSessionKnob: jest.fn(() => undefined) }));
jest.mock("@/components/dialogs/clipboard-fallback/manualCopyOpener", () => ({ showManualCopy: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), info: jest.fn(), error: jest.fn() } }));
jest.mock("@ai-matrx/print/markdown", () => ({
  removeThinkingContent: (s: string) => s.replace(/<thinking>[\s\S]*?<\/thinking>\n?/g, ""),
  markdownToHtml: (s: string) => `<p>${s}</p>`,
}));

import { copyRichContent, markdownToReadableText, richCopyPlainText } from "../markdown-copy-utils";
import { getSessionKnob } from "@/lib/scoped-config/sessionKnob";

const ANSWER = [
  "## Route plan",
  "",
  "Pick up **totes** at *Alton* — see [the map](https://maps.test/alton) or <https://x.test>.",
  "",
  "- Weigh in",
  "  - nested `scale 3`",
  "- [ ] Photograph",
  "- [x] Unload",
  "",
  "1. First",
  "2) Second",
  "",
  "> Quoted ~~old~~ line",
  "",
  "| Stop | Bins |",
  "|---|---:|",
  "| Alton | 12 |",
  "",
  "```js",
  "const **x** = 1;",
  "```",
].join("\n");

describe("Copy text — readable, no markup", () => {
  test("every construct reads as a person would type it", () => {
    expect(markdownToReadableText(ANSWER)).toBe(
      [
        "Route plan",
        "",
        "Pick up totes at Alton — see the map (https://maps.test/alton) or https://x.test.",
        "",
        "• Weigh in",
        "  • nested scale 3",
        "☐ Photograph",
        "☑ Unload",
        "",
        "1. First",
        "2. Second",
        "",
        "Quoted old line",
        "",
        "Stop\tBins",
        "Alton\t12",
        "",
        "const **x** = 1;",
      ].join("\n"),
    );
  });
});

describe("flavors", () => {
  let write: jest.Mock;
  let writeText: jest.Mock;
  beforeEach(() => {
    write = jest.fn(async () => undefined);
    writeText = jest.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { write, writeText } });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      constructor(public items: Record<string, Blob | Promise<Blob>>) {}
    };
    (getSessionKnob as jest.Mock).mockReturnValue(undefined);
  });

  async function itemText(type: string): Promise<string> {
    const item = write.mock.calls[0][0][0] as { items: Record<string, Blob | Promise<Blob>> };
    const blob = await item.items[type];
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob!);
    });
  }

  test("one-click Copy: text/plain = markdown, text/html = formatted (knob default)", async () => {
    await copyRichContent("<thinking>hidden</thinking>\n**Hi**", "default");
    expect(writeText).not.toHaveBeenCalled();
    expect(await itemText("text/plain")).toBe("**Hi**");
    expect(await itemText("text/html")).toBe("<p>**Hi**</p>");
  });

  test("the knob turns a one-click Copy's plain flavor into readable text", async () => {
    (getSessionKnob as jest.Mock).mockReturnValue("text");
    await copyRichContent("**Hi** [a](https://b.c)", "default");
    expect(await itemText("text/plain")).toBe("Hi a (https://b.c)");
    expect(await itemText("text/html")).toContain("<p>");
  });

  test("Copy markdown and Copy text write plain text only", async () => {
    await copyRichContent("- **a**", "markdown");
    await copyRichContent("- **a**", "text");
    expect(write).not.toHaveBeenCalled();
    expect(writeText.mock.calls.map((c) => c[0])).toEqual(["- **a**", "• a"]);
  });

  test("richCopyPlainText is the knob's flavor for default and the named one otherwise", () => {
    expect(richCopyPlainText("*a*", "default", "markdown")).toBe("*a*");
    expect(richCopyPlainText("*a*", "default", "text")).toBe("a");
    expect(richCopyPlainText("*a*", "markdown", "text")).toBe("*a*");
  });
});
