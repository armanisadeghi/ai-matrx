// GUARD (1): every rich-content surface copies through THE one copy module
// (`copyRichContent` in components/agent-copy/copy-commands.ts, which writes through kit's `copyText`/`copyRich`:
// ONE clean plain flavor per click — Copy = the person's default flavor (markdown, or readable text),
// Copy markdown, Copy plain text; Formatted HTML is the Alchemy palette's own tile). A raw
// `navigator.clipboard.write*` in a rich-content host is a second copy that
// gives the person one flavor and no choice (Arman, 2026-10-04).
//
// Not every clipboard write is rich text — an id, a link, raw code, JSON — but none of those is raw
// either: they go through `copyToClipboard` (@/lib/clipboard/copy) / kit `copyText`. The allow-list
// is empty; a new raw write in a host directory fails until it is routed (or listed WITH the reason).

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
  "../aidream/apps/shared/chat/src/agents/components/messages-display",
  "../aidream/apps/shared/chat/src/tool-call-visualization",
  "features/chat-tool-renderers",
];

/** Raw writes that are NOT rich text — file → why. */
const RAW_ALLOWED: Record<string, string> = {};

const RAW_WRITE = /navigator\.clipboard\s*\??\.\s*(?:write|writeText)\s*\(/;

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
          "copyRichContent (components/agent-copy/copy-commands.ts) — or, if it copies an id, a link, " +
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

// ═══════════════════════════════════════════════════════════════════════════
// GUARD (2), Arman 2026-10-04 + the 2026-10-07 live review: "one click to get
// either the markdown version or the no-markup version, everywhere". The chat
// answer's one-click Copy gave raw `<artifact>` tags while its menu's "Copy
// markdown" gave clean text, and notes offered no plain-text choice. So:
//   A. the shared bars (rich-content, installed) lead with the split Copy whose
//      one click runs the SAME registry rows as the ⋯ "Copy as" menu;
//   B. a markdown host's Alchemy trigger is never a one-click copy of its own —
//      it renders the split (`RichCopySplit`) or is triggerHidden behind one;
//   C. every host that copies rich content offers plain text one click away;
//   D. inside one host, every copy copies the SAME source (button = menu).
// ═══════════════════════════════════════════════════════════════════════════

const SPLIT = /\b(CopySplitButton|RichCopySplit|TextCopySplit|TextCopyChevron)\b/;
const ALCHEMY_TRIGGER = /<(CopyButtons|MatrxCopyMenu|ContentTransferMenu|AlchemyDocumentMenu)\b([\s\S]*?)\/>/g;

/** Hosts that copy one flavor on purpose — file → why there is no plain-text choice to make. */
const ONE_FLAVOR: Record<string, string> = {
  "../aidream/apps/shared/chat/src/agents/components/messages-display/assistant/InPlaceAnswerEditor.tsx":
    "the stale-save toast's \"Copy my edit\" hands back the person's own markdown to paste into the editor",
  "../aidream/apps/shared/chat/src/tool-call-visualization/renderers/research/ResearchOverlay.tsx":
    "fetched web page text — it has no markup to strip",
  "components/markdown-studio/MarkdownStudio.tsx": "\"Copy source\" in a markdown studio: the source IS the point",
  "features/notes/components/NoteContentEditor.tsx": "Share → clipboard row; the note's split Copy sits in its bar",
  "features/notes/components/NoteTabItem.tsx": "the tab's menu row; the note's split Copy sits in its bar",
  "features/rich-document/actions/handlers/copy.ts":
    "the registry's Copy row; its siblings Copy markdown / Copy plain text (transfer.ts) sit beside it in the same menu",
};

/** Files whose copies copy different sources on purpose — file → why. */
const MIXED_SOURCES: Record<string, string> = {
  "features/rich-document/actions/handlers/copy.ts": "\"Copy with thinking\" copies the stored record WITH its reasoning — a different document by design",
  "components/official/content-editor/CopyDropdownButton.tsx": "\"Copy with thinking\" keeps the reasoning blocks by design",
  "../aidream/apps/shared/chat/src/tool-call-visualization/renderers/research/ResearchOverlay.tsx": "one read's copy vs Copy all: two different documents",
};

function hostFiles(root: string, dirs: readonly string[]): Array<{ rel: string; src: string }> {
  return dirs.flatMap((dir) =>
    walk(path.join(root, dir)).map((file) => ({
      rel: path.relative(root, file).split(path.sep).join("/"),
      src: fs.readFileSync(file, "utf8"),
    })),
  );
}

/** B: a markdown Alchemy trigger that is its own one-click copy (not hidden behind a split). */
export function oneClickAlchemyCopies(root: string, dirs: readonly string[]): string[] {
  const out: string[] = [];
  for (const { rel, src } of hostFiles(root, dirs)) {
    for (const match of src.matchAll(ALCHEMY_TRIGGER)) {
      const props = match[2] ?? "";
      const markdown = /contentFlavor=["{]+markdown/.test(props) || match[1] === "AlchemyDocumentMenu";
      if (markdown && !/\btriggerHidden\b/.test(props)) out.push(`${rel} <${match[1]}>`);
    }
  }
  return out.sort();
}

/** C: hosts that copy rich content with no plain-text choice. */
export function noPlainChoice(root: string, dirs: readonly string[], oneFlavor: Record<string, string>): string[] {
  return hostFiles(root, dirs)
    .filter(({ rel, src }) => /copyRichContent\(/.test(src) && !oneFlavor[rel])
    .filter(({ src }) => !SPLIT.test(src) && !/copyRichContent\([^;]*?["']text["']/.test(src) && !/["']text["']\s*(?:as const)?\s*[,})\]]/.test(src))
    .map(({ rel }) => rel)
    .sort();
}

/** D: one host, different sources: `copyRichContent(<source>, …)` first arguments must agree. */
export function mixedSources(root: string, dirs: readonly string[], mixed: Record<string, string>): string[] {
  const out: string[] = [];
  for (const { rel, src } of hostFiles(root, dirs)) {
    if (mixed[rel]) continue;
    const sources = new Set([...src.matchAll(/copyRichContent\(\s*([^,)]+?)\s*[,)]/g)].map((m) => m[1]));
    if (sources.size > 1) out.push(`${rel}: ${[...sources].join(" | ")}`);
  }
  return out.sort();
}

const INSTALLED = path.join(ROOT, "node_modules/@ai-matrx/rich-content/dist");

describe("one click: markdown or plain text, and the button equals the menu", () => {
  test("A. the chat answer bar leads with the split Copy running the same rows as its menu", () => {
    const bar = fs.readFileSync(path.join(INSTALLED, "rich-document/variants/ActionBar.js"), "utf8");
    // The bar leads with THE content action set (2026-10-08), whose first control is the split Copy.
    expect(bar).toMatch(/ContentActions/);
    expect(fs.readFileSync(path.join(INSTALLED, "copy/ContentActions.js"), "utf8")).toMatch(/CopySplitButton/);
    expect(bar).toMatch(/"copy-markdown"/);
    expect(bar).toMatch(/"copy-plain-text"/);
    expect(bar).toMatch(/triggerHidden/);
    // …and those two rows are the registry's "Copy as" rows, over the one cleaned source.
    const transfer = fs.readFileSync(path.join(ROOT, "features/rich-document/actions/handlers/transfer.ts"), "utf8");
    expect(transfer).toMatch(/id: "copy-markdown"[\s\S]*?copyRichContent\(contentForDestination\(ctx\), "markdown"\)/);
    expect(transfer).toMatch(/id: "copy-plain-text"[\s\S]*?copyRichContent\(contentForDestination\(ctx\), "text"\)/);
    const copy = fs.readFileSync(path.join(ROOT, "features/rich-document/actions/handlers/copy.ts"), "utf8");
    expect(copy).toMatch(/id: "copy",[\s\S]*?copyRichContent\(contentForDestination\(ctx\), "default"\)/);
  });

  test("A. the selection toolbar leads with the split Copy", () => {
    const frame = fs.readFileSync(path.join(INSTALLED, "selection-toolbar/SelectionToolbarFrame.js"), "utf8");
    expect(frame).toMatch(/CopySplitButton/);
    expect(frame).toMatch(/copySelection/);
  });

  test("B. no markdown host's Alchemy trigger is a one-click copy of its own", () => {
    expect(oneClickAlchemyCopies(ROOT, HOST_DIRS)).toEqual([]);
  });

  test("C. every rich-content host offers plain text one click away", () => {
    expect(noPlainChoice(ROOT, HOST_DIRS, ONE_FLAVOR)).toEqual([]);
  });

  test("D. inside one host, the one-click and the menu copy the same source", () => {
    expect(mixedSources(ROOT, HOST_DIRS, MIXED_SOURCES)).toEqual([]);
  });

  test("no stale exemptions", () => {
    for (const rel of [...Object.keys(ONE_FLAVOR), ...Object.keys(MIXED_SOURCES)]) {
      expect([rel, fs.existsSync(path.join(ROOT, rel)) && /copyRichContent\(/.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))]).toEqual([rel, true]);
    }
  });

  test("B/C/D detectors go red on planted hosts and green once fixed (self-proof)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rich-copy-split-"));
    const dir = path.join(tmp, "features/notes/components");
    fs.mkdirSync(dir, { recursive: true });
    const planted = path.join(dir, "NoteBar.tsx");
    fs.writeFileSync(planted, '<CopyButtons human={md} contentFlavor="markdown" />\nconst c = () => copyRichContent(raw, "default");\nconst m = () => copyRichContent(clean, "markdown");\n');
    expect(oneClickAlchemyCopies(tmp, ["features/notes"])).toEqual(["features/notes/components/NoteBar.tsx <CopyButtons>"]);
    expect(noPlainChoice(tmp, ["features/notes"], {})).toEqual(["features/notes/components/NoteBar.tsx"]);
    expect(mixedSources(tmp, ["features/notes"], {})).toEqual(["features/notes/components/NoteBar.tsx: raw | clean"]);
    fs.writeFileSync(planted, '<RichCopySplit human={md} contentFlavor="markdown" />\nconst c = (f) => copyRichContent(clean, f);\n');
    expect(oneClickAlchemyCopies(tmp, ["features/notes"])).toEqual([]);
    expect(noPlainChoice(tmp, ["features/notes"], {})).toEqual([]);
    expect(mixedSources(tmp, ["features/notes"], {})).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GUARD (3), Arman 2026-10-07 "consistency everywhere": GUARD (1) and (2) only
// walked 11 host directories, so the old Alchemy `CopyButtons` kept living on
// markdown in the flashcard app, the task editor, the transcript viewer, the
// scraped-page block… This one walks the WHOLE source tree:
//   E. no component that renders markdown/rich text offers the old one-click
//      Alchemy copy or a raw clipboard write — it renders the split Copy;
//   F. the named hosts carry the split Copy (and not the old trigger);
//   G. there is ONE split-Copy build (the package's) — no second menu of our own;
//   H. the split's palette does not repeat the split's own two rows;
//   I. the sibling decisions of the same review hold (one template editor, the
//      phone dock is measured chrome so toasts rest above it).
// Proof against any tree: RICH_COPY_CENSUS_ROOT=<dir with the source folders>.
// ═══════════════════════════════════════════════════════════════════════════

const REPO_DIRS = ["app", "components", "features", "packages", "lib", "providers", "hooks"];
const REPO_ROOT = process.env.RICH_COPY_CENSUS_ROOT ? path.resolve(process.env.RICH_COPY_CENSUS_ROOT) : ROOT;

/** A file that renders markdown or rich text. */
const RENDERS_MARKDOWN =
  /\b(MarkdownCore|MarkdownStream|EnhancedChatMarkdown|ChatMarkdownRenderer|BasicMarkdownContent|RichContent|RichDocument|ReactMarkdown|MarkdownRenderer)\b/;

/** The copy module's own files — they define the menus the rule is about. */
const COPY_DEFINITIONS = /^components\/agent-copy\//;

/** Old Alchemy trigger / raw clipboard on a markdown host that is NOT markdown copy — file → why. */
const RECORD_SUMMARY =
  "record-level copy: the readable summary of a record (with its JSON / agent payload) beside the record, not the markdown body the file also renders";
const NOT_MARKDOWN_COPY: Record<string, string> = {
  "app/(admin)/administration/users/feedback/components/AnnouncementTable.tsx": RECORD_SUMMARY,
  "app/(admin)/administration/users/feedback/components/FeedbackDetailDialog.tsx": RECORD_SUMMARY,
  "features/agents/route/AgentViewContent.tsx": RECORD_SUMMARY,
  "features/hindsight/components/FindingCard.tsx": RECORD_SUMMARY,
  "features/masterwork/record/ExpertRecordPage.tsx": RECORD_SUMMARY,
  "features/research/components/synthesis/SynthesisList.tsx": RECORD_SUMMARY,
  "features/workflow-runtime/components/readout-parts.tsx": RECORD_SUMMARY,
  "../aidream/apps/shared/chat/src/agents/components/context-preview/ContextCompareView.tsx":
    "copies a context block exactly as shown (prompt text, not rendered markdown); uses the chat package's host slot",
};

function repoFiles(root: string): Array<{ rel: string; src: string }> {
  const out: Array<{ rel: string; src: string }> = [];
  const visit = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["__tests__", "node_modules", ".next", "dist"].includes(entry.name)) continue;
        visit(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.|\.spec\.|\.d\.ts$/.test(entry.name)) {
        out.push({ rel: path.relative(root, full).split(path.sep).join("/"), src: fs.readFileSync(full, "utf8") });
      }
    }
  };
  for (const dir of REPO_DIRS) visit(path.join(root, dir));
  return out;
}

const WRAPPER_NAME = /(Markdown|RichText|Prose)[A-Za-z]*$/;

/**
 * The components that render markdown through a wrapper: every component a markdown-rendering file
 * exports. A host drawing `<TemplateRichText>` renders markdown as surely as one drawing `<MarkdownCore>`
 * — the 2026-10-07 gap: the template page's old one-click copy sat beside `TemplateRichText`, and the
 * census only knew the renderer names themselves.
 */
export function markdownWrappers(files: ReadonlyArray<{ rel: string; src: string }>): Set<string> {
  const names = new Set<string>();
  for (const { src } of files) {
    if (!RENDERS_MARKDOWN.test(src)) continue;
    for (const m of src.matchAll(/export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9]*)/g)) {
      // A wrapper whose NAME says it draws text (…Markdown, …RichText, …Prose); a page that also
      // exports a table or a card is not a markdown wrapper.
      if (WRAPPER_NAME.test(m[1]!)) names.add(m[1]!);
    }
  }
  return names;
}

