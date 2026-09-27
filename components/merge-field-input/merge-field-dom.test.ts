/**
 * @jest-environment jsdom
 */
import {
  CHIP_ATTR,
  hasUnrenderedField,
  needsTrailingLine,
  pointAtStoredOffset,
  renderInto,
  serializeFrom,
  storedOffsetOf,
  tokenizeMergeText,
} from "./merge-field-dom";

const label = (p: string) => `L:${p}`;

function drawn(text: string): HTMLElement {
  const root = document.createElement("div");
  renderInto(root, text, label, "chip");
  return root;
}

describe("merge-field DOM", () => {
  it.each([
    "",
    "plain",
    "{{reply.body}}\n",
    "Hi {{party.first_name}},\n\n{{ reply.body }}\nThanks",
    "{{a}}{{b.c}}",
    "not a field: {{ 1bad }} and {{ok}}",
    "ends with newline\n",
  ])("round-trips %j byte for byte", (text) => {
    expect(serializeFrom(drawn(text))).toBe(text);
  });

  it("draws each field as one non-editable chip showing its label", () => {
    const root = drawn("Hi {{party.first_name}}!");
    const chips = root.querySelectorAll(`[${CHIP_ATTR}]`);
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toBe("L:party.first_name");
    expect(chips[0].getAttribute("contenteditable")).toBe("false");
    expect(root.textContent).not.toContain("{{");
  });

  it("maps caret offsets through chips in stored-text units", () => {
    const text = "Hi {{a.b}} there";
    const root = drawn(text);
    for (const at of [0, 2, 3, 10, 11, text.length]) {
      const point = pointAtStoredOffset(root, at);
      expect(storedOffsetOf(root, point.node, point.offset)).toBe(at);
    }
    // Inside a chip snaps to just before it.
    const inside = pointAtStoredOffset(root, 5);
    expect(storedOffsetOf(root, inside.node, inside.offset)).toBe(3);
  });

  it("reads a browser-inserted line block as a newline", () => {
    const root = drawn("one");
    const div = document.createElement("div");
    div.textContent = "two";
    root.appendChild(div);
    expect(serializeFrom(root)).toBe("one\ntwo");
  });

  it("notices a field typed by hand that is not yet a chip", () => {
    const root = drawn("Hi ");
    root.appendChild(document.createTextNode("{{party.first_name}}"));
    expect(hasUnrenderedField(root)).toBe(true);
    expect(hasUnrenderedField(drawn("Hi {{x}}"))).toBe(false);
  });

  it("tokenizes with the server grammar", () => {
    expect(tokenizeMergeText("a{{ x.y }}b").map((s) => s.kind)).toEqual(["text", "field", "text"]);
  });

  it("ignores the filler <br> a browser leaves in an emptied editor", () => {
    const root = document.createElement("div");
    root.appendChild(document.createElement("br"));
    expect(serializeFrom(root)).toBe("");
    const withText = drawn("{{reply.body}}");
    withText.appendChild(document.createElement("br"));
    expect(serializeFrom(withText)).toBe("{{reply.body}}");
  });

  it("asks for a redraw when a typed newline ends the text", () => {
    const root = drawn("{{reply.body}}");
    root.appendChild(document.createTextNode("\n"));
    expect(needsTrailingLine(root)).toBe(true);
    expect(needsTrailingLine(drawn("a\n"))).toBe(false);
  });
});
