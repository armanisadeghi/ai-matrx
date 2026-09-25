/**
 * Whole-conversation export. The Markdown is the one source every format is
 * built from (HTML/PDF through @ai-matrx/print, DOCX through the same HTML), so
 * the Markdown contract is pinned here, and the DOCX must be a real Office Open
 * XML package Word opens — not an HTML file with a .docx name.
 */

import JSZip from "jszip";
import { buildConversationMarkdown } from "../conversation-markdown";
import { buildDocxFromHtml } from "../docx";

describe("buildConversationMarkdown", () => {
  it("writes a titled transcript with one section per turn", () => {
    const md = buildConversationMarkdown({
      title: "Quarterly plan",
      exportedAt: new Date("2026-09-25T10:00:00Z"),
      messages: [
        { role: "user", text: "What changed in Q3?", createdAt: "2026-09-25T09:00:00Z" },
        { role: "assistant", text: "| Month | Rev |\n|---|---|\n| Jul | 10 |", createdAt: null },
        { role: "assistant", text: "   " },
        { role: "system", text: "hidden system prompt" },
      ],
      assistantLabel: "Analyst",
    });
    expect(md.startsWith("# Quarterly plan\n")).toBe(true);
    expect(md).toContain("## You");
    expect(md).toContain("What changed in Q3?");
    expect(md).toContain("## Analyst");
    expect(md).toContain("| Month | Rev |");
    expect(md).not.toContain("hidden system prompt");
    // Blank turns are skipped, not rendered as empty headings.
    expect(md.match(/## Analyst/g)).toHaveLength(1);
  });

  it("marks pinned messages so a reader sees what mattered", () => {
    const md = buildConversationMarkdown({
      title: "t",
      messages: [{ role: "assistant", text: "Keep this", pinned: true }],
    });
    expect(md).toContain("## Assistant (pinned)");
  });
});

describe("buildDocxFromHtml", () => {
  it("builds a real .docx package that carries the HTML as its body", async () => {
    const blob = await buildDocxFromHtml("<h1>Hi</h1><p>Body</p>", "My chat");
    const zip = await JSZip.loadAsync(blob);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "_rels/.rels",
        "word/document.xml",
        "word/_rels/document.xml.rels",
        "word/afchunk.htm",
      ]),
    );
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain('<w:altChunk r:id="htmlChunk"/>');
    const chunk = await zip.file("word/afchunk.htm")!.async("string");
    expect(chunk).toContain("<p>Body</p>");
    expect(chunk).toContain("<title>My chat</title>");
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});