/** A file that renders markdown itself or through a wrapper component. */
function rendersMarkdown(src: string, wrappers: ReadonlySet<string>): boolean {
  if (RENDERS_MARKDOWN.test(src)) return true;
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) if (wrappers.has(m[1]!)) return true;
  return false;
}

/** E1: the old Alchemy one-click trigger on markdown (declared, or a markdown renderer's `human`). */
export function oldCopyOnMarkdown(root: string, allowed: Record<string, string>): string[] {
  const out: string[] = [];
  const files = repoFiles(root);
  const wrappers = markdownWrappers(files);
  for (const { rel, src } of files) {
    if (COPY_DEFINITIONS.test(rel) || allowed[rel]) continue;
    for (const match of src.matchAll(ALCHEMY_TRIGGER)) {
      const props = match[2] ?? "";
      if (/\btriggerHidden\b/.test(props)) continue;
      const declared = /contentFlavor=["{]+markdown/.test(props);
      const renders = /\bhuman=/.test(props) && rendersMarkdown(src, wrappers);
      if (declared || renders) out.push(`${rel} <${match[1]}>`);
    }
  }
  return out.sort();
}

/** E2: a markdown renderer that writes the clipboard raw (one flavor, no choice). */
export function rawCopyOnMarkdown(root: string, allowed: Record<string, string>): string[] {
  const files = repoFiles(root);
  const wrappers = markdownWrappers(files);
  return files
    .filter(({ rel, src }) => !COPY_DEFINITIONS.test(rel) && !allowed[rel] && RAW_WRITE.test(src) && rendersMarkdown(src, wrappers))
    .map(({ rel }) => rel)
    .sort();
}

/** F: hosts that must carry the split Copy and not the old trigger. */
/**
 * THE COPY MENU IS TWO ROWS (Arman, 2026-10-07): "Copy markdown" and "Copy plain text", nothing else.
 * The 0.2.40 split took a `mountMore` slot and drew the whole Alchemy palette (Formatted, JSON,
 * download, AI) under the chevron; it lives behind Export… now. Every file that builds or hosts the
 * split is read for a way to hang rows under the chevron again.
 */
const COPY_MENU_FILES = [
  "../aidream/apps/shared/rich-content/src/copy/CopySplitButton.tsx",
  "../aidream/apps/shared/rich-content/src/rich-document/variants/ActionBar.tsx",
  "../aidream/apps/shared/rich-content/src/selection-toolbar/SelectionToolbarFrame.tsx",
  "components/agent-copy/RichCopySplit.tsx",
  "components/agent-copy/TextCopySplit.tsx",
];

export function copyMenuExtras(root: string, files: readonly string[]): string[] {
  const out: string[] = [];
  for (const rel of files) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const name of ["mountMore", "MoreSlot"]) if (new RegExp(`\\b${name}\\b`).test(src)) out.push(`${rel}: ${name}`);
  }
  return out;
}

