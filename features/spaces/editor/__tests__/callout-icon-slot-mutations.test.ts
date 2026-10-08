// A CALLOUT'S ICON SLOT IS REACT'S, NOT PROSEMIRROR'S (lane spaces-verify-r44, 2026-10-08).
//
// Inserting a callout grew the tab to 10 GB: ProseMirror reads back every mutation outside a node view's
// contentDOM, redrew the callout, which mounted a fresh React root in the icon slot, which mutated the slot,
// forever (29M listeners in 2 s). The callout now tells ProseMirror to ignore mutations inside the slot.
// Fails without the ignore (the slot's mutation is read back); passes with it. Text edits stay seen.

import { ignoresIconSlotMutation } from "../icon-slot";

// A tiny tree stands in for the DOM (the node test environment has none); only querySelector and contains matter.
type Fake = { children: Fake[] } & Record<string, unknown>;
function callout() {
  const glyph: Fake = { children: [] };
  const slot: Fake = { children: [glyph] };
  const text: Fake = { children: [] };
  const dom: Fake = { children: [slot, text] };
  const within = (root: Fake, n: Fake): boolean => root === n || root.children.some((c) => within(c, n));
  slot.contains = (n: Fake) => within(slot, n);
  dom.querySelector = (sel: string) => (sel === ".spaces-callout-icon" ? slot : null);
  return { dom: dom as unknown as HTMLElement, slot: slot as unknown as Node, glyph: glyph as unknown as Node, text: text as unknown as Node };
}

describe("callout icon slot mutations", () => {
  it("ignores a React render inside the slot", () => {
    const { dom, glyph, slot } = callout();
    expect(ignoresIconSlotMutation(dom, { type: "childList", target: slot })).toBe(true);
    expect(ignoresIconSlotMutation(dom, { type: "attributes", target: glyph })).toBe(true);
  });
  it("still reads the text and selection changes", () => {
    const { dom, text } = callout();
    expect(ignoresIconSlotMutation(dom, { type: "childList", target: text })).toBe(false);
    expect(ignoresIconSlotMutation(dom, { type: "characterData", target: text })).toBe(false);
    expect(ignoresIconSlotMutation(dom, { type: "selection", target: dom })).toBe(false);
  });
  it("a callout with no icon ignores nothing", () => {
    const dom = { querySelector: () => null } as unknown as HTMLElement;
    expect(ignoresIconSlotMutation(dom, { type: "childList", target: {} as Node })).toBe(false);
  });
});
