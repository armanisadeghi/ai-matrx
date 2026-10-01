import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { drawsKindAsRawJson, drawsRawJsonCard } from "../render-paths/draws-raw-kind-json";
import { hasKindKey } from "../surfaces/json-kind-signal";
import { TextDecoder as D, TextEncoder as E } from "node:util";
(global as any).TextDecoder ??= D; (global as any).TextEncoder ??= E;

const K = JSON.stringify({ __kind: "flashcard_set", title: "T", cards: [{ __kind: "flashcard", front: "a", back: "b" }] });
const KP = JSON.stringify(JSON.parse(K), null, 2);
const cases: Record<string, string> = {
  unicodeKey: `Here:\n\n\`\`\`json\n{"\\u005f_kind":"flashcard_set","title":"T","cards":[]}\n\`\`\`\n`,
  singleQuotes: `Here:\n\n\`\`\`json\n{'__kind':'flashcard_set','title':'T'}\n\`\`\`\n`,
  longFirstKey: `Here:\n\n\`\`\`json\n{"${"x".repeat(2500)}":1,"__kind":"flashcard_set"}\n\`\`\`\n`,
  longFirstKeyNoKindYet: `Here:\n\n\`\`\`json\n{"${"x".repeat(2500)}":1,"title":"x","more":"${"y".repeat(100)}","__kind":"flashcard_set"}\n\`\`\`\n`,
  crlf: `Here:\r\n\r\n\`\`\`json\r\n${KP.replace(/\n/g, "\r\n")}\r\n\`\`\`\r\n\r\nAfter.`,
  fourBackticks: `Here:\n\n\`\`\`\`json\n${KP}\n\`\`\`\`\n\nAfter.`,
  nestedMarkdownFence: `Here:\n\n\`\`\`\`markdown\nInner:\n\`\`\`json\n${KP}\n\`\`\`\n\`\`\`\`\n\nAfter.`,
  markdownFence3: `Here:\n\n\`\`\`markdown\n${KP}\n\`\`\`\n\nAfter.`,
  tableCell: `| a | b |\n|---|---|\n| x | ${K} |\n\nAfter.`,
  listItem: `- item one\n- ${K}\n- item three\n`,
  listItemPretty: `1. Here:\n   \`\`\`json\n${KP.split("\n").map(l=>"   "+l).join("\n")}\n   \`\`\`\n2. next\n`,
  blockquote: `> ${K}\n\nAfter.`,
  blockquoteFence: `> \`\`\`json\n${KP.split("\n").map(l=>"> "+l).join("\n")}\n> \`\`\`\n\nAfter.`,
  htmlComment: `Text <!-- ${K} --> more.`,
  twoKindsOneLine: `${K}${K}\n\nAfter.`,
  twoKindsSpace: `Text: ${K} and ${K}\n`,
  bom: `\uFEFF${K}`,
  bomFence: `Here:\n\n\`\`\`json\n\uFEFF${K}\n\`\`\`\n`,
  inlineProse: `The answer is ${K} as shown.`,
  inlineCode: `The answer is \`${K}\` as shown.`,
  indentedCode: `Para:\n\n    ${K}\n\nAfter.`,
  tsFence: `Here:\n\n\`\`\`ts\n${KP}\n\`\`\`\n`,
  textFence: `Here:\n\n\`\`\`text\n${KP}\n\`\`\`\n`,
  arrayOfKinds: `Here:\n\n\`\`\`json\n[${K},${K}]\n\`\`\`\n`,
  wrapped: `Here:\n\n\`\`\`json\n{"result":${K}}\n\`\`\`\n`,
  wrappedPretty: `Here:\n\n\`\`\`json\n${JSON.stringify({result: JSON.parse(K)}, null, 2)}\n\`\`\`\n`,
  stringifiedKind: `Here:\n\n\`\`\`json\n${JSON.stringify({result: K})}\n\`\`\`\n`,
  unclosed: `Here:\n\n\`\`\`json\n${KP.slice(0, 60)}`,
  bareUnclosed: `Here:\n\n${K.slice(0, 50)}`,
  spaceBeforeColon: `Here:\n\n\`\`\`json\n{ "__kind" : "flashcard_set", "title": "T" }\n\`\`\`\n`,
  xmlish: `<answer>${K}</answer>\n`,
  bareAfterTextSameLine: `Result: ${K}\n\nDone.`,
};

function run(stream: string, chunk: number, finalize: boolean) {
  const ups: RenderBlockPayload[] = [];
  const acc = new StreamBlockAccumulator("r", (p: any) => { ups.push(p.block); return { type: "x", payload: p }; });
  const d = (a: unknown) => a;
  for (let i = 0; i < stream.length; i += chunk) acc.ingest(stream.slice(i, i + chunk), d);
  if (finalize) acc.finalize(d);
  return ups;
}

describe("probe", () => {
  for (const [name, s] of Object.entries(cases)) {
    it(name, () => {
      const out: string[] = [];
      for (const chunk of [1, 7, 100000]) {
        const ups = run(s, chunk, true);
        const midRaw = ups.filter((b) => b.status === "streaming" && hasKindKey(b.content ?? "") && drawsRawJsonCard(b));
        const last = new Map<string, RenderBlockPayload>();
        for (const b of ups) last.set(b.blockId, b);
        const finals = [...last.values()].sort((a, b) => a.blockIndex - b.blockIndex);
        out.push(`chunk=${chunk} midRawKind=${midRaw.length}` + (midRaw[0] ? ` e.g.type=${midRaw[0].type} ${JSON.stringify((midRaw[0].content??"").slice(0,50))}` : ""));
        for (const b of finals) out.push(`  final type=${b.type} status=${b.status} kindKey=${hasKindKey(b.content??"")} judgeRaw=${drawsKindAsRawJson(b)} data=${JSON.stringify(b.data)?.slice(0,60)} ir=${!!(b.metadata as any)?.__ir} c=${JSON.stringify((b.content??"").slice(0,70))}`);
      }
      console.log(`=== ${name}\n` + out.join("\n"));
    });
  }
});
