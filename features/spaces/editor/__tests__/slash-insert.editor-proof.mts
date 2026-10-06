// features/spaces/editor/__tests__/slash-insert.editor-proof.mts — a "/" item lands where the "/" was typed.
//   bash features/spaces/editor/__tests__/run-editor-proof.sh slash-insert
// The picker items (Link to page, Linked view, Page) insert after an await; by then the cursor has
// moved (the room re-rendered, the picker took focus). The block is named at the click and inserted by id.

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, DOMParser: dom.window.DOMParser, getComputedStyle: dom.window.getComputedStyle });

async function main() {
  const { BlockNoteEditor } = await import("@blocknote/core");
  const { spacesSchema } = await import("../schema");
  const { insertAtSlash, slashTarget } = await import("../slash-insert");
  const make = () => {
    const editor = BlockNoteEditor.create({
      schema: spacesSchema,
      initialContent: [
        { id: "a", type: "paragraph", content: "Kickoff notes" },
        { id: "b", type: "checkListItem", content: "Draft announcement" },
        { id: "c", type: "callout", content: "Remember the launch date" } as never,
        { id: "d", type: "paragraph", content: "" },
      ],
    } as never) as unknown as { mount: (el: HTMLElement) => void };
    editor.mount(document.createElement("div"));
    return editor as unknown as import("../schema").SpacesEditor;
  };
  const order = (e: import("../schema").SpacesEditor) => e.document.map((b) => `${b.type}${Array.isArray(b.content) && b.content.length ? ":" + (b.content as Array<{ text?: string }>).map((x) => x.text).join("") : ""}`);
  const results: Record<string, unknown> = {};

  // 1. Async insert: "/" typed in the empty line at the end; the cursor then jumps to the top.
  {
    const e = make();
    e.setTextCursorPosition("d", "start");
    const at = slashTarget(e);
    e.setTextCursorPosition("a", "start"); // what the room / picker did meanwhile
    insertAtSlash(e, at, { type: "linkToPage", props: { spaceId: "s1" } } as never);
    const o = order(e);
    results.asyncLandsAtSlash = o[0] === "paragraph:Kickoff notes" && o[3] === "linkToPage" && o.length === 5 && o[4] === "paragraph";
    results.asyncCaretBelow = e.getTextCursorPosition().block.id === e.document[4].id;
    results.asyncOrder = o;
  }
  // 2. "/" in a line with text keeps the text and inserts after it.
  {
    const e = make();
    const at = "c";
    e.setTextCursorPosition("a", "end");
    insertAtSlash(e, at, { type: "linkToPage", props: { spaceId: "s1" } } as never);
    const o = order(e);
    results.afterTextKept = o[2] === "callout:Remember the launch date" && o[3] === "linkToPage";
    results.afterOrder = o;
  }
  // 3. "/2 columns" in the empty line under a to-do: the to-do keeps its text.
  {
    const e = make();
    e.setTextCursorPosition("d", "start");
    insertAtSlash(e, slashTarget(e), { type: "columnList", children: [{ type: "column", props: { width: 0.5 }, children: [{ type: "paragraph" }] }, { type: "column", props: { width: 0.5 }, children: [{ type: "paragraph" }] }] } as never);
    const o = order(e);
    results.columnsKeepTodo = o[1] === "checkListItem:Draft announcement" && o[3] === "columnList" && o.length === 4;
    results.columnsOrder = o;
  }
  console.log(JSON.stringify(results, null, 1));
  const ok = results.asyncLandsAtSlash && results.asyncCaretBelow && results.afterTextKept && results.columnsKeepTodo;
  process.exit(ok ? 0 : 1);
}

void main();
