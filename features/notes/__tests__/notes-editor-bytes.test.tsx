/**
 * NOTES' BYTES ARE SACRED — in every mode.
 *
 * Arman, 2026-09-27: notes are "a place you can quickly take normal unformatted
 * notes as well as nice ones". So:
 *
 *   Plain   typing is stored exactly as typed — "- " never becomes a bullet,
 *           "1. " never renumbers, "#" never becomes a heading, trailing spaces
 *           stay. (SUT: NoteEditorCore in plain mode, a real textarea.)
 *   Write   a note that only LOOKS like markdown opens in the one editor's
 *           visual view and, with no edit, writes back byte-for-byte; switching
 *           Write → Source → Write writes back byte-for-byte; one typed word
 *           changes exactly those bytes. (SUT: the editor's own load/serialize
 *           path — buildVisualDocument → a real headless Tiptap Editor →
 *           serializeVisualDocument — the path the corpus gate runs.)
 *
 * Every expected value is the fixture itself plus the literal characters typed.
 */
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { createRichEditorExtensions } from "@/components/rich-editor/core/extensions";
import {
  buildVisualDocument,
  captureBaseline,
  serializeVisualDocument,
} from "@/components/rich-editor/core/visual-document";

jest.mock("@/components/rich-editor/RichEditor", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/rich-document/RichDocument", () => ({ RichDocument: () => null }));
jest.mock("@/components/matrx/MatrxSplit", () => ({ MatrxSplit: () => null }));
jest.mock("@/features/audio/components/MicrophoneIconButton", () => ({ MicrophoneIconButton: () => null }));
jest.mock("@/components/official/ProTextarea", () => ({ ProTextarea: () => null }));

// Import after the mocks.
import { NoteEditorCore } from "../components/NoteEditorCore";

/** Quick notes that only look like markdown — the ones Plain exists for. */
const PLAIN_LOOKING_NOTES: Record<string, string> = {
  dash: "- item",
  dashes: "- milk\n- eggs\n-bread (no space)\n",
  numbered: "1. item",
  numbered_out_of_order: "1. call the vet\n3. pay rent\n2. email Sam",
  paren_numbers: "1) first\n2) second",
  hash: "# not a heading",
  hashtags: "#todo #later\n##also-not",
  trailing_spaces: "line with trailing spaces   \nnext line  \nlast",
  star_and_plus: "* star\n+ plus\n\n2*3*4 = 24",
  snake_case: "snake_case_word and __init__ and a_b_c",
  checkbox_like: "[ ] buy stamps\n[x] done",
  quote_like: "> maybe a quote\nor not",
  rule_like: "above\n---\nbelow",
  bare_links: "https://example.com/a_b and ops@example.com",
  tabs: "\tindented with a tab\n    four spaces",
  blank_runs: "one\n\n\n\ntwo\n\n\n",
  crlf: "windows line\r\n- dash\r\n",
  emoji_free_symbols: "a -> b => c <= d & e < f",
};

const extensions = createRichEditorExtensions();
const schema = getSchema(extensions);
const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

function openInWrite(text: string) {
  const { json, plan } = buildVisualDocument(text, schema);
  const editor = new Editor({
    element: document.createElement("div"),
    extensions,
    content: json as JSONContent,
  });
  editors.push(editor);
  const baseline = captureBaseline(editor.state.doc, plan);
  return { editor, save: () => serializeVisualDocument(editor.state.doc, baseline) };
}

describe("Write (the one editor's visual view) keeps a plain-looking note's bytes", () => {
  it.each(Object.entries(PLAIN_LOOKING_NOTES))("%s: open and save with no edit = stored bytes", (_name, stored) => {
    expect(openInWrite(stored).save()).toBe(stored);
  });

  it.each(Object.entries(PLAIN_LOOKING_NOTES))("%s: Write → Source → Write = stored bytes", (_name, stored) => {
    // Source view IS the text; leaving Write hands Source exactly what Write
    // serialized, and coming back re-opens that text.
    const inSource = openInWrite(stored).save();
    expect(openInWrite(inSource).save()).toBe(stored);
  });

  it("one typed word changes exactly those bytes", () => {
    const stored = PLAIN_LOOKING_NOTES.trailing_spaces;
    const session = openInWrite(stored);
    // Caret at the end of the last line ("last").
    const end = session.editor.state.doc.content.size - 1;
    session.editor.chain().setTextSelection(end).insertContent(" word").run();
    expect(session.save()).toBe(`${stored} word`);
  });
});

describe("Plain never formats what the person types", () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  // (A browser textarea itself reads CRLF back as LF — that normalization is the
  // platform's, not ours, so the CRLF fixture is judged in Write only.)
  const typedNotes = Object.entries(PLAIN_LOOKING_NOTES).filter(([name]) => name !== "crlf");
  it.each(typedNotes)("%s: stored exactly as typed", async (_name, typed) => {
    const received: string[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<NoteEditorCore content="" onChange={(value) => received.push(value)} editorMode="plain" />);
    });
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, typed);
      textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(received.at(-1)).toBe(typed);
    await act(async () => root.unmount());
    container.remove();
  });
});