const SPLIT_HOSTS = [
  "components/mardown-display/MarkdownRenderer.tsx",
  "components/mardown-display/blocks/scraper-kinds/ScrapedPageBlock.tsx",
  "features/tasks/components/editor/TaskEditorCopyButtons.tsx",
  "features/transcripts/components/TranscriptViewer.tsx",
  "features/message-templates/components/TemplateActionDrawer.tsx",
  "features/message-templates/components/TemplateViewPage.tsx",
  "features/documents/components/DocumentRecord.tsx",
  // J (2026-10-07 final pass): the flashcard deck + study card, a Space, the org Tables peek.
  "features/flashcards/components/set-detail/SetDetailView.tsx",
  "features/flashcards/components/study/StudyDeck.tsx",
  "features/spaces/page/SpacePage.tsx",
  "features/organizations/peek/kinds/TablePeek.tsx",
];
export function missingSplit(root: string, hosts: readonly string[]): string[] {
  return hosts
    .filter((rel) => {
      const file = path.join(root, rel);
      if (!fs.existsSync(file)) return true;
      const src = fs.readFileSync(file, "utf8");
      return !/<(RichCopySplit|TextCopySplit|CopySplitButton)\b/.test(src) || /<CopyButtons\b/.test(src);
    })
    .sort();
}

