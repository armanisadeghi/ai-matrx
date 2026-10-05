/* THROWAWAY adversarial verification — delete before finishing. */
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import {
  decideBlockRender,
  type RenderBlock,
} from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { expandTextBlocksInList } from "@/components/mardown-display/markdown-classification/processors/utils/expand-text-blocks";
import {
  hasKindKey,
  isJsonFenceLanguage,
  markdownCarriesKind,
} from "../surfaces/json-kind-signal";
import { drawsKindAsRawJson } from "../render-paths/draws-raw-kind-json";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

const K = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cells",
  cards: [{ __kind: "flashcard", front: "Q", back: "A" }],
});
const PRETTY = JSON.stringify(JSON.parse(K), null, 2);

type Upsert = { requestId: string; block: RenderBlockPayload };

function run(stream: string, chunks: string[], finalize: boolean) {
  const upserts: Upsert[] = [];
  const acc = new StreamBlockAccumulator("r", (p) => {
    upserts.push(p as Upsert);
    return p;
  });
  const d = (a: unknown) => a;
  for (const c of chunks) acc.ingest(c, d);
  if (finalize) acc.finalize(d);
  return upserts.map((u) => u.block);
}

/** Generic judge for a RenderBlock (static path) — mirrors drawsKindAsRawJson. */
function rawKindBlock(rb: RenderBlock, active: boolean): string | null {
  const content = rb.content ?? "";
  if (!hasKindKey(content)) return null;
  const { block, gate } = decideBlockRender(rb, { isStreamActive: active });
  if (gate) return null;
  if (block.type === "text")
    return markdownCarriesKind(block.content ?? "") ? `text:${(block.content ?? "").slice(0, 50)}` : null;
  if (block.type === "code" && isJsonFenceLanguage(block.language))
    return `code[${block.language}]:${content.slice(0, 50)}`;
  // record the unusual routed type for manual review
  if (!/flashcard|generic_structured|db_kind|kind/i.test(String(block.type)))
    return `OTHER(${block.type}${block.language ? ":" + block.language : ""}):${content.slice(0, 50)}`;
  return null;
}

function staticLeaks(text: string) {
  const blocks = expandTextBlocksInList(splitContentIntoBlocksV2(text) as RenderBlock[]);
  return blocks.map((b) => rawKindBlock(b, false)).filter(Boolean);
}

function liveLeaks(text: string, chunks: string[]) {
  const frames = run(text, chunks, false);
  const bad = new Set<string>();
  for (const f of frames) {
    if (f.status !== "streaming" && f.status !== "complete") continue;
    // Each live frame goes through renderBlockToContentBlock + expandTextBlocksInList
    const rb = expandTextBlocksInList([renderBlockToContentBlock(f)]);
    for (const b of rb) {
      const r = rawKindBlock(b, true);
      if (r) bad.add(r);
    }
  }
  return [...bad];
}

function finalLeaks(text: string) {
  const frames = run(text, [...text], true);
  const last = new Map<string, RenderBlockPayload>();
  for (const f of frames) last.set(f.blockId, f);
  const out: string[] = [];
  for (const f of last.values()) {
    for (const b of expandTextBlocksInList([renderBlockToContentBlock(f)])) {
      const r = rawKindBlock(b, false);
      if (r) out.push(r);
    }
  }
  return out;
}

const chunkers: Array<[string, (s: string) => string[]]> = [
  ["1char", (s) => [...s]],
  ["whole", (s) => [s]],
  ["7char", (s) => s.match(/[\s\S]{1,7}/g) ?? []],
];

