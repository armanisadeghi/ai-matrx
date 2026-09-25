/**
 * RC-B9 verifier F1/F2 (evidence/verify-RC-B9.md): an exported conversation
 * must carry REAL tables and RENDERED math through the one package exporter —
 * never an `<artifact>` envelope, a paragraph of pipes, or raw `$$…$$` — and
 * "whole conversation" must mean every message, not the loaded window.
 */

import JSZip from "jszip";
import { exportDocument } from "@ai-matrx/print/document";
import { prepareDocumentMarkdown } from "../document-markdown";
import { loadFullConversationHistory } from "../load-full-history";

// 1×1 transparent PNG — stands in for the browser KaTeX rasterizer.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const ANSWER = [
  "Here is the breakdown:",
  "",
  '<artifact type="table" id="t1" version="1" title="Table 1">',
  "| Region | Q1 |",
  "|---|---|",
  "| West | 12 |",
  "| Southwest | -8.2 |",
  "</artifact>",
  "",
  "Growth follows \\(a^2 + b^2\\) and:",
  "",
  "$$",
  "\\int_0^1 x\\,dx = \\frac{1}{2}",
  "$$",
  "",
  "```python",
  'print("$$not math$$")',
  "```",
].join("\n");

describe("prepareDocumentMarkdown", () => {
  it("unwraps kind envelopes, draws display math, reads inline math, leaves code alone", async () => {
    const out = await prepareDocumentMarkdown(ANSWER, { renderDisplayMath: async () => PNG });
    expect(out).not.toContain("<artifact");
    expect(out).toContain("| Southwest | -8.2 |");
    expect(out).toContain(`](${PNG})`);
    expect(out).toContain("a^2 + b^2");
    expect(out).toContain('print("$$not math$$")');
    const outsideCode = out.replace(/```[\s\S]*?```/g, "");
    expect(outsideCode).not.toContain("$$");
  });

  it("falls back to readable math when a formula cannot be drawn — never raw TeX delimiters", async () => {
    const out = await prepareDocumentMarkdown(ANSWER, { renderDisplayMath: async () => null });
    expect(out.replace(/```[\s\S]*?```/g, "")).not.toContain("$$");
    expect(out).toContain("∫\\_0^1 x  dx = 1/2");
  });
});

describe("the package receives real structure", () => {
  it("HTML has a <table> and the formula image, and no raw $$", async () => {
    const md = await prepareDocumentMarkdown(ANSWER, { renderDisplayMath: async () => PNG });
    const exp = await exportDocument(md, "html", { fileName: "x" });
    const html = Buffer.from(exp.bytes as Uint8Array).toString("utf8");
    expect(html).toContain("<table");
    expect(html).toContain("data:image/png");
    expect(html.replace(/<pre[\s\S]*?<\/pre>/g, "")).not.toContain("$$");
  });

  it("Word has a real table (w:tbl) and the formula as a picture (w:drawing)", async () => {
    const md = await prepareDocumentMarkdown(ANSWER, { renderDisplayMath: async () => PNG });
    const exp = await exportDocument(md, "docx", { fileName: "x" });
    const zip = await JSZip.loadAsync(exp.bytes as Uint8Array);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toMatch(/<w:tbl[ >]/);
    expect(doc).toContain("<w:drawing");
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
