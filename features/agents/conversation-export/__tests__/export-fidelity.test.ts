/**
 * An exported conversation carries REAL tables and TYPESET math through the
 * one package exporter — never an `<artifact>` envelope, a paragraph of pipes
 * or raw `$$…$$` (verify-RC-B9 F1/F2) — and a stray `$$` in the user's prose
 * never swallows the answer's formula (verify-RC-B10 F2: the old app-side
 * math pre-pass paired them and printed "Energy FormulaE = \\int…").
 */

import JSZip from "jszip";
import { exportDocument } from "@ai-matrx/print/document";
import { documentMarkdown } from "../document-markdown";
import { loadFullConversationHistory } from "../load-full-history";

const ANSWER = [
  "## You",
  "",
  "Give me the kiln energy formula in $$ form, and the firing segments.",
  "",
  "## Assistant",
  "",
  '<artifact type="table" id="t1" version="1" title="Table 1">',
  "| Segment | Rate |",
  "|---|---|",
  "| Candle | 80 C/h |",
  "</artifact>",
  "",
  "### Energy Formula",
  "",
  "$$E = \\int_0^t P \\, dt$$",
  "",
  "Growth follows \\(a^2 + b^2\\).",
  "",
  "```python",
  'print("$$not math$$")',
  "```",
].join("\n");

describe("documentMarkdown", () => {
  it("unwraps kind envelopes and leaves math and code to the package", () => {
    const out = documentMarkdown(ANSWER);
    expect(out).not.toContain("<artifact");
    expect(out).toContain("| Candle | 80 C/h |");
    expect(out).toContain("$$E = \\int_0^t P \\, dt$$");
  });
});

describe("the package receives real structure and typesets the math", () => {
  it("HTML: a <table>, MathML for the formula, the prose $$ kept, the heading its own", async () => {
    const exp = await exportDocument(documentMarkdown(ANSWER), "html", { fileName: "x" });
    const html = Buffer.from(exp.bytes as Uint8Array).toString("utf8");
    expect(html).toContain("<table");
    expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
    expect(html).toContain("in $$ form");
    expect(html).toMatch(/<h3[^>]*>Energy Formula<\/h3>/);
    expect(html.replace(/<pre[\s\S]*?<\/pre>/g, "")).not.toContain("\\int");
  });

  it("Word: a real table (w:tbl) and a native equation (m:oMath)", async () => {
    const exp = await exportDocument(documentMarkdown(ANSWER), "docx", { fileName: "x" });
    const zip = await JSZip.loadAsync(exp.bytes as Uint8Array);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toMatch(/<w:tbl[ >]/);
    expect(doc).toContain("<m:oMath>");
    expect(doc).not.toContain("&lt;artifact");
  });
});

describe("loadFullConversationHistory", () => {
  it("pages older messages until the server says there are none, reporting progress", async () => {
    let pages = 3;
    const entry = { hasMoreOlder: true, orderedIds: ["a"] };
    const dispatch = jest.fn(() => ({
      unwrap: async () => {
        pages -= 1;
        entry.orderedIds.push(`p${pages}`);
        entry.hasMoreOlder = pages > 0;
        return { hasMoreOlder: entry.hasMoreOlder };
      },
    }));
    const progress: number[] = [];
    const result = await loadFullConversationHistory(
      dispatch as never,
      () => ({ messages: { byConversationId: { c1: entry } } }) as never,
      "c1",
      (loaded) => progress.push(loaded),
    );
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ complete: true, loaded: 4 });
    expect(progress.at(-1)).toBe(4);
  });

  it("says so when history could not be fully read", async () => {
    const entry = { hasMoreOlder: true, orderedIds: ["a"] };
    const dispatch = jest.fn(() => ({ unwrap: async () => Promise.reject({ reason: "network" }) }));
    const result = await loadFullConversationHistory(
      dispatch as never,
      () => ({ messages: { byConversationId: { c1: entry } } }) as never,
      "c1",
    );
    expect(result).toEqual({ complete: false, loaded: 1 });
  });
});
