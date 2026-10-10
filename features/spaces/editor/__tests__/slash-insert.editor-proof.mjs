// features/spaces/editor/__tests__/slash-insert.editor-proof.mts — a "/" item lands where the "/" was typed.
//   bash features/spaces/editor/__tests__/run-editor-proof.sh slash-insert
// Round 21: "/2 columns" inside a column nests a row there (Notion), and the stored page stays valid.
// The picker items (Link to page, Linked view, Page) insert after an await; by then the cursor has
// moved (the room re-rendered, the picker took focus). The block is named at the click and inserted by id.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, DOMParser: dom.window.DOMParser, getComputedStyle: dom.window.getComputedStyle });
async function main() {
    var _a, _b, _c;
    var _d;
    const { BlockNoteEditor } = await import("@blocknote/core");
    const { spacesSchema } = await import("../schema");
    const { insertAtSlash, slashTarget } = await import("../slash-insert");
    const make = () => {
        const editor = BlockNoteEditor.create({
            schema: spacesSchema,
            initialContent: [
                { id: "a", type: "paragraph", content: "Kickoff notes" },
                { id: "b", type: "checkListItem", content: "Draft announcement" },
                { id: "c", type: "callout", content: "Remember the launch date" },
                { id: "d", type: "paragraph", content: "" },
            ],
        });
        editor.mount(document.createElement("div"));
        return editor;
    };
    const order = (e) => e.document.map((b) => `${b.type}${Array.isArray(b.content) && b.content.length ? ":" + b.content.map((x) => x.text).join("") : ""}`);
    const results = {};
    // 1. Async insert: "/" typed in the empty line at the end; the cursor then jumps to the top.
    {
        const e = make();
        e.setTextCursorPosition("d", "start");
        const at = slashTarget(e);
        e.setTextCursorPosition("a", "start"); // what the room / picker did meanwhile
        insertAtSlash(e, at, { type: "linkToPage", props: { spaceId: "s1" } });
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
        insertAtSlash(e, at, { type: "linkToPage", props: { spaceId: "s1" } });
        const o = order(e);
        results.afterTextKept = o[2] === "callout:Remember the launch date" && o[3] === "linkToPage";
        results.afterOrder = o;
    }
    // 3. "/2 columns" in the empty line under a to-do: the to-do keeps its text.
    {
        const e = make();
        e.setTextCursorPosition("d", "start");
        insertAtSlash(e, slashTarget(e), { type: "columnList", children: [{ type: "column", props: { width: 0.5 }, children: [{ type: "paragraph" }] }, { type: "column", props: { width: 0.5 }, children: [{ type: "paragraph" }] }] });
        const o = order(e);
        results.columnsKeepTodo = o[1] === "checkListItem:Draft announcement" && o[3] === "columnList" && o.length === 4;
        results.columnsOrder = o;
    }
    // 4. Round 21: "/2 columns" typed in an empty line inside a column makes a column row right there
    //    (Notion nests columns in a column); the stored page is valid (fromEngine + validateSnapshot).
    {
        const two = (p) => ({ type: "columnList", children: [{ type: "column", props: { width: 0.5 }, children: [{ id: `${p}1`, type: "paragraph", content: p === "x" ? "Left column text" : "" }, ...(p === "x" ? [{ id: "x9", type: "paragraph", content: "" }] : [])] }, { type: "column", props: { width: 0.5 }, children: [{ type: "paragraph", content: "Right" }] }] });
        const e = make();
        e.insertBlocks([{ id: "L", ...two("x") }], "a", "after");
        e.setTextCursorPosition("x9", "start");
        insertAtSlash(e, slashTarget(e), two("y"));
        const leftKids = ((_d = (_c = (_b = (_a = e.getBlock("L")) === null || _a === void 0 ? void 0 : _a.children) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.children) !== null && _d !== void 0 ? _d : []).map((b) => b.type);
        results.columnsNestInPlace = JSON.stringify(leftKids) === JSON.stringify(["paragraph", "columnList"]) && e.document.filter((b) => b.type === "columnList").length === 1;
        const { fromEngine } = await import("../convert");
        const { validateSnapshot } = await import("@/lib/spaces-blocks/schema");
        const { DEFAULT_PAGE_SETTINGS } = await import("@/lib/spaces-blocks/types");
        const stored = fromEngine(e.document);
        const problems = validateSnapshot({ v: 1, icon: null, cover: null, settings: DEFAULT_PAGE_SETTINGS, blocks: stored });
        results.nestedStoresValid = problems.length === 0;
        results.nestedProblems = problems;
        // Repeating it nests again in the new row's first column — never a list stacked below the outer one.
        insertAtSlash(e, slashTarget(e), two("z"));
        results.repeatNoStack = e.document.filter((b) => b.type === "columnList").length === 1;
        results.nestOrder = order(e);
    }
    console.log(JSON.stringify(results, null, 1));
    const ok = results.asyncLandsAtSlash && results.asyncCaretBelow && results.afterTextKept && results.columnsKeepTodo && results.columnsNestInPlace && results.nestedStoresValid && results.repeatNoStack;
    process.exit(ok ? 0 : 1);
}
void main();
