/**
 * THE ONE DELIBERATE GFM DEVIATION, on screen (verify-RC-B4 round 16 ruling:
 * content never silently disappears). A line opening an HTML block whose
 * element every sanitizer strips (`<link …/>`, `<nav>`, …) ends that block at
 * its own line (content-ir opensStrippedHtmlBlock): the tag shows as text and
 * the markdown under it renders as markdown — never as lazy text of the tag
 * line. Use case: a stored SEO-audit answer quoting a canonical-link tag, then
 * its checklist and a rule, with no blank lines between.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("server-only", () => ({}));
jest.mock("@/components/markdown-core/MarkdownCore", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({ InlineCopyButton: () => null }));
import { RichContentStaticStandard } from "@/components/rich-content/RichContentStaticProse";
import { preprocessProse } from "@/components/rich-content/prose/prose-prepare";

const AUDIT = [
  "Add a canonical link on every duplicate URL like this:",
  "",
  '<link rel="canonical" href="https://harbor.example/bays/" />',
  "Then check the site menu:",
  "",
  "<nav>",
  "2. Keep one canonical per page.",
  "3. Point duplicates at it.",
  "| Page | Canonical |",
  "| --- | --- |",
  "| /bays?sort=asc | /bays/ |",
].join("\n");

describe("a sanitizer-stripped HTML block ends at its own line", () => {
  const html = renderToStaticMarkup(<RichContentStaticStandard source={AUDIT} />);

  it("shows the stripped tags (as text, or the splitter's XML card), never swallowing the lines under them", () => {
    expect(html).toMatch(/&lt;link rel=|data-xml-root-name="true"[^>]*>link</);
    expect(html).toContain("&lt;nav&gt;");
    expect(html).toContain("Then check the site menu:");
  });

  it("renders the list under <nav> as a list (starting at 2) and the table as a table", () => {
    expect(html).toMatch(/<ol[^>]*start="2"/);
    expect((html.match(/<li[^>]*>/g) ?? []).length).toBe(2);
    expect(html).toMatch(/<table[\s\S]*\/bays\?sort=asc[\s\S]*<\/table>/);
  });

  it("ends the block with a blank line only for a stripped element, outside fences", () => {
    expect(preprocessProse("<div>\nkept as GFM reads it")).not.toContain("\n\n");
    expect(preprocessProse("```html\n<nav>\n---\n```")).toBe("```html\n<nav>\n---\n```");
  });
});
