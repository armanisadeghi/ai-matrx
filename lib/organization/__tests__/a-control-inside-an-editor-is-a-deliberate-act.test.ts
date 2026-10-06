/**
 * @jest-environment jsdom
 */
// A press on a control inside an editable page (a table's "New" inside a Spaces
// block, a menu item, a link) is a deliberate act; a press on the editable text
// itself is the start of typing. Spaces review 4 (2026-10-05): "New" inside a
// page was treated as typing, so the organization picker never asked.
import { isTextEntry } from "../organization-gate";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe("isTextEntry", () => {
  test("text inside an editable surface is text entry", () => {
    mount('<div contenteditable="true"><p id="t">hello</p></div>');
    expect(isTextEntry(document.getElementById("t"))).toBe(true);
  });

  test("a button inside an editable surface is a deliberate act", () => {
    mount('<div contenteditable="true"><div contenteditable="false"><button id="b"><span id="s">New</span></button></div></div>');
    expect(isTextEntry(document.getElementById("b"))).toBe(false);
    expect(isTextEntry(document.getElementById("s"))).toBe(false);
  });

  test("a non-editable island inside an editor is a deliberate act", () => {
    mount('<div contenteditable="true"><div contenteditable="false"><div id="cell">row</div></div></div>');
    expect(isTextEntry(document.getElementById("cell"))).toBe(false);
  });

  test("a menu item and a link inside an editor are deliberate acts", () => {
    mount('<div contenteditable="true"><div role="menuitem" id="m">Turn into</div><a href="/x" id="a">x</a></div>');
    expect(isTextEntry(document.getElementById("m"))).toBe(false);
    expect(isTextEntry(document.getElementById("a"))).toBe(false);
  });

  test("an editable field inside a button-like wrapper is still text entry", () => {
    // The control check never wins over an editable root nested INSIDE the control.
    mount('<div role="button"><div contenteditable="true"><p id="t">title</p></div></div>');
    expect(isTextEntry(document.getElementById("t"))).toBe(true);
  });

  test("plain fields keep their old answers", () => {
    mount('<textarea id="ta"></textarea><input id="i" type="text"/><input id="c" type="checkbox"/><button id="b">Go</button>');
    expect(isTextEntry(document.getElementById("ta"))).toBe(true);
    expect(isTextEntry(document.getElementById("i"))).toBe(true);
    expect(isTextEntry(document.getElementById("c"))).toBe(false);
    expect(isTextEntry(document.getElementById("b"))).toBe(false);
  });
});
