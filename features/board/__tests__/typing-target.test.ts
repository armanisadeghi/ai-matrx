import { isTyping } from "../engine/key-target";

/**
 * The board answers Space (pan) and single letters (tools) only when the key is NOT going into a
 * text field. Monaco — the file tile's editor — types into an EditContext host: a plain div that
 * is neither an input nor contenteditable. Before this guard, every space typed into a file on the
 * board was swallowed by space-to-pan (found in the browser, 2026-09-30).
 */
describe("isTyping — which key targets belong to a text field", () => {
  it("treats inputs, textareas, selects and contenteditable as typing", () => {
    expect(isTyping(document.createElement("input"))).toBe(true);
    expect(isTyping(document.createElement("textarea"))).toBe(true);
    expect(isTyping(document.createElement("select"))).toBe(true);
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    document.body.appendChild(editable);
    // jsdom does not compute isContentEditable; the browser does. Mirror it.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTyping(editable)).toBe(true);
  });

  it("treats an EditContext host (Monaco's native edit context) as typing", () => {
    const host = document.createElement("div");
    host.className = "native-edit-context";
    expect(isTyping(host)).toBe(false);
    Object.defineProperty(host, "editContext", { value: {} });
    expect(isTyping(host)).toBe(true);
  });

  it("treats an ARIA textbox as typing", () => {
    const box = document.createElement("div");
    box.setAttribute("role", "textbox");
    expect(isTyping(box)).toBe(true);
  });

  it("leaves the plane, tiles and buttons to the board", () => {
    expect(isTyping(null)).toBe(false);
    expect(isTyping(document.createElement("div"))).toBe(false);
    expect(isTyping(document.createElement("button"))).toBe(false);
    expect(isTyping(window)).toBe(false);
  });
});
