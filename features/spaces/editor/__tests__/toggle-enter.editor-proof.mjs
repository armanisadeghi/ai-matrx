// features/spaces/editor/__tests__/toggle-enter.editor-proof.mts — Enter at the end of a toggle title.
//   bash features/spaces/editor/__tests__/run-editor-proof.sh toggle-enter
// Round 18: Enter after a toggle's title made a sibling even with the toggle open. Notion writes the
// first child inside an open toggle, and a sibling when it is closed.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, DOMParser: dom.window.DOMParser, getComputedStyle: dom.window.getComputedStyle, localStorage: dom.window.localStorage });
async function main() {
    var _a;
    const { BlockNoteEditor } = await import("@blocknote/core");
    const { spacesSchema } = await import("../schema");
    const { enterIntoOpenToggle } = await import("../toggle-enter");
    const make = () => {
        const editor = BlockNoteEditor.create({
            schema: spacesSchema,
            initialContent: [
                { id: "t", type: "toggleListItem", content: "Launch checklist", children: [{ id: "c1", type: "paragraph", content: "Book the venue" }] },
                { id: "h", type: "heading", props: { level: 2, isToggleable: true }, content: "Notes" },
                { id: "z", type: "paragraph", content: "After" },
                { id: "box", type: "callout", props: { icon: "" } },
            ],
        });
        editor.mount(document.createElement("div"));
        return editor;
    };
    const kids = (e, id) => { var _a; var _b; return ((_b = (_a = e.getBlock(id)) === null || _a === void 0 ? void 0 : _a.children) !== null && _b !== void 0 ? _b : []).map((b) => b.id); };
    const r = {};
    {
        const e = make();
        e.setTextCursorPosition("t", "end");
        r.openHandled = enterIntoOpenToggle(e, () => true);
        const k = kids(e, "t");
        r.openFirstChild = k.length === 2 && k[1] === "c1" && e.getTextCursorPosition().block.id === k[0];
    }
    {
        const e = make();
        e.setTextCursorPosition("h", "end");
        r.headingHandled = enterIntoOpenToggle(e, () => true);
        r.headingChild = kids(e, "h").length === 1 && e.getTextCursorPosition().block.id === kids(e, "h")[0];
    }
    {
        const e = make();
        e.setTextCursorPosition("t", "end");
        r.closedLeftToEditor = enterIntoOpenToggle(e, () => false) === false && kids(e, "t").length === 1;
        e.setTextCursorPosition("t", "start");
        r.midTitleLeftToEditor = enterIntoOpenToggle(e, () => true) === false;
        e.setTextCursorPosition("z", "end");
        r.plainLineLeftToEditor = enterIntoOpenToggle(e, () => true) === false;
    }
    {
        // Round 21: Enter in an EMPTY callout keeps the box and writes its first line inside it (a box of links).
        const e = make();
        e.setTextCursorPosition("box", "end");
        r.calloutHandled = enterIntoOpenToggle(e, () => false);
        r.calloutStaysBox = ((_a = e.getBlock("box")) === null || _a === void 0 ? void 0 : _a.type) === "callout" && kids(e, "box").length === 1 && e.getTextCursorPosition().block.id === kids(e, "box")[0];
    }
    console.log(JSON.stringify(r, null, 1));
    process.exit(Object.values(r).every((v) => v === true) ? 0 : 1);
}
void main();
