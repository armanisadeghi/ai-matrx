import {
  clipText,
  escapeXml,
  xmlAttrs,
  xmlElement,
  xmlList,
  xmlText,
} from "../context-bundle";

describe("context bundle helpers", () => {
  it("escapes the five XML specials", () => {
    expect(escapeXml(`<a & "b" 'c'>`)).toBe("&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
  });

  it("omits empty attributes", () => {
    expect(xmlAttrs({ id: "n1", title: "  ", missing: undefined, none: null, count: 0 })).toBe(
      ' id="n1" count="0"',
    );
  });

  it("omits an element with nothing in it, and self-closes attribute-only elements", () => {
    expect(xmlElement("note", {}, ["", null])).toBe("");
    expect(xmlElement("note", { id: "n1" })).toBe('<note id="n1"/>');
    expect(xmlElement("note", { id: "n1" }, ["<body>x</body>"])).toBe(
      '<note id="n1"><body>x</body></note>',
    );
  });

  it("says when a text was clipped and how long it really is", () => {
    expect(clipText("abcdef", 3)).toEqual({ text: "abc", clipped: true, totalChars: 6 });
    expect(xmlText("content", "abcdef", { max: 3 })).toBe(
      '<content clipped="true" total_chars="6">abc</content>',
    );
    expect(xmlText("content", "abc", { max: 3 })).toBe("<content>abc</content>");
    expect(xmlText("content", "   ")).toBe("");
  });

  it("counts rows it drops instead of losing them silently", () => {
    const xml = xmlList("notes", [1, 2, 3], (n) => `<n id="${n}"/>`, { maxRows: 2 });
    expect(xml).toBe('<notes total="3" shown="2"><n id="1"/>\n<n id="2"/></notes>');
  });
});
