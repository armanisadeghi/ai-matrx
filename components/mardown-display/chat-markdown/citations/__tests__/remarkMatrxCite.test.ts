/**
 * remarkMatrxCite — transforms literal `<matrxcite n="…" />` markers inside
 * mdast TEXT nodes into inline `matrx-cite` elements. The marker reaches the
 * text node because BasicMarkdownContent's preprocessContent escapes the tag
 * (`&lt;matrxcite …&gt;`) and CommonMark decodes entities back into text —
 * the same path `remarkMatrxVariable` relies on for `{{tokens}}`.
 */

import remarkMatrxCite from "../remarkMatrxCite";

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: Record<string, unknown>;
}

function paragraph(...children: MdastNode[]): MdastNode {
  return { type: "root", children: [{ type: "paragraph", children }] };
}

function text(value: string): MdastNode {
  return { type: "text", value };
}

function run(tree: MdastNode): MdastNode {
  remarkMatrxCite()(tree as never);
  return tree;
}

describe("remarkMatrxCite", () => {
  it("splits a text node around the marker and emits a matrx-cite element", () => {
    const tree = run(
      paragraph(text('Cited claim<matrxcite n="2" />, and more.')),
    );
    const children = tree.children![0].children!;
    expect(children.map((c) => c.type)).toEqual([
      "text",
      "matrxCite",
      "text",
    ]);
    expect(children[0].value).toBe("Cited claim");
    expect(children[1].data).toEqual({
      hName: "matrx-cite",
      hProperties: { "data-n": "2" },
    });
    expect(children[2].value).toBe(", and more.");
  });

  it("handles multiple markers and marker-only boundaries", () => {
    const tree = run(
      paragraph(text('<matrxcite n="1" /><matrxcite n="12" />tail')),
    );
    const children = tree.children![0].children!;
    expect(children.map((c) => c.type)).toEqual([
      "matrxCite",
      "matrxCite",
      "text",
    ]);
    expect(
      (children[1].data?.hProperties as Record<string, string>)["data-n"],
    ).toBe("12");
  });

  it("leaves code/inlineCode untouched and plain text unmutated", () => {
    const codeNode: MdastNode = {
      type: "inlineCode",
      value: '<matrxcite n="1" />',
    };
    const tree = run(paragraph(codeNode, text("no markers here")));
    const children = tree.children![0].children!;
    expect(children[0]).toBe(codeNode);
    expect(children.map((c) => c.type)).toEqual(["inlineCode", "text"]);
  });
});
