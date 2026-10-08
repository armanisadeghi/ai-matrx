// GUARD: every long-form editing host is wired to THE formatting command layer
// (components/rich-editor/format — ⌘B/⌘I/⌘K/⌘⇧X/⌘E/⌘⇧7/8 and the selection
// toolbar's formatting buttons in Visual, Source and every textarea).
// Arman, 2026-10-04: "The formatting buttons need to work even when we are
// just showing plain text."
//
// A host is wired when its file calls `useTextareaFormatting` (textareas),
// registers `markdownFormatHost` (CodeMirror) or `RICH_EDITOR_HOST_KEY`
// (Tiptap), or renders the canonical `ProTextarea` (wired inside, long-form by
// default) or `RichEditor`. A raw <textarea> in a long-form host directory that
// is none of these fails — unless listed below with its reason.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");

/** The hosts the brief names, each with the wiring it must carry. */
const REQUIRED: Record<string, RegExp> = {
  "components/official/ProTextarea.tsx": /useTextareaFormatting\(/,
  "components/matrx/MatrxSplit.tsx": /useTextareaFormatting\(/,
  "features/notes/components/NoteEditorCore.tsx": /useTextareaFormatting\(/,
  "features/notes/components/mobile/MobileNoteEditor.tsx": /useTextareaFormatting\(/,
  // The editor's own views ship in @ai-matrx/rich-editor (read from the installed package).
  "node_modules/@ai-matrx/rich-editor/dist/source/SourceEditor.js": /markdownFormatHost\(/,
  "node_modules/@ai-matrx/rich-editor/dist/visual/VisualEditor.js": /RICH_EDITOR_HOST_KEY/,
  "../aidream/apps/shared/chat/src/agents/components/inputs/smart-input/AgentTextarea.tsx": /useTextareaFormatting\(/,
  // The editors that used to change capability by tab / were bare textareas.
  "components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx": /useTextareaFormatting\(/,
  "components/official/content-editor/ContentEditor.tsx": /useTextareaFormatting\(/,
  "features/html-pages/components/tabs/MarkdownPlainTextTab.tsx": /useTextareaFormatting\(/,
  "features/agents/components/builder/message-builders/MessageItem.tsx": /useTextareaFormatting\(/,
  "features/agents/components/builder/message-builders/system-instructions/SystemMessage.tsx": /useTextareaFormatting\(/,
  "components/merge-field-input/MergeFieldInput.tsx": /useMergeFieldFormatting\(/,
};

/** Directories where text is long-form markdown a person writes. */
const LONG_FORM_DIRS = [
  "features/notes",
  "components/matrx",
  "components/rich-editor",
  "components/official/content-editor",
  "components/mardown-display/chat-markdown",
  "features/agents/components/builder/message-builders",
  "features/message-templates",
  "features/skills",
  "features/html-pages/components",
  "../aidream/apps/shared/chat/src/agents/components/inputs",
];

/** Raw textareas that are not long-form markdown — or are owned by a named follow-up. */
const EXEMPT: Record<string, string> = {
  "features/notes/components/FindMatchOverlay.tsx": "a measuring mirror, never edited",
  "components/mardown-display/chat-markdown/analyzer/analyzer-options/JsonComparator.tsx": "JSON input (admin analyzer)",
  "features/html-pages/components/HtmlPreviewModal.tsx": "HTML source",
  "features/html-pages/components/tabs/CompleteHtmlTab.tsx": "HTML source",
  "features/html-pages/components/tabs/HtmlCodeTab.tsx": "HTML source",
  "features/html-pages/components/tabs/WordPressCSSTab.tsx": "CSS source",
  "features/html-pages/components/tabs/SavePageTab.tsx": "page metadata fields",
  "../aidream/apps/shared/chat/src/agents/components/inputs/smart-input/UninitializedShell.tsx": "the composer's loading shell (disabled)",
};

const WIRED = /useTextareaFormatting\(|markdownFormatHost\(|RICH_EDITOR_HOST_KEY/;
const RAW_TEXTAREA = /<textarea[\s>]/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".tsx") && !/\.test\.|\.spec\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function unwiredHosts(root: string, dirs: readonly string[], exempt: Record<string, string>): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (exempt[rel]) continue;
      const src = fs.readFileSync(file, "utf8");
      if (RAW_TEXTAREA.test(src) && !WIRED.test(src)) out.push(rel);
    }
  }
  return out.sort();
}

describe("every long-form editing host is wired to the formatting command layer", () => {
  test.each(Object.entries(REQUIRED))("%s carries its wiring", (rel, wiring) => {
    expect(wiring.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))).toBe(true);
  });

  test("no raw long-form textarea is left unwired", () => {
    const offenders = unwiredHosts(ROOT, LONG_FORM_DIRS, EXEMPT);
    if (offenders.length) {
      throw new Error(
        "A long-form textarea has no formatting. Call useTextareaFormatting(element) " +
          "(components/rich-editor/format/useTextareaFormatting.ts), render ProTextarea / RichEditor, " +
          `or list it in EXEMPT with the reason:\n  ${offenders.join("\n  ")}`,
      );
    }
  });

  test("no stale exemption (the file exists and still has an unwired raw textarea)", () => {
    const stale = Object.keys(EXEMPT).filter((rel) => {
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) return true;
      const src = fs.readFileSync(file, "utf8");
      return !RAW_TEXTAREA.test(src) || WIRED.test(src);
    });
    expect(stale).toEqual([]);
  });

  test("the detector goes red on a planted unwired textarea and green once wired (self-proof)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "format-hosts-"));
    const dir = path.join(tmp, "features/notes/components");
    fs.mkdirSync(dir, { recursive: true });
    const planted = path.join(dir, "Pad.tsx");
    fs.writeFileSync(planted, "export const Pad = () => <textarea rows={8} />;\n");
    expect(unwiredHosts(tmp, ["features/notes"], {})).toEqual(["features/notes/components/Pad.tsx"]);
    fs.writeFileSync(planted, "useTextareaFormatting(el);\nexport const Pad = () => <textarea rows={8} />;\n");
    expect(unwiredHosts(tmp, ["features/notes"], {})).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VISIBLE in EVERY editable mode (2026-10-07: notes Write — the visual editor —
// had no formatting buttons at all; they showed only in Plain and Split). Each
// editor host renders THE toolbar (`@ai-matrx/rich-editor/format/FormatButtons`)
// inside its EXISTING toolbar row in every editable mode, never in Read; the
// visual editor registers as a format target, so the buttons drive Write too.
// ═══════════════════════════════════════════════════════════════════════════

/** Host file → how its toolbar row renders the toolbar in every editable mode. */
const VISIBLE_BUTTONS: Record<string, RegExp> = {
  // notes page header row (beside the mode switch): Write, Split, Plain — not Read
  "features/notes/components/NotesView.tsx": /editorMode !== "preview" && \(\s*<FormatButtons\b/,
  // a note in a window: the mode-switch row
  "features/notes/components/NoteWorkspace.tsx": /editorMode !== "preview" && \(\s*<FormatButtons\b/,
  // the phone: the note dock's essential set, in every editing mode
  "features/notes/components/mobile/NoteEditorDock.tsx": /<FormatButtons\s+variant="essential"/,
  "features/notes/components/mobile/MobileNoteEditor.tsx": /formatResolve=\{effectiveMode !== "preview" && !readOnly \?/,
  // the full-screen editor: its footer row, in Write, Source and Plain
  "components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx": /activeTab === "wysiwyg" \|\| activeTab === "markdown" \|\| activeTab === "write" \? \(\s*<FormatButtons\b/,
  // ContentEditor: its header row (mode selector), every mode but Preview
  "components/official/content-editor/ContentEditor.tsx": /currentMode !== "preview" && !isCollapsed \? \([\s\S]{0,200}<FormatButtons\b/,
  // the html-pages full-screen editor: its footer row, every tab but Read
  "features/html-pages/components/HtmlPreviewFullScreenEditor.tsx": /activeTab !== "preview" \? \(\s*<FormatButtons\b/,
  // a record's body: the editor's slim format row
  "features/data-tables/records-ui-host/RecordBodyEditor.tsx": /chrome="format"/,
  "node_modules/@ai-matrx/rich-editor/dist/editor/RichEditorImpl.js": /chrome === "format" && editable[\s\S]{0,300}FormatButtons/,
  // the editor's own toolbar row (chrome "full"), Visual and Source alike: Markdown Studio, documents, prompts
  "node_modules/@ai-matrx/rich-editor/dist/editor/RichEditorImpl.js": /const editable = view !== "preview" && !readOnly;[\s\S]{0,400}FormatButtons/,
};

/** Gates that hid the toolbar from Write (the defect): a host must never bring one back. */
const PLAIN_ONLY_GATE = /\(editorMode === "plain" \|\| editorMode === "split"\) && \(\s*<FormatButtons\b/;

export function plainOnlyHosts(root: string, files: readonly string[]): string[] {
  return files.filter((rel) => PLAIN_ONLY_GATE.test(fs.readFileSync(path.join(root, rel), "utf8")));
}

describe("every editor host SHOWS the formatting toolbar in every editable mode", () => {
  test.each(Object.entries(VISIBLE_BUTTONS))("%s renders FormatButtons in its toolbar row", (rel, rendered) => {
    expect(rendered.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))).toBe(true);
  });

  test.each(["components/markdown-studio/StudioEditorMode.tsx", "components/markdown-studio/AnnotateView.tsx"])(
    "Markdown Studio (%s) keeps the editor's own toolbar row, where the toolbar lives",
    (rel) => {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(src).toMatch(/<RichEditor\b/);
      expect(src).not.toMatch(/chrome="bare"/);
    },
  );

  test("every chrome=\"bare\" RichEditor host renders the toolbar in its own row (or is listed above)", () => {
    const dirs = ["features", "components", "app"];
    const offenders: string[] = [];
    const walkAll = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (["node_modules", "__tests__", ".next"].includes(entry.name)) continue;
          walkAll(full);
        } else if (entry.name.endsWith(".tsx") && !/\.test\./.test(entry.name)) {
          const src = fs.readFileSync(full, "utf8");
          if (/<RichEditor\b[\s\S]{0,600}?chrome="bare"/.test(src)) offenders.push(path.relative(ROOT, full).split(path.sep).join("/"));
        }
      }
    };
    for (const d of dirs) walkAll(path.join(ROOT, d));
    // A bare editor is fine only where its host's row carries the toolbar (a VISIBLE_BUTTONS host),
    // or the host's parent does (the html-pages tabs; the notes cores under NotesView / NoteWorkspace).
    const HOST_ROW_ELSEWHERE: Record<string, string> = {
      "features/html-pages/components/tabs/MarkdownWysiwygTab.tsx": "HtmlPreviewFullScreenEditor's footer row",
      "features/html-pages/components/tabs/MarkdownSplitViewTab.tsx": "HtmlPreviewFullScreenEditor's footer row",
      "features/notes/components/NoteEditorCore.tsx": "NotesView / NoteWorkspace header row",
      "features/notes/components/mobile/MobileNoteEditor.tsx": "the note dock",
      "features/notes/components/NoteEditor.tsx": "unmounted (NotesLayout is imported nowhere)",
    };
    expect(offenders.filter((f) => !VISIBLE_BUTTONS[f] && !HOST_ROW_ELSEWHERE[f])).toEqual([]);
  });

  test("no host gates the toolbar to the plain modes (Write must have it)", () => {
    expect(plainOnlyHosts(ROOT, Object.keys(VISIBLE_BUTTONS).filter((f) => f.endsWith(".tsx")))).toEqual([]);
  });

  test("the plain-only detector goes red on the old gate (self-proof)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "format-gate-"));
    fs.writeFileSync(path.join(tmp, "Old.tsx"), '{(editorMode === "plain" || editorMode === "split") && (\n  <FormatButtons resolve={r} />\n)}');
    expect(plainOnlyHosts(tmp, ["Old.tsx"])).toEqual(["Old.tsx"]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("render: a wired textarea's container shows the toolbar and Bold formats its selection", () => {
    /* eslint-disable @typescript-eslint/no-require-imports -- jsdom render inside a node-path census */
    const React = require("react") as typeof import("react");
    const { act } = require("react") as typeof import("react");
    const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
    const { FormatButtons } = require("@ai-matrx/rich-editor/format/FormatButtons") as typeof import("@ai-matrx/rich-editor/format/FormatButtons");
    const { formatTargetWithin } = require("@ai-matrx/rich-editor/format/format-target") as typeof import("@ai-matrx/rich-editor/format/format-target");
    const { useTextareaFormatting } = require("@ai-matrx/rich-editor/format/useTextareaFormatting") as typeof import("@ai-matrx/rich-editor/format/useTextareaFormatting");
    /* eslint-enable @typescript-eslint/no-require-imports */
    function Host() {
      const box = React.useRef<HTMLDivElement>(null);
      const [field, setField] = React.useState<HTMLTextAreaElement | null>(null);
      useTextareaFormatting(field);
      return React.createElement(
        "div",
        { ref: box },
        React.createElement(FormatButtons, { resolve: () => formatTargetWithin(box.current) }),
        React.createElement("textarea", { ref: setField, defaultValue: "make this bold" }),
      );
    }
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(React.createElement(Host)));
    const commands = Array.from(container.querySelectorAll("[data-format-buttons] button[data-format-command]")).map((b) => b.getAttribute("data-format-command"));
    for (const verb of ["undo", "redo", "bold", "italic", "strike", "code", "bulletList", "orderedList", "taskList", "quote", "link", "codeBlock", "table", "horizontalRule"]) {
      expect(commands).toContain(verb);
    }
    const textarea = container.querySelector("textarea")!;
    textarea.focus();
    textarea.setSelectionRange(10, 14);
    act(() => (container.querySelector('[data-format-command="bold"]') as HTMLButtonElement).click());
    expect(textarea.value).toBe("make this **bold**");
    act(() => root.unmount());
    container.remove();
  });

  test("render: in WRITE (the visual editor) the toolbar's Bold is there and bolds the selection", () => {
    /* eslint-disable @typescript-eslint/no-require-imports -- jsdom render inside a node-path census */
    const React = require("react") as typeof import("react");
    const { act } = require("react") as typeof import("react");
    const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
    const { Editor } = require("@tiptap/core") as typeof import("@tiptap/core");
    const { TextSelection } = require("@tiptap/pm/state") as typeof import("@tiptap/pm/state");
    const { FormatButtons } = require("@ai-matrx/rich-editor/format/FormatButtons") as typeof import("@ai-matrx/rich-editor/format/FormatButtons");
    const { formatTargetWithin, registerFormatElement } = require("@ai-matrx/rich-editor/format/format-target") as typeof import("@ai-matrx/rich-editor/format/format-target");
    const { editorFormatTarget } = require("@ai-matrx/rich-editor/visual/format-actions") as typeof import("@ai-matrx/rich-editor/visual/format-actions");
    const { createRichEditorExtensions } = require("@ai-matrx/rich-editor/core/extensions") as typeof import("@ai-matrx/rich-editor/core/extensions");
    /* eslint-enable @typescript-eslint/no-require-imports */
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // The Write host: the visual editor's zone registered exactly as VisualEditor registers it.
    const container = document.createElement("div");
    const zone = document.createElement("div");
    document.body.appendChild(container);
    const editor = new Editor({ element: zone, extensions: createRichEditorExtensions(), content: "<p>make this bold</p>" });
    const off = registerFormatElement(zone, editorFormatTarget(editor, () => undefined));
    const bar = document.createElement("div");
    container.append(bar, zone);
    const root = createRoot(bar);
    act(() => root.render(React.createElement(FormatButtons, { resolve: () => formatTargetWithin(container) })));
    const bold = container.querySelector('[data-format-command="bold"]') as HTMLButtonElement | null;
    expect(bold).not.toBeNull();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 11, 15)));
    act(() => bold!.click());
    expect(editor.getHTML()).toContain("<strong>bold</strong>");
    act(() => root.unmount());
    off();
    editor.destroy();
    container.remove();
  });
});
