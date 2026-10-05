import { kindTextToMarkdown, kindTextPreview } from "../surfaces/kind-text-to-markdown";
import { hasKindKey, markdownCarriesKind } from "../surfaces/json-kind-signal";
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));
const K = JSON.stringify({ __kind: "flashcard_set", title: "Cells", cards: [{ __kind: "flashcard", front: "Q", back: "A" }] });
const P = JSON.stringify(JSON.parse(K), null, 2);
const C: Array<[string, string]> = [
  ["fence", "```json\n" + K + "\n```"],
  ["4tick", "````json\n" + P + "\n````"],
  ["info title", '```json title="x"\n' + K + "\n```"],
  ["space lang", "``` json\n" + K + "\n```"],
  ["jsonc comment", "```jsonc\n// c\n" + P + "\n```"],
  ["list", "- " + K],
  ["table", `| a | b |\n|---|---|\n| x | ${K} |`],
  ["nested quote", "> > " + K],
  ["details", `<details><summary>S</summary>\n\n${K}\n\n</details>`],
  ["xml tag", `<answer>${K}</answer>`],
  ["div", `<div>\n${K}\n</div>`],
  ["frontmatter", `---\n${K}\n---\n`],
  ["two one line", `${K} ${K}`],
  ["deep", `{"a":{"b":[{"c":1},${K}]}}`],
  ["escaped key", `{"\\u005f_kind":"flashcard_set","title":"x","cards":[]}`],
  ["escaped key cut", `Hi {"\\u005f_kind":"flashcard_set","title":"x","ca`],
  ["numeric", `{"__kind":5,"x":1}`],
  ["unregistered", `{"__kind":"zz_unreg","x":1}`],
  ["cut in slug", `Hi {"__kind":"flash`],
  ["cut after colon", `Hi {"__kind":`],
  ["indented", `Text\n\n    ${K}\n`],
  ["html comment", `Hi <!-- ${K} --> x`],
  ["json5 unquoted", "```json5\n{__kind: \"flashcard_set\", title: \"x\"}\n```"],
];
it.each(C)("export %s", (_l, t) => {
  const md = kindTextToMarkdown(t);
  expect(markdownCarriesKind(md) ? md.slice(0, 120) : "ok").toBe("ok");
});
it.each(C)("preview %s", (_l, t) => {
  const p = kindTextPreview(t);
  expect(markdownCarriesKind(p.text) ? p.text.slice(0, 120) : "ok").toBe("ok");
});
it.each(C)("crlf export %s", (_l, t) => {
  const md = kindTextToMarkdown(t.replace(/\n/g, "\r\n"));
  expect(markdownCarriesKind(md) ? md.slice(0, 120) : "ok").toBe("ok");
});
