import { unwrapKindEnvelopes } from "./plain-text";

describe("unwrapKindEnvelopes — the readable projection of stored content", () => {
  it("replaces an artifact envelope with its body and keeps everything else byte for byte", () => {
    const stored = [
      "## Fruit Colors",
      "",
      '<artifact type="table" id="5bbde807" version="1" title="Table 1">',
      "| Fruit | Color |",
      "|---|---|",
      "| Apple | Red |",
      "</artifact>",
      "",
      "## Storage Tips",
      "",
    ].join("\n");
    expect(unwrapKindEnvelopes(stored)).toBe(
      "## Fruit Colors\n\n| Fruit | Color |\n|---|---|\n| Apple | Red |\n\n## Storage Tips\n",
    );
  });

  it("never touches a code fence that only mentions the tag", () => {
    const text = '```html\n<artifact id="x">keep</artifact>\n```\n';
    expect(unwrapKindEnvelopes(text)).toBe(text);
  });
});
