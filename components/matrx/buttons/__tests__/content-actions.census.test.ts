// GUARD: every rich-content DISPLAY surface carries THE content action set (Arman, 2026-10-08:
// "wherever we display content, copy, export, print, transform and things like are instantly
// available and a click away" · "plain text one click away without complexity while the default
// for display should be our beautiful view").
//
// The set is `ContentActions` (@ai-matrx/rich-content/copy/ContentActions): split Copy, Plain,
// Export (one click → PDF · Word · HTML · Markdown file · Text file), Print, Transform. A host gets it
// through `<RichCopySplit>` (chat), the rich-document bar (`<RichDocument actionsVariant="bar">`,
// `<RichDocumentActions>`, `<RichDocumentActionSurface>`), or `<ContentActions>` itself.
//
// Three checks:
//   1. the INSTALLED packages really render the set (RichCopySplit → ContentActions; the rich-document
//      bar → ContentActions; ContentActions exposes Export and Print as one-click controls);
//   2. every display surface below renders the set;
//   3. every `<RichCopySplit>` in a host directory wires Plain (`viewKey=`) — or is listed WITH why.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");
const pkg = (rel: string) => path.join(ROOT, "node_modules/@ai-matrx", rel);

function read(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

/** The installed module for a subpath, dist first (the published shape), src as the fallback. */
function installed(name: string, sub: string): string {
  for (const candidate of [`${name}/dist/${sub}.js`, `${name}/src/${sub}.tsx`, `${name}/src/${sub}.ts`]) {
    const text = read(pkg(candidate));
    if (text) return text;
  }
  return "";
}

/** Display surfaces → why they are one. Each must render the content action set. */
const SURFACES: Record<string, string> = {
  "../aidream/apps/shared/chat/src/agents/components/messages-display/assistant/AssistantMessageFooter.tsx": "chat answers (page, window panels, side drawer)",
  "features/notes/components/NoteMetadataBar.tsx": "notes header (Read and Write)",
  "features/education/study-guides/components/StudyGuideReader.tsx": "study guides",
  "features/flashcards/components/set-detail/SetDetailView.tsx": "flashcard deck",
  "features/documents/components/DocumentRecord.tsx": "documents (Univer)",
  "features/rag/components/library/ChunkList.tsx": "sources and their chunks",
  "features/tasks/components/editor/TaskEditorCopyButtons.tsx": "tasks",
  "features/transcripts/components/TranscriptViewer.tsx": "transcripts",
  "features/message-templates/components/TemplateViewPage.tsx": "message template view",
  "components/markdown-studio/PreviewPanel.tsx": "Markdown Studio",
  "features/notes/components/mobile/NoteEditorDock.tsx": "notes on a phone (the dock's More sheet carries the rows)",
  "features/flashcards/components/study/StudyDeck.tsx": "a single flashcard (study card view)",
  "features/organizations/peek/kinds/TablePeek.tsx": "table peek",
  "features/message-templates/components/TemplateCard.tsx": "message template card preview",
  "features/spaces/page/SpacePage.tsx": "Spaces pages",
};

const SET = /<RichCopySplit\b|<ContentActions\b|<ContentActionMenuRows\b|<RichDocumentActions\b|<RichDocumentActionSurface\b|actionsVariant="bar"/;

/** Where `<RichCopySplit>` hosts live. */
const HOST_DIRS = ["features", "components", "app", "../aidream/apps/shared/chat/src"];

/** RichCopySplit hosts with no Plain switch → why (the content shown is already its plain text). */
const NO_PLAIN: Record<string, string> = {
  "features/rag/components/library/ChunkList.tsx": "a chunk is shown as its raw text already (<pre>)",
  "components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx": "an editor: its Source tab is the plain view",
  "features/window-panels/windows/page-extraction/ExtractionCellEditorWindow.tsx": "a cell editor: the textarea is the plain view",
  "features/tasks/components/editor/TaskEditorCopyButtons.tsx": "the task editor's fields are plain text already",
  "features/marketing/seo/topical-map/views/TextView.tsx": "the Text view is the map's plain text",
  "components/mardown-display/blocks/scraper-kinds/ScrapedPageBlock.tsx": "its own Pretty / Raw tabs are the switch",
  "features/transcripts/components/TranscriptViewer.tsx": "segments are shown as their text already",
  "../aidream/apps/shared/chat/src/ui/markdown-stream/EnhancedChatMarkdown.tsx": "the renderer's floating copy; display hosts hide it (hideCopyButton) and carry the bar",
};

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

export function splitsWithoutPlain(root: string, dirs: string[], allowed: Record<string, string>): string[] {
  const bad: string[] = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file);
      if (rel.endsWith("agent-copy/RichCopySplit.tsx")) continue;
      const text = fs.readFileSync(file, "utf8");
      const uses = text.split(/<RichCopySplit\b/).slice(1);
      if (uses.length === 0 || allowed[rel]) continue;
      // Each use's own props run to the first `/>`.
      if (uses.some((use) => !/\bviewKey=/.test(use.slice(0, use.indexOf("/>"))))) bad.push(rel);
    }
  }
  return bad.sort();
}

describe("content-actions census", () => {
  it("the installed packages render the set (Copy, Plain, Export, Print, Transform — one click each)", () => {
    const actions = installed("rich-content", "copy/ContentActions");
    expect(actions).toMatch(/data-content-export-trigger/);
    expect(actions).toMatch(/data-content-print/);
    expect(actions).toMatch(/data-content-transform/);
    expect(actions).toMatch(/data-content-plain-toggle/);
    expect(installed("chat", "agent-copy/RichCopySplit")).toMatch(/ContentActions/);
    expect(installed("rich-content", "rich-document/variants/ActionBar")).toMatch(/ContentActions/);
  });

  it("every display surface renders the content action set", () => {
    const missing = Object.entries(SURFACES)
      .filter(([file]) => !SET.test(read(path.join(ROOT, file))))
      .map(([file, why]) => `${file} (${why})`);
    expect(missing).toEqual([]);
  });

  it("every RichCopySplit host wires Plain (viewKey) or says why it has none", () => {
    expect(splitsWithoutPlain(ROOT, HOST_DIRS, NO_PLAIN)).toEqual([]);
    for (const file of Object.keys(NO_PLAIN)) expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
  });

  it("the Plain check can fail", () => {
    const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "content-actions-"));
    fs.mkdirSync(path.join(tmp, "features"), { recursive: true });
    const host = path.join(tmp, "features/Host.tsx");
    fs.writeFileSync(host, '<RichCopySplit human={t} label="a" />');
    expect(splitsWithoutPlain(tmp, ["features"], {})).toEqual(["features/Host.tsx"]);
    fs.writeFileSync(host, '<RichCopySplit human={t} label="a" viewKey={k} />');
    expect(splitsWithoutPlain(tmp, ["features"], {})).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