const CASES: Array<[string, string]> = [
  ["json fence", `Hi:\n\n\`\`\`json\n${K}\n\`\`\`\n\nAfter.`],
  ["CRLF json fence", `Hi:\r\n\r\n\`\`\`json\r\n${PRETTY.replace(/\n/g, "\r\n")}\r\n\`\`\`\r\n\r\nAfter.`],
  ["BOM bare", `\uFEFF${K}`],
  ["BOM fence", `\uFEFF\`\`\`json\n${K}\n\`\`\``],
  ["4-backtick", `Hi:\n\n\`\`\`\`json\n${PRETTY}\n\`\`\`\`\n\nAfter.`],
  ["tilde", `Hi:\n\n~~~json\n${PRETTY}\n~~~\n`],
  ["fence info string title", `Hi:\n\n\`\`\`json title="x"\n${K}\n\`\`\`\n`],
  ["fence info json{1}", `Hi:\n\n\`\`\`json {1,2}\n${K}\n\`\`\`\n`],
  ["fence space before lang", `Hi:\n\n\`\`\` json\n${K}\n\`\`\`\n`],
  ["fence indented 2", `Hi:\n\n  \`\`\`json\n  ${K}\n  \`\`\`\n`],
  ["list item bare", `Items:\n\n- one\n- ${K}\n- three\n`],
  ["list item fence", `Items:\n\n- one\n  \`\`\`json\n  ${K}\n  \`\`\`\n- three\n`],
  ["ordered list item", `1. ${K}\n2. b\n`],
  ["table cell", `| a | b |\n|---|---|\n| x | ${K} |\n`],
  ["blockquote bare", `> ${K}\n\nAfter.`],
  ["blockquote fence", `> \`\`\`json\n> ${K}\n> \`\`\`\n`],
  ["nested quote", `> > ${K}\n`],
  ["nested quote fence", `> > \`\`\`json\n> > ${K}\n> > \`\`\`\n`],
  ["quote in list", `- > ${K}\n`],
  ["html comment", `Hi <!-- ${K} --> there\n`],
  ["details", `<details><summary>Show</summary>\n\n${K}\n\n</details>\n`],
  ["details one line", `<details><summary>Show</summary>${K}</details>\n`],
  ["div html block", `<div>\n${K}\n</div>\n`],
  ["two kinds one line", `${K} ${K}\n`],
  ["two kinds prose one line", `First ${K} and second ${K} done.\n`],
  ["two kinds one fence", `\`\`\`json\n${K}\n${K}\n\`\`\`\n`],
  ["mixed array", `\`\`\`json\n[${K},{"a":1},{"__kind":"zz_unreg","x":2}]\n\`\`\`\n`],
  ["deep nested", `\`\`\`json\n{"data":{"result":{"items":[{"note":"x"},${K}]}}}\n\`\`\`\n`],
  ["deep nested bare", `{"data":{"result":{"items":[{"note":"x"},${K}]}}}\n`],
  ["long kindless prefix", `\`\`\`json\n{"blob":"${"x".repeat(3000)}","inner":${K}}\n\`\`\`\n`],
  ["kind after long prose", `${"Lorem ipsum dolor. ".repeat(200)}${K}\n`],
  ["unregistered slug", `\`\`\`json\n{"__kind":"zz_not_registered","x":1}\n\`\`\`\n`],
  ["unregistered slug bare", `{"__kind":"zz_not_registered","x":1}\n`],
  ["invalid slug spaces", `\`\`\`json\n{"__kind":"My Kind!","x":1}\n\`\`\`\n`],
  ["numeric kind", `\`\`\`json\n{"__kind":5,"x":1}\n\`\`\`\n`],
  ["null kind", `\`\`\`json\n{"__kind":null,"x":1}\n\`\`\`\n`],
  ["empty kind", `\`\`\`json\n{"__kind":"","x":1}\n\`\`\`\n`],
  ["escaped key", `\`\`\`json\n{"\\u005f_kind":"flashcard_set","title":"x","cards":[]}\n\`\`\`\n`],
  ["unicode escaped slug", `\`\`\`json\n{"__kind":"flashcard\\u005fset","title":"x","cards":[]}\n\`\`\`\n`],
  ["indented code", `Text\n\n    ${K}\n\nAfter`],
  ["kind in heading", `# ${K}\n`],
  ["kind in bold", `**${K}**\n`],
  ["kind in link text", `[${K}](https://x.y)\n`],
  ["thinking block", `<thinking>\n${K}\n</thinking>\n\nAnswer.`],
  ["kind after kindless obj same line", `{"a":1} ${K}\n`],
  ["kind in setext", `${K}\n===\n`],
  ["kind with trailing comma text", `${K},\n`],
  ["kind inside parens", `(${K})\n`],
  ["kind inside xml tag", `<answer>${K}</answer>\n`],
  ["kind after hr", `---\n${K}\n---\n`],
  ["json5 unquoted key", `\`\`\`json5\n{__kind: "flashcard_set", title: "x", cards: []}\n\`\`\`\n`],
  ["jsonc with comment", `\`\`\`jsonc\n// note\n${PRETTY}\n\`\`\`\n`],
  ["kind in footnote", `See[^1].\n\n[^1]: ${K}\n`],
  ["kind with newline in key spacing", `\`\`\`json\n{"__kind"\n:\n"flashcard_set","title":"x","cards":[]}\n\`\`\`\n`],
];

describe("zz attack: static (reload)", () => {
  it.each(CASES)("%s", (_l, text) => {
    expect(staticLeaks(text)).toEqual([]);
  });
});

describe("zz attack: final (finalized stream)", () => {
  it.each(CASES)("%s", (_l, text) => {
    expect(finalLeaks(text)).toEqual([]);
  });
});

describe("zz attack: live frames", () => {
  for (const [cl, chunk] of chunkers) {
    it.each(CASES)(`${cl} %s`, (_l, text) => {
      expect(liveLeaks(text, chunk(text))).toEqual([]);
    });
  }
});

describe("zz attack: truncated at every boundary then finalized", () => {
  const T: Array<[string, string]> = [
    ["fence", `Hi:\n\n\`\`\`json\n${PRETTY}\n\`\`\`\nAfter`],
    ["bare", `Hi: ${K} after`],
    ["quote", `> \`\`\`json\n> ${K}\n> \`\`\`\n`],
  ];
  it.each(T)("%s", (_l, text) => {
    const bad: string[] = [];
    for (let n = 1; n <= text.length; n++) {
      const prefix = text.slice(0, n);
      for (const r of finalLeaks(prefix)) bad.push(`${n}: ${r}`);
      for (const r of staticLeaks(prefix)) bad.push(`static ${n}: ${r}`);
    }
    expect(bad.slice(0, 15)).toEqual([]);
  });
});

describe("zz attack: judge vs payload judge", () => {
  it("judge agrees with rawKindBlock on fenced kind", () => {
    const b = {
      blockId: "b",
      blockIndex: 0,
      type: "code",
      status: "complete",
      content: K,
      data: { language: "json" },
    } as unknown as RenderBlockPayload;
    expect(drawsKindAsRawJson(b, { isStreamActive: false })).toBe(false);
  });
});