/** G: a second split-Copy build — only the package (node_modules) draws the split's menu. */
export function secondSplitBuild(root: string): string[] {
  return repoFiles(root)
    .filter(({ src }) => /data-copy-split(?:-menu|-more|-main)?\b/.test(src))
    .map(({ rel }) => rel)
    .sort();
}

describe("consistency everywhere: markdown copy is the split Copy across the whole tree", () => {
  test("E. no markdown/rich-text component offers the old Alchemy copy", () => {
    expect(oldCopyOnMarkdown(REPO_ROOT, NOT_MARKDOWN_COPY)).toEqual([]);
  });

  test("E. no markdown/rich-text component writes the clipboard raw", () => {
    expect(rawCopyOnMarkdown(REPO_ROOT, RAW_ON_MARKDOWN_OK)).toEqual([]);
  });

  test("E. no stale exemptions: every allow-listed file still has the old trigger or raw write", () => {
    for (const rel of Object.keys(NOT_MARKDOWN_COPY)) {
      const file = path.join(REPO_ROOT, rel);
      expect([rel, fs.existsSync(file) && /<(CopyButtons|MatrxCopyMenu|ContentTransferMenu)\b/.test(fs.readFileSync(file, "utf8"))]).toEqual([rel, true]);
    }
    for (const rel of Object.keys(RAW_ON_MARKDOWN_OK)) {
      const file = path.join(REPO_ROOT, rel);
      expect([rel, fs.existsSync(file) && RAW_WRITE.test(fs.readFileSync(file, "utf8"))]).toEqual([rel, true]);
    }
  });

  test("F. the named hosts render the split Copy", () => {
    expect(missingSplit(REPO_ROOT, SPLIT_HOSTS)).toEqual([]);
  });

  test("G. there is one split-Copy build (the package's), not a second of our own", () => {
    expect(secondSplitBuild(REPO_ROOT)).toEqual([]);
  });

  test("J. CENSUS: one visible copy control; the chevron is 2 rows; the palette is the set's Transform", () => {
    expect(copyMenuExtras(REPO_ROOT, COPY_MENU_FILES)).toEqual([]);
    // No second visible Export control anywhere (Arman, 2026-10-07): the anchor has no trigger.
    const anchor = fs.readFileSync(path.join(REPO_ROOT, "node_modules/@ai-matrx/rich-content/dist/copy/ExportPalette.js"), "utf8");
    expect(anchor).not.toMatch(/data-export-palette-trigger/);
    // 2026-10-08: the palette is the content action set's one-click Transform — in RichCopySplit
    // (chat package) and in the rich-document bar — never a chevron row any more.
    const split = fs.readFileSync(path.join(REPO_ROOT, "node_modules/@ai-matrx/chat/dist/agent-copy/RichCopySplit.js"), "utf8");
    expect(split).toMatch(/onTransform:/);
    expect(split).not.toMatch(/onExport:/);
    const bar = fs.readFileSync(path.join(REPO_ROOT, "node_modules/@ai-matrx/rich-content/dist/rich-document/variants/ActionBar.js"), "utf8");
    expect(bar).toMatch(/onTransform:/);
    expect(bar).not.toMatch(/onExport:/);
    // The phone note dock HAS a ⋯ (its More sheet): Export… is a row there; its copy chevron stays 2 rows.
    const dock = fs.readFileSync(path.join(REPO_ROOT, "features/notes/components/mobile/NoteEditorDock.tsx"), "utf8");
    expect(dock).toMatch(/data-note-dock-export/);
    expect(dock).not.toMatch(/<TextCopyChevron[^>]*onExport/);
  });

  test("J detector goes red on the old shape (a palette slot under the chevron) and green without it", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "copy-menu-"));
    const file = path.join(tmp, "Split.tsx");
    fs.writeFileSync(file, '<CopySplitButton copy={copy} size="sm" mountMore={mountMore} />\n');
    expect(copyMenuExtras(tmp, ["Split.tsx"])).toEqual(["Split.tsx: mountMore"]);
    fs.writeFileSync(file, 'function MoreSlot() {}\n');
    expect(copyMenuExtras(tmp, ["Split.tsx"])).toEqual(["Split.tsx: MoreSlot"]);
    fs.writeFileSync(file, '<CopySplitButton copy={copy} size="sm" />\n');
    expect(copyMenuExtras(tmp, ["Split.tsx"])).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("H. the split's Alchemy palette does not repeat the split's own two rows", () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "node_modules/@ai-matrx/chat/dist/agent-copy/RichCopySplit.js"), "utf8");
    expect(src).toMatch(/richCopyFlavors: \[\]/);
  });

  test("I. a saved template has one editor, and the phone note dock keeps toasts off its controls", () => {
    const editRoute = fs.readFileSync(path.join(REPO_ROOT, "app/(core)/chat/message-templates/edit/[id]/page.tsx"), "utf8");
    expect(editRoute).toMatch(/redirect\(/);
    expect(editRoute).not.toMatch(/TemplateEditor/);
    // …and ONE editor for create too: /new opens the canonical page in create mode; the old form is gone.
    expect(fs.existsSync(path.join(REPO_ROOT, "features/message-templates/components/TemplateEditor.tsx"))).toBe(false);
    const newRoute = fs.readFileSync(path.join(REPO_ROOT, "app/(core)/chat/message-templates/new/page.tsx"), "utf8");
    expect(newRoute).toMatch(/<TemplateViewPage[^>]*\bcreate\b/);
    expect(newRoute).not.toMatch(/\bTemplateEditor\b/);
    const dock = fs.readFileSync(path.join(REPO_ROOT, "features/notes/components/mobile/NoteEditorDock.tsx"), "utf8");
    expect(dock).toMatch(/--matrx-toast-floor/);
    const toaster = fs.readFileSync(path.join(REPO_ROOT, "components/ui/sonner.tsx"), "utf8");
    expect(toaster).toMatch(/mobileOffset[\s\S]*--matrx-toast-floor/);
  });

  test("E/F/G detectors go red on planted files and green once routed (self-proof)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rich-copy-repo-"));
    const dir = path.join(tmp, "features/demo");
    fs.mkdirSync(dir, { recursive: true });
    const planted = path.join(dir, "Reader.tsx");
    fs.writeFileSync(planted, 'import { MarkdownCore } from "x";\nexport const R = () => <><MarkdownCore>{t}</MarkdownCore><CopyButtons human={t} label="a" /></>;\nconst c = () => navigator.clipboard.writeText(t);\n');
    fs.writeFileSync(path.join(dir, "Menu.tsx"), '<div data-copy-split-menu="" />');
    expect(oldCopyOnMarkdown(tmp, {})).toEqual(["features/demo/Reader.tsx <CopyButtons>"]);
    expect(rawCopyOnMarkdown(tmp, {})).toEqual(["features/demo/Reader.tsx"]);
    expect(missingSplit(tmp, ["features/demo/Reader.tsx"])).toEqual(["features/demo/Reader.tsx"]);
    expect(secondSplitBuild(tmp)).toEqual(["features/demo/Menu.tsx"]);
    fs.writeFileSync(planted, 'import { MarkdownCore } from "x";\nexport const R = () => <><MarkdownCore>{t}</MarkdownCore><RichCopySplit human={t} label="a" /></>;\nconst c = () => copyRichContent(t, "text");\n');
    fs.rmSync(path.join(dir, "Menu.tsx"));
    // A host that renders markdown only through a wrapper component is still a markdown host.
    fs.writeFileSync(path.join(dir, "BodyText.tsx"), 'import { MarkdownCore } from "x";\nexport function BodyRichText() { return <MarkdownCore>{t}</MarkdownCore>; }\n');
    const page = path.join(dir, "Page.tsx");
    fs.writeFileSync(page, 'export const P = () => <><BodyRichText /><CopyButtons human={t} label="a" /></>;\n');
    expect(oldCopyOnMarkdown(tmp, {})).toEqual(["features/demo/Page.tsx <CopyButtons>"]);
    fs.writeFileSync(page, 'export const P = () => <><BodyRichText /><RichCopySplit human={t} label="a" /></>;\n');
    expect(oldCopyOnMarkdown(tmp, {})).toEqual([]);
    expect(rawCopyOnMarkdown(tmp, {})).toEqual([]);
    expect(missingSplit(tmp, ["features/demo/Reader.tsx"])).toEqual([]);
    expect(secondSplitBuild(tmp)).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GUARD (4), the 2026-10-07 final pass: surfaces the first sweeps missed.
