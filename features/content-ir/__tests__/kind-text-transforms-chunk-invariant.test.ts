/**
 * P8 / P9 (round 4): the two text transforms both hosts run before reading a
 * kind — the markdown-escaped key (`"\_\_kind"`) and a kind written as image
 * alt text (`![{…}](url)`) — give the same bytes however the stream is cut.
 */

import { MarkdownEscapedKindJson, unescapeMarkdownKindJson } from "../surfaces/markdown-escaped-kind";
import { KindImageAltUnwrap, unwrapKindImageAlt } from "../surfaces/kind-image-alt";

const KIND = '{"__kind":"flashcard_set","title":"Cells","cards":[{"__kind":"flashcard","front":"Q","back":"A \\"x\\" ]"}]}';
const ESCAPED = KIND.replace(/__kind/g, "\\_\\_kind").replace("flashcard_set", "flashcard\\_set");

function chunked<T extends { push(s: string): string; flush(): string }>(make: () => T, text: string, size: number): string {
  const t = make();
  let out = "";
  for (let i = 0; i < text.length; i += size) out += t.push(text.slice(i, i + size));
  return out + t.flush();
}

describe("markdown-escaped kind key (P8)", () => {
  const SOURCE = `Prose with a \\_literal\\_ escape.\n\n${ESCAPED}\n\nAfter \\_ok\\_.`;
  it("un-escapes the key and every \\_ inside its object, nothing outside", () => {
    const out = unescapeMarkdownKindJson(SOURCE);
    expect(out).toContain(KIND.replace('"A \\"x\\" ]"', '"A \\"x\\" ]"'));
    expect(out.startsWith("Prose with a \\_literal\\_ escape.")).toBe(true);
    expect(out.endsWith("After \\_ok\\_.")).toBe(true);
    expect(JSON.parse(out.split("\n\n")[1]!)).toMatchObject({ __kind: "flashcard_set" });
  });
  it.each([1, 2, 3, 7, 64])("chunk size %i gives the whole-text bytes", (size) => {
    expect(chunked(() => new MarkdownEscapedKindJson(), SOURCE, size)).toBe(unescapeMarkdownKindJson(SOURCE));
  });
  it("text without the escaped key is untouched", () => {
    expect(unescapeMarkdownKindJson('a "\\_\\_kin" b \\_')).toBe('a "\\_\\_kin" b \\_');
  });
});

describe("kind as image alt text (P9)", () => {
  const SOURCE = `Look: ![${KIND}](https://x.test/a.png) then ![cat](c.png) and ![{"name":"x"}](d.png)!`;
  it("drops the image wrapper of a kind only", () => {
    expect(unwrapKindImageAlt(SOURCE)).toBe(`Look: ${KIND} then ![cat](c.png) and ![{"name":"x"}](d.png)!`);
  });
  it.each([1, 2, 5, 13, 200])("chunk size %i gives the whole-text bytes", (size) => {
    expect(chunked(() => new KindImageAltUnwrap(), SOURCE, size)).toBe(unwrapKindImageAlt(SOURCE));
  });
});
