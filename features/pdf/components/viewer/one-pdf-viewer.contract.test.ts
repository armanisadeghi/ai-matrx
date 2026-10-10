/**
 * ONE PDF viewer — the source contract every PDF host is held to.
 *
 * Census 2026-10-09 (every place a PDF renders): one engine
 * (`PdfDocumentRenderer`) already drew the pages, but hosts kept growing
 * their own copies around it — a second cld-files wrapper that dropped
 * `withCredentials` (the extractor studio reader), a native <object>/<iframe>
 * viewer with the browser's own chrome (PDF demo results), host controls
 * absolutely positioned over the toolbar row (RAG PdfPane's surface switcher,
 * Analysis Studio's mode banner), and a toolbar that overflowed narrow panes
 * onto the neighbouring column. The fix put the missing knobs in the viewer;
 * this guard keeps hosts on them.
 *
 *   1. Only the renderer mounts react-pdf's <Document>/<Page>.
 *   2. Only PdfPreview turns a cld file id into PDF.js bytes
 *      (`usePdfRemoteSource`) — every other host composes PdfPreview.
 *   3. No host embeds a PDF with the browser's native viewer.
 *   4. The renderer's toolbar is drawn from the measured fold plan and exposes the
 *      host-chrome knobs (toolbar / pageNav / toolbarStart / toolbarEnd),
 *      and PdfPreview passes every one of them through.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "../../../..");
const SCAN_DIRS = ["app", "features", "components"];
const RENDERER = "features/pdf/components/viewer/PdfDocumentRenderer.tsx";
const PREVIEW = "features/pdf/components/viewer/PdfPreview.tsx";

/** Rasterizes pages to images for print — not a viewer. */
const RAW_PDFJS_ALLOWED = new Set(["features/print/document/pdfPages.tsx"]);
/**
 * Native-embed exceptions, each with its reason. Spaces stores a page as
 * portable HTML blocks that must render outside React too (exported pages);
 * it is a known second viewer, listed in features/pdf/FEATURE.md.
 */
const NATIVE_EMBED_ALLOWED = new Set(["features/spaces/editor/stored-blocks.tsx"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).map((f) => ({
  path: relative(ROOT, f),
  src: readFileSync(f, "utf8"),
}));

describe("one PDF viewer", () => {
  it("only PdfDocumentRenderer imports react-pdf's Document/Page", () => {
    const offenders = files
      .filter((f) => f.path !== RENDERER && !RAW_PDFJS_ALLOWED.has(f.path))
      .filter((f) =>
        /import\s*\{[^}]*\b(Document|Page)\b[^}]*\}\s*from\s*["']react-pdf["']/.test(f.src),
      )
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("only PdfPreview resolves cld-file bytes for PDF.js", () => {
    const offenders = files
      .filter((f) => f.path !== PREVIEW && !f.path.startsWith("features/pdf/hooks/"))
      .filter((f) => !f.path.startsWith("features/files/hooks/"))
      .filter((f) => /\busePdfRemoteSource\s*\(/.test(f.src))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("no host embeds a PDF with the browser's native viewer", () => {
    const offenders = files
      .filter((f) => !NATIVE_EMBED_ALLOWED.has(f.path))
      .filter(
        (f) =>
          /<object[^>]*application\/pdf/.test(f.src) ||
          /<embed[^>]*(application\/pdf|\.pdf)/.test(f.src) ||
          /<iframe[^>]*(\.pdf\b|pdfUrl|type === ["']pdf["'])/.test(f.src),
      )
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the renderer's toolbar adapts to its container and takes host chrome", () => {
    const src = readFileSync(join(ROOT, RENDERER), "utf8");
    // The row is drawn from the measured fold plan (toolbar/toolbar-plan.ts,
    // proven by toolbar-plan.test.ts) — never from blind CSS breakpoints.
    expect(src).toMatch(/planPdfToolbar\(\{\s*width: containerSize\.width/);
    expect(src).not.toMatch(/@\[\d+rem\]\/pdf-viewer/);
    expect(src).not.toMatch(/\bsm:h-7\b/);
    expect(src).toContain('aria-label="More view options"');
    for (const knob of ["toolbar?:", "pageNav?:", "toolbarStart?:", "toolbarEnd?:"]) {
      expect(src).toContain(knob);
    }
    const preview = readFileSync(join(ROOT, PREVIEW), "utf8");
    for (const pass of [
      "toolbar={toolbar}",
      "pageNav={pageNav}",
      "toolbarStart={toolbarStart}",
      "toolbarEnd={toolbarEnd}",
    ]) {
      expect(preview).toContain(pass);
    }
  });
});