//   J. each named surface carries what makes it consistent: a selection zone (the ONE selection
//      toolbar, Copy first) where text is read or edited, the split Copy where it copies, and the
//      markup-carrying converter where the copy source is a snapshot, not text.
// ═══════════════════════════════════════════════════════════════════════════

/** file → [what it must contain (regex), why]. */
const SURFACE_REQUIRES: Record<string, Array<[RegExp, string]>> = {
  "features/flashcards/components/study/StudyDeck.tsx": [
    [/<NonEditableContextMenu\b[\s\S]*?<FlashcardItem\b/, "the card face is a selection zone (selection toolbar, Copy first)"],
    [/<TextCopySplit\b/, "the current card has the split Copy"],
  ],
  "features/spaces/editor/SpaceEditor.tsx": [
    [/useSelectionZone\(/, "a Space is a selection zone of the one toolbar"],
  ],
  "features/spaces/editor/selection-format.tsx": [
    [/selection:comment/, "Comment is a registered toolbar action, not a second bubble"],
    [/selection:format-link/, "Link is a registered format action"],
    [/selection:format-color/, "Text colour is a registered format action"],
    [/selection:format-h1/, "the block type is a registered format action"],
  ],
  "features/documents/components/DocumentRecord.tsx": [
    [/univerDocToMarkdown\(/, "a Univer document copies with its markup (headings, bold, lists, tables)"],
  ],
  "features/organizations/peek/kinds/TablePeek.tsx": [[/<CopySplitButton\b/, "the table peek copies the table"]],
  "features/rag/components/library/ChunkList.tsx": [
    [/<TextCopySplit\b/, "a chunk card without provenance still has the split Copy"],
    [/<RichCopySplit\b/, "a chunk card with provenance has the split Copy over its palette"],
  ],
};
/** Files that must NOT contain a pattern. */
const SURFACE_FORBIDS: Record<string, Array<[RegExp, string]>> = {
  "features/spaces/editor/SpaceEditor.tsx": [[/<FormattingToolbarController\b/, "BlockNote's own bubble is a second selection toolbar"]],
};

export function surfaceGaps(root: string, requires: typeof SURFACE_REQUIRES, forbids: typeof SURFACE_FORBIDS): string[] {
  const out: string[] = [];
  const read = (rel: string) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), "utf8") : null);
  for (const [rel, rules] of Object.entries(requires)) {
    const src = read(rel);
    for (const [re, why] of rules) if (src === null || !re.test(src)) out.push(`${rel}: missing — ${why}`);
  }
  for (const [rel, rules] of Object.entries(forbids)) {
    const src = read(rel);
    for (const [re, why] of rules) if (src !== null && re.test(src)) out.push(`${rel}: forbidden — ${why}`);
  }
  return out.sort();
}

describe("J. the surfaces the first sweeps missed", () => {
  test("each carries its selection zone, split Copy and converter", () => {
    expect(surfaceGaps(REPO_ROOT, SURFACE_REQUIRES, SURFACE_FORBIDS)).toEqual([]);
  });

  test("the detector goes red on a bare surface and green once routed (self-proof)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rich-copy-surface-"));
    const rel = "features/spaces/editor/SpaceEditor.tsx";
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), "<FormattingToolbarController />");
    expect(surfaceGaps(tmp, { [rel]: SURFACE_REQUIRES[rel] }, SURFACE_FORBIDS)).toHaveLength(2);
    fs.writeFileSync(path.join(tmp, rel), 'useSelectionZone(el, { host: {} });');
    expect(surfaceGaps(tmp, { [rel]: SURFACE_REQUIRES[rel] }, SURFACE_FORBIDS)).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

/** Markdown renderers whose raw clipboard write is not a copy of the markdown — file → why. */
const RAW_ON_MARKDOWN_OK: Record<string, string> = {};
