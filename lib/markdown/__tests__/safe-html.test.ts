/**
 * Markdown → sanitized HTML for markup that leaves the app (email bodies, CMS
 * drafts) reads the markdown through THE ONE CORE's HTML edge
 * (components/markdown-core/markdown-core-html.ts) — the same plugin table the
 * screen uses — and then sanitizes it against the allow-list.
 *
 * Breaks each case names: a second markdown parser (`marked`) back in this path
 * loses the core's extended syntax (`H~2~O` subscript); a missing sanitize pass
 * lets `<script>` / `onerror=` through; the live page's hover anchor shipping in
 * static markup leaves an empty `<a href="#…">` in every heading.
 */
import { markdownToSafeHtml } from "../safe-html";

describe("markdownToSafeHtml", () => {
  it("renders GFM through the one core (tables, emphasis, links, the core's extended syntax)", () => {
    const html = markdownToSafeHtml(
      "Weekly **update** — [docs](https://example.com/a_b)\n\n| item | qty |\n|---|---|\n| pallets | 4 |\n\nH~2~O",
    );
    expect(html).toContain("<strong>update</strong>");
    expect(html).toContain('<a href="https://example.com/a_b">docs</a>');
    expect(html).toContain("<td>pallets</td>");
    expect(html).toContain("H<sub>2</sub>O");
  });

  it("strips scripts, event handlers, frames and javascript: links", () => {
    const html = markdownToSafeHtml(
      '<script>alert(1)</script><img src="x" onerror="alert(1)"><iframe src="https://evil"></iframe><a href="javascript:alert(1)">x</a>',
    );
    expect(html).not.toMatch(/<script|onerror|<iframe|javascript:/i);
    expect(html).not.toContain("alert(1)</script>");
  });

  it("ships no empty hover anchor in a heading", () => {
    const html = markdownToSafeHtml("# Vendor call prep");
    expect(html).toMatch(/<h1[^>]*>Vendor call prep<\/h1>/);
    expect(html).not.toMatch(/<a[^>]*href="#/);
  });
});
