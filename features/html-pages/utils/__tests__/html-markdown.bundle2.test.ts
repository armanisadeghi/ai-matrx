/**
 * The share-as-webpage path: chatUiRegistration registers `convertMarkdownToHtml` as
 * `async (md) => (await import("@/features/html-pages/utils/html-markdown")).convertMarkdownToHtml(md)`
 * so the markdown pipeline (unified/remark/rehype/KaTeX) loads on the first share, not in the shell.
 * This drives that exact on-demand import and asserts the HTML a published page would carry.
 */
describe("html-markdown on-demand conversion", () => {
  it("converts markdown, math and drops thinking content through the lazy import", async () => {
    const convert = async (markdown: string) =>
      (await import("@/features/html-pages/utils/html-markdown")).convertMarkdownToHtml(markdown);

    const html = await convert("# Cell biology\n\nThe **mitochondria** makes ATP: $E=mc^2$.\n\n- one\n- two\n");
    expect(html).toContain("<h1");
    expect(html).toContain("Cell biology");
    expect(html).toMatch(/<strong[^>]*>mitochondria<\/strong>/);
    expect(html).toMatch(/<li[^>]*>one<\/li>/);
    expect(html).toContain('class="katex"');

    const stripped = await convert("<thinking>private chain</thinking>\n\nVisible answer");
    expect(stripped).toContain("Visible answer");
    expect(stripped).not.toContain("private chain");
  });
});
