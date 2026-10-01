import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { hasKindKey, markdownCarriesKind } from "../surfaces/json-kind-signal";
import { TextDecoder as D, TextEncoder as E } from "node:util";
(global as any).TextDecoder ??= D; (global as any).TextEncoder ??= E;
const K = JSON.stringify({ __kind: "flashcard_set", title: "T", cards: [{ __kind: "flashcard", front: "a", back: "b" }] });
const KP = JSON.stringify(JSON.parse(K), null, 2);
const cases: Record<string, string> = {
  nestedMarkdownFence: `Here:\n\n\`\`\`\`markdown\nInner:\n\`\`\`json\n${KP}\n\`\`\`\n\`\`\`\`\n\nAfter.`,
  markdownFence3: `Here:\n\n\`\`\`markdown\n${KP}\n\`\`\`\n\nAfter.`,
  tableCell: `| a | b |\n|---|---|\n| x | ${K} |\n\nAfter.`,
  listItem: `- item one\n- ${K}\n- item three\n`,
  blockquoteFence: `> \`\`\`json\n${KP.split("\n").map(l=>"> "+l).join("\n")}\n> \`\`\`\n\nAfter.`,
  blockquote: `> ${K}\n\nAfter.`,
  htmlComment: `Text <!-- ${K} --> more.`,
  inlineProse: `The answer is ${K} as shown.`,
  inlineCode: `The answer is \`${K}\` as shown.`,
  indentedCode: `Para:\n\n    ${K}\n\nAfter.`,
  tsFence: `Here:\n\n\`\`\`ts\n${KP}\n\`\`\`\n`,
  pyFence: `Here:\n\n\`\`\`python\nx = ${K}\n\`\`\`\n`,
  stringifiedKind: `Here:\n\n\`\`\`json\n${JSON.stringify({result: K})}\n\`\`\`\n`,
  unicodeKey: `Here:\n\n\`\`\`json\n{"\\u005f_kind":"flashcard_set","title":"T","cards":[]}\n\`\`\`\n`,
  crlf: `Here:\r\n\r\n\`\`\`json\r\n${KP.replace(/\n/g, "\r\n")}\r\n\`\`\`\r\n\r\nAfter.`,
  fourBackticks: `Here:\n\n\`\`\`\`json\n${KP}\n\`\`\`\`\n\nAfter.`,
  xmlish: `<answer>${K}</answer>\n`,
  thinkTag: `<thinking>${K}</thinking>\nok`,
  detailsHtml: `<details><summary>x</summary>\n\n${K}\n\n</details>`,
  yamlFence: `\`\`\`yaml\n__kind: flashcard_set\ntitle: T\n\`\`\`\n`,
  twoKindsOneLine: `${K}${K}\n\nAfter.`,
};
it("split", () => {
  const out: string[] = [];
  for (const [n, s] of Object.entries(cases)) {
    out.push(`=== ${n}`);
    for (const b of splitContentIntoBlocksV2(s) as any[]) out.push(`  type=${b.type} lang=${b.language} kindKey=${hasKindKey(b.content??"")} mdKind=${markdownCarriesKind(b.content??"")} ir=${!!b.metadata?.__ir} c=${JSON.stringify((b.content??"").slice(0,70))}`);
  }
  console.log(out.join("\n"));
});
