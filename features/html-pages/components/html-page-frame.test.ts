import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  HTML_PAGE_HEIGHT_MESSAGE,
  cardFrameUrl,
  htmlPageCanvasContent,
  pageOrigins,
  readPageHeight,
} from "./html-page-frame";

const PAGE = "https://www.mymatrx.com/p/83541512-82ef-47dd-a277-74e00ec0aee8";
const frame = {} as Window;
const other = {} as Window;
const msg = (over: Partial<{ origin: string; source: unknown; data: unknown }> = {}) => ({
  origin: "https://www.mymatrx.com",
  source: frame,
  data: { type: HTML_PAGE_HEIGHT_MESSAGE, height: 812.4 },
  ...over,
}) as Pick<MessageEvent, "origin" | "source" | "data">;

describe("readPageHeight — the inline preview believes only its own page", () => {
  it("accepts a height from the frame's window at the page origin", () => {
    expect(readPageHeight(msg(), PAGE, frame)).toBe(813);
  });

  it("accepts the apex/www twin of the page host (the apex 307s to www)", () => {
    expect(readPageHeight(msg({ origin: "https://mymatrx.com" }), PAGE, frame)).toBe(813);
    expect(pageOrigins("https://mymatrx.com/p/x")).toEqual(["https://mymatrx.com", "https://www.mymatrx.com"]);
  });

  it("refuses any other origin, even a look-alike", () => {
    for (const origin of ["https://evil.com", "https://www.mymatrx.com.evil.com", "http://www.mymatrx.com", "null", "https://aimatrx.com"]) {
      expect(readPageHeight(msg({ origin }), PAGE, frame)).toBeNull();
    }
  });

  it("refuses a message from any window but this frame's (another preview of the same site)", () => {
    expect(readPageHeight(msg({ source: other }), PAGE, frame)).toBeNull();
    expect(readPageHeight(msg(), PAGE, null)).toBeNull();
  });

  it("refuses a wrong type or a height that is not a sane number", () => {
    for (const data of [null, "812", { type: "other", height: 800 }, { type: HTML_PAGE_HEIGHT_MESSAGE, height: "800" },
      { type: HTML_PAGE_HEIGHT_MESSAGE, height: Number.NaN }, { type: HTML_PAGE_HEIGHT_MESSAGE, height: Infinity },
      { type: HTML_PAGE_HEIGHT_MESSAGE, height: 0 }, { type: HTML_PAGE_HEIGHT_MESSAGE, height: -5 },
      { type: HTML_PAGE_HEIGHT_MESSAGE, height: 1e9 }]) {
      expect(readPageHeight(msg({ data }), PAGE, frame)).toBeNull();
    }
  });

  it("refuses everything when the page has no usable URL", () => {
    expect(readPageHeight(msg(), null, frame)).toBeNull();
    expect(readPageHeight(msg(), "javascript:alert(1)", frame)).toBeNull();
  });

  // The html site is a sibling repository (absent in CI): checked wherever both are present.
  const SITE = path.resolve(__dirname, "../../../../my-matrx/lib/render/servedHtmlDocument.js");
  (existsSync(SITE) ? it : it.skip)("speaks the same message type the html site sends", () => {
    const site = readFileSync(SITE, "utf8");
    expect(site).toContain(`HEIGHT_MESSAGE_TYPE = '${HTML_PAGE_HEIGHT_MESSAGE}'`);
  });
});

describe("one canvas path for an html page", () => {
  it("opens the html canvas type with the page source (→ HtmlAppFrame), never a URL", () => {
    expect(htmlPageCanvasContent({ code: "<html></html>", title: "T", messageId: "m" })).toEqual({
      type: "html",
      data: "<html></html>",
      metadata: { title: "T", sourceMessageId: "m" },
    });
  });

  it("no html-page preview opens the generic iframe web view", () => {
    for (const file of ["HtmlInlinePreview.tsx", "../../canvas/artifact-types/renderers/HtmlArtifact.tsx", "../../../components/mardown-display/blocks/artifact/ArtifactBlock.tsx"]) {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect({ file, opensIframe: /type:\s*["']iframe["']/.test(source) }).toEqual({ file, opensIframe: false });
    }
    const preview = readFileSync(path.resolve(__dirname, "HtmlInlinePreview.tsx"), "utf8");
    expect(preview).toContain("htmlPageCanvasContent(");
  });
});

describe("the inline card asks the page to fit (?fit=card)", () => {
  it("adds fit=card to the page URL and keeps the origin the height check trusts", () => {
    const card = cardFrameUrl(PAGE)!;
    expect(new URL(card).searchParams.get("fit")).toBe("card");
    expect(new URL(card).origin).toBe(new URL(PAGE).origin);
    expect(new URL(card).pathname).toBe(new URL(PAGE).pathname);
  });

  it("only the inline card frame uses it (the seamless embed and canvas never scale)", () => {
    const src = readFileSync(path.join(__dirname, "HtmlInlinePreview.tsx"), "utf8");
    expect(src.match(/cardFrameUrl\(url\)/g)).toHaveLength(1);
    const cardFrame = src.slice(src.lastIndexOf("<iframe", src.indexOf("data-html-inline-frame")), src.indexOf("data-html-inline-frame"));
    expect(cardFrame).toContain("src={cardFrameUrl(url)}");
  });
});

describe("readPageError", () => {
  const { readPageError } = jest.requireActual("./html-page-frame") as typeof import("./html-page-frame");
  const frame = {} as Window;
  const url = "https://www.mymatrx.com/p/abc";
  it("believes only this frame and the page origin", () => {
    const data = { type: "matrx-html-page:error", kind: "error", message: "x is not defined", line: 12 };
    expect(readPageError({ origin: "https://www.mymatrx.com", source: frame, data }, url, frame)).toEqual({ kind: "error", message: "x is not defined", line: 12 });
    expect(readPageError({ origin: "https://evil.example", source: frame, data }, url, frame)).toBeNull();
    expect(readPageError({ origin: "https://www.mymatrx.com", source: {} as Window, data }, url, frame)).toBeNull();
    expect(readPageError({ origin: "https://www.mymatrx.com", source: frame, data: { ...data, type: "other" } }, url, frame)).toBeNull();
  });
});
