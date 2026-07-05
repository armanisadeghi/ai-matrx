import type { Root, Element, RootContent } from "hast";
import rehypeSafeRawHtml from "@/components/mardown-display/chat-markdown/rehypeSafeRawHtml";

/** Build a hast Root containing a single raw-HTML node, like react-markdown
 *  leaves in the tree when it runs with allowDangerousHtml. */
function rootWithRaw(html: string): Root {
  return {
    type: "root",
    children: [{ type: "raw", value: html } as unknown as RootContent],
  };
}

function run(html: string): Root {
  const tree = rootWithRaw(html);
  rehypeSafeRawHtml()(tree);
  return tree;
}

/** Depth-first collect element tagNames. */
function tagNames(node: RootContent | Root): string[] {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n.type === "element") out.push(n.tagName);
    (n.children ?? []).forEach(walk);
  };
  walk(node);
  return out;
}

function firstElement(node: Root, tag: string): Element | undefined {
  let found: Element | undefined;
  const walk = (n: any) => {
    if (found) return;
    if (n.type === "element" && n.tagName === tag) found = n;
    (n.children ?? []).forEach(walk);
  };
  walk(node);
  return found;
}

describe("rehypeSafeRawHtml", () => {
  it("renders a raw <img> and preserves src/width/height/alt", () => {
    const tree = run(
      '<img src="https://deckofcardsapi.com/static/img/AS.png" width="140" height="196" alt="Ace">',
    );
    const img = firstElement(tree, "img");
    expect(img).toBeDefined();
    expect(img!.properties?.src).toBe(
      "https://deckofcardsapi.com/static/img/AS.png",
    );
    expect(img!.properties?.width).toBe(140);
    expect(img!.properties?.alt).toBe("Ace");
  });

  it("renders a raw <table> with rows, cells, and nested images", () => {
    const tree = run(
      '<table><tr><td><img src="https://x.com/a.png" width="100"></td>' +
        '<td><img src="https://x.com/b.png" width="100"></td></tr></table>',
    );
    const names = tagNames(tree);
    expect(names).toEqual(
      expect.arrayContaining(["table", "tr", "td", "img"]),
    );
    // both images survive
    expect(names.filter((t) => t === "img")).toHaveLength(2);
    // table is tagged so the admin diagnostic stays quiet for HTML tables
    const table = firstElement(tree, "table");
    expect(table?.data?.matrxRawHtmlTable).toBe(true);
  });

  it("strips <script> entirely", () => {
    const tree = run('<img src="https://x.com/a.png"><script>alert(1)</script>');
    expect(tagNames(tree)).not.toContain("script");
    expect(tagNames(tree)).toContain("img");
  });

  it("strips event-handler attributes (onerror/onclick)", () => {
    const tree = run(
      '<img src="https://x.com/a.png" onerror="alert(1)" onclick="steal()">',
    );
    const img = firstElement(tree, "img");
    expect(img).toBeDefined();
    expect(img!.properties?.onerror).toBeUndefined();
    expect(img!.properties?.onClick).toBeUndefined();
    expect(img!.properties?.onclick).toBeUndefined();
  });

  it("neutralizes javascript: URLs on links", () => {
    const tree = run('<a href="javascript:alert(1)">x</a>');
    const a = firstElement(tree, "a");
    // sanitize drops the disallowed-protocol href (link element may remain,
    // but it must NOT carry the javascript: URL).
    expect(a?.properties?.href).toBeUndefined();
  });

  it("strips inline style attributes (Case 4 is deferred)", () => {
    const tree = run('<span style="display:flex">x</span>');
    const span = firstElement(tree, "span");
    expect(span).toBeDefined();
    expect(span!.properties?.style).toBeUndefined();
  });

  it("does not touch existing element nodes (matrx-variable / math)", () => {
    // A tree with NO raw nodes must pass through byte-identical — this is why
    // variables and KaTeX pre-render spans are safe.
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "matrx-variable",
          properties: { "data-name": "user_name" },
          children: [],
        } as unknown as RootContent,
        {
          type: "element",
          tagName: "span",
          properties: { className: ["math", "math-inline"] },
          children: [{ type: "text", value: "x^2" }],
        } as unknown as RootContent,
      ],
    };
    const before = JSON.stringify(tree);
    rehypeSafeRawHtml()(tree);
    expect(JSON.stringify(tree)).toBe(before);
  });
});
