// GUARD: every rich-content surface copies through THE one copy module
// (`copyRichContent` in components/matrx/buttons/markdown-copy-utils.ts —
// Copy = formatted + markdown, Copy markdown, Copy text). A raw
// `navigator.clipboard.write*` in a rich-content host is a second copy that
// gives the person one flavor and no choice (Arman, 2026-10-04).
//
// Not every clipboard write is rich text: an id, a link, raw code, JSON, a
// diagnostics report keep their own raw copy. Those are listed below WITH the
// reason; a new raw write in a host directory fails until it is routed or listed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");

/** Where rich content is shown or edited. */
const HOST_DIRS = [
  "features/rich-document",
  "features/notes",
  "features/flashcards",
  "components/selection-toolbar",
  "components/rich-editor",
  "components/markdown-studio",
  "components/official/content-editor",
  "components/mardown-display/chat-markdown",
  "packages/chat/src/agents/components/messages-display",
  "packages/chat/src/tool-call-visualization",
];

/** Raw writes that are NOT rich text — file → why. */
const RAW_ALLOWED: Record<string, string> = {
  "components/selection-toolbar/selection-copy.ts": "the module's own ⌘C markdown upgrade (formatted + markdown item)",
  "components/rich-editor/panels/OutlinePanel.tsx": "a heading's link (URL)",
  "components/rich-editor/visual/nodes/IslandBlockView.tsx": "a code/island block's raw bytes (code keeps its raw copy)",
  "components/mardown-display/chat-markdown/InlineCodeSnippet.tsx": "inline code (raw)",
  "components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx": "the diagnostics report buttons (useCopyButton), not the document",
  "components/mardown-display/chat-markdown/analyzer/analyzer-options/IntelligentViewer.tsx": "admin analyzer: bookmark paths",
  "components/mardown-display/chat-markdown/analyzer/analyzer-options/FlatSectionViewer.tsx": "admin analyzer: bookmark paths",
  "components/mardown-display/chat-markdown/analyzer/analyzer-options/sections-viewer.tsx": "admin analyzer: section JSON",
  "components/mardown-display/chat-markdown/analyzer/analyzer-options/lines-viewer.tsx": "admin analyzer: parsed line dump",
  "components/mardown-display/chat-markdown/analyzer/analyzer-options/viewer-utilities.tsx": "admin analyzer: structure dump",
  "components/markdown-studio/AnalysisView.tsx": "studio analysis: metrics and finding lists",
  "components/markdown-studio/lab/ServerEventInspector.tsx": "lab: raw server events",
  "features/rich-document/actions/handlers/share.ts": "a share link (URL)",
  "packages/chat/src/tool-call-visualization/components/ToolTabBodies.tsx": "a tool's raw arguments / result JSON",
  "packages/chat/src/tool-call-visualization/result-fields/ShortId.tsx": "an id",
  "packages/chat/src/tool-call-visualization/renderers/note/NoteToolParts.tsx": "a note id",
  "packages/chat/src/tool-call-visualization/renderers/get-user-lists/UserListsOverlay.tsx": "a list id",
};

const RAW_WRITE = /navigator\.clipboard\.(?:write|writeText)\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.|\.spec\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Files under `root`'s host dirs with a raw clipboard write that is not allowed. */
export function rawRichCopies(root: string, dirs: readonly string[], allowed: Record<string, string>): string[] {
  const offenders: string[] = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (allowed[rel]) continue;
      if (RAW_WRITE.test(fs.readFileSync(file, "utf8"))) offenders.push(rel);
    }
  }
  return offenders.sort();
}

describe("rich-content copy goes through the one module", () => {
  test("no rich-content host writes the clipboard raw", () => {
    const offenders = rawRichCopies(ROOT, HOST_DIRS, RAW_ALLOWED);
    if (offenders.length) {
      throw new Error(
        "A rich-content surface writes the clipboard outside the one copy module. Route it through " +
          "copyRichContent (components/matrx/buttons/markdown-copy-utils.ts) — or, if it copies an id, a link, " +
          `raw code or JSON, list it in RAW_ALLOWED with the reason:\n  ${offenders.join("\n  ")}`,
      );
    }
  });

  test("every allow-list entry still exists and still writes raw (no stale exemptions)", () => {
    const stale = Object.keys(RAW_ALLOWED).filter((rel) => {
      const file = path.join(ROOT, rel);
      return !fs.existsSync(file) || !RAW_WRITE.test(fs.readFileSync(file, "utf8"));
    });
    expect(stale).toEqual([]);
  });

  test("the detector goes red on a planted raw copy and green once routed (self-proof)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rich-copy-census-"));
    const host = path.join(tmp, "features/notes/components");
    fs.mkdirSync(host, { recursive: true });
    const planted = path.join(host, "NoteCopy.tsx");
    fs.writeFileSync(planted, "export const c = (s: string) => navigator.clipboard.writeText(s);\n");
    expect(rawRichCopies(tmp, ["features/notes"], {})).toEqual(["features/notes/components/NoteCopy.tsx"]);
    fs.writeFileSync(planted, 'import { copyRichContent } from "x";\nexport const c = (s: string) => copyRichContent(s);\n');
    expect(rawRichCopies(tmp, ["features/notes"], {})).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
