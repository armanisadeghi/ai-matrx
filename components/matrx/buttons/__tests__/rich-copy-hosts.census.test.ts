// GUARD (1): every rich-content surface copies through THE one copy module
// (`copyRichContent` in components/agent-copy/copy-commands.ts, which writes through kit's `copyRich` —
// Copy = formatted + markdown, Copy markdown, Copy text). A raw
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
  "packages/chat/src/agents/components/messages-display",
  "packages/chat/src/tool-call-visualization",
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
  "packages/chat/src/agents/components/messages-display/assistant/InPlaceAnswerEditor.tsx":
    "the stale-save toast's \"Copy my edit\" hands back the person's own markdown to paste into the editor",
  "packages/chat/src/tool-call-visualization/renderers/research/ResearchOverlay.tsx":
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
  "packages/chat/src/tool-call-visualization/renderers/research/ResearchOverlay.tsx": "one read's copy vs Copy all: two different documents",
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
    expect(bar).toMatch(/CopySplitButton/);
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
