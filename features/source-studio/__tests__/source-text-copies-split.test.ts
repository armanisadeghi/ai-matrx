// GUARD: a Source's text copies through THE split Copy (Arman, 2026-10-04: "one click to get either
// the markdown version or the no-markup version"; 2026-10-07: stray extracted text moved onto its
// Source, so the Source screen is where every extracted text is read and copied).
//
// The Source screen (features/source-studio/components/SourceStudio.tsx) and the PDF studio share
// one pane header (`PaneHeader` in features/pdf-extractor/studio/PdfStudioReader.tsx). Its whole-pane
// copy must be `CopySplitButton` over `copyRichContent` — one click copies the person's default
// flavor, the chevron offers markdown or plain text — never a single-flavor `copyText` icon.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const READER = path.join(ROOT, "features/pdf-extractor/studio/PdfStudioReader.tsx");
const STUDIO = path.join(ROOT, "features/source-studio/components/SourceStudio.tsx");

function paneHeaderBody(src: string): string {
  const start = src.indexOf("export function PaneHeader(");
  expect(start).toBeGreaterThan(-1);
  const next = src.indexOf("\nfunction ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("a Source's text copies through the split Copy", () => {
  it("PaneHeader's whole-pane copy is CopySplitButton over copyRichContent", () => {
    const body = paneHeaderBody(fs.readFileSync(READER, "utf8"));
    expect(body).toMatch(/<CopySplitButton\b/);
    expect(body).toMatch(/copyRichContent\(/);
    expect(body).not.toMatch(/<CopyIconButton[^>]*getText=\{onCopyAll\}/);
  });

  it("the Source screen's Raw/Clean pane hands its text to that copy", () => {
    const studio = fs.readFileSync(STUDIO, "utf8");
    expect(studio).toMatch(/onCopyAll=\{portion \? \(\) => text : undefined\}/);
  });
});
