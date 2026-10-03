/**
 * focus-guard — automatic focus never takes the caret from a field the person
 * is typing in. SUT: `focusUnlessTypingElsewhere` (and the editable test under
 * it). Break it catches: a guard that refuses everything (a composer opened by
 * a click never gets the caret), or one that treats a checkbox / read-only
 * field as typing (a toggle the person just clicked blocks the composer).
 */

import { focusUnlessTypingElsewhere } from "../focus-guard";

function el(tag: "textarea" | "input" | "select" | "button", props: { type?: string; readOnly?: boolean } = {}): HTMLElement {
  const node = document.createElement(tag);
  if (props.type && node instanceof HTMLInputElement) node.type = props.type;
  if (props.readOnly && node instanceof HTMLTextAreaElement) node.readOnly = true;
  document.body.appendChild(node);
  return node;
}

afterEach(() => {
  document.body.innerHTML = "";
});

it.each([
  ["a textarea (a note's body)", () => el("textarea"), false],
  ["a text input (a task title)", () => el("input", { type: "text" }), false],
  ["a select", () => el("select"), false],
  ["a checkbox the person just ticked", () => el("input", { type: "checkbox" }), true],
  ["a read-only field", () => el("textarea", { readOnly: true }), true],
  ["a button the person pressed", () => el("button"), true],
])("with focus in %s, automatic focus moves the caret: %s", (_name, make, moves) => {
  const holder = make();
  holder.focus();
  const composer = el("textarea");
  expect(focusUnlessTypingElsewhere(composer)).toBe(moves);
  expect(document.activeElement).toBe(moves ? composer : holder);
});

it("a field that already holds the caret may be focused again", () => {
  const field = el("textarea");
  field.focus();
  expect(focusUnlessTypingElsewhere(field)).toBe(true);
  expect(document.activeElement).toBe(field);
});
