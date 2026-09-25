/**
 * "Download as Word" produces a real .docx (a zip whose document.xml carries
 * the content) through the ONE print-grade document tree.
 */
let captured: { bytes: Uint8Array; fileName: string; mime: string } | null = null;
jest.mock("@ai-matrx/print/document", () => {
  const actual = jest.requireActual("@ai-matrx/print/document");
  return {
    ...actual,
    downloadDocumentExport: (exp: typeof captured) => {
      captured = exp;
    },
  };
});
jest.mock("@/lib/toast", () => ({
  toast: { loading: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

import "../handlers";
import { getAction } from "../registry";
import { chatContext } from "../../test-utils/chatContext";
import JSZip from "jszip";

it("writes a .docx whose document body holds the table text", async () => {
  await getAction("download-docx")!.run(chatContext("assistant"));
  expect(captured).not.toBeNull();
  expect(captured!.fileName).toMatch(/\.docx$/);
  const zip = await JSZip.loadAsync(captured!.bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  expect(xml).toContain("Gold");
  expect(xml).toContain("60 days");
});
