import { cleanMarkdownPreview } from "./clean-markdown-to-text";

describe("cleanMarkdownPreview", () => {
  it("flattens headings and whitespace for compact previews", () => {
    expect(
      cleanMarkdownPreview("## Image agent\n\nCreates **useful** assets."),
    ).toBe("Image agent Creates useful assets.");
  });

  it("keeps image alt text without exposing the destination", () => {
    expect(
      cleanMarkdownPreview(
        "Creates a cover. ![Example cover](https://cdn.example.com/cover.png)",
      ),
    ).toBe("Creates a cover. Example cover");
  });

  it("omits URL-only paragraphs and inline image URLs", () => {
    expect(
      cleanMarkdownPreview(
        "Image workflow\nhttps://cdn.example.com/raw-image.webp?signature=abc\nSee https://example.com/preview.jpg for the old preview.",
      ),
    ).toBe("Image workflow See for the old preview.");
  });
});
