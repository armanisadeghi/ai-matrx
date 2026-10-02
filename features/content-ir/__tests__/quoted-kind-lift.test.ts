/**
 * V1 — a kind inside a BLOCKQUOTE is data, never raw JSON in a quote.
 *
 * Live (the accumulator, char by char and at random chunkings) and reload (the
 * static splitter, which the public shared page and the standard level use)
 * must both lift the region out of the quote, and agree block for block.
 */

import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { drawsRawJsonCard } from "../render-paths/draws-raw-kind-json";
import { readEnvelope } from "../redux/render-block-envelope";
import { hasKindKey } from "../surfaces/json-kind-signal";
import { QuotedKindLift, liftQuotedKindRegions } from "../surfaces/quoted-kind-lift";
import { chunkText } from "./seeded-random";

const KIND = {
  __kind: "flashcard_set",
  title: "Quoted cards",
  cards: [{ __kind: "flashcard", front: "Q", back: "A" }],
};
const ONE_LINE = JSON.stringify(KIND);
const PRETTY = JSON.stringify(KIND, null, 2);
const quote = (text: string, prefix = "> ") =>
  text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");

const CASES: Array<[string, string]> = [
  ["quoted ```json pretty", `> Here you go:\n${quote("```json\n" + PRETTY + "\n```")}\n> After.`],
  ["quoted ```json one-line", `> Here you go:\n${quote("```json\n" + ONE_LINE + "\n```")}\n> After.`],
  ["quoted unlabelled fence", `> Here you go:\n${quote("```\n" + PRETTY + "\n```")}\n> After.`],
  ["quoted ~~~JSON fence", `> Here you go:\n${quote("~~~JSON\n" + PRETTY + "\n~~~")}\n> After.`],
  ["quoted bare one-line", `> Here you go:\n> ${ONE_LINE}\n> After.`],
  ["quoted bare pretty", `> Here you go:\n${quote(PRETTY)}\n> After.`],
  ["nested quote fence", `> > Here you go:\n${quote("```json\n" + PRETTY + "\n```", "> > ")}\n> > After.`],
  ["quote without spaces", `>Here you go:\n${quote("```json\n" + PRETTY + "\n```", ">")}\n>After.`],
];

type Shape = { type: string; content: string; kind: string | null };

function splitterShapes(source: string): Shape[] {
  return splitContentIntoBlocksV2(source)
    .filter((b) => b.content.trim())
    .map((b) => ({
      type: b.type,
      content: b.content.trim(),
      kind: readEnvelope(b.metadata)?.root.kind || null,
    }));
}

function stream(source: string, chunks: string[]) {
  const upserts: RenderBlockPayload[] = [];
  const acc = new StreamBlockAccumulator("req-quoted", (payload) => {
    upserts.push((payload as { block: RenderBlockPayload }).block);
    return payload;
  });
  const dispatch = (a: unknown) => a;
  for (const c of chunks) acc.ingest(c, dispatch);
  const live = [...upserts];
  acc.finalize(dispatch);
  const last = new Map<string, RenderBlockPayload>();
  for (const b of upserts) last.set(b.blockId, b);
  const final: Shape[] = [...last.values()]
    .filter((b) => (b.content ?? "").trim())
    .sort((a, b) => a.blockIndex - b.blockIndex)
    .map((b) => ({
      type: b.type,
      content: (b.content ?? "").trim(),
      kind: readEnvelope(b.metadata)?.root.kind || null,
    }));
  return { live, final };
}

describe("a kind inside a blockquote leaves the quote (V1)", () => {
  it.each(CASES)("%s: reload lifts it — quote, the kind, quote", (_label, source) => {
    const shapes = splitterShapes(source);
    const kinds = shapes.filter((s) => s.kind === "flashcard_set");
    expect(kinds).toHaveLength(1);
    expect(JSON.parse(kinds[0]!.content)).toEqual(KIND);
    // No text block still carries the kind's JSON.
    expect(shapes.filter((s) => s.type === "text" && hasKindKey(s.content))).toEqual([]);
    expect(shapes[0]!.content).toMatch(/^>+ ?>? ?Here you go:$/);
    expect(shapes[shapes.length - 1]!.content).toMatch(/After\.$/);
  });

  it.each(CASES)("%s: live char by char — no frame prints the kind raw", (_label, source) => {
    const { live } = stream(source, [...source]);
    const visible = live.filter((b) => b.status === "streaming" && hasKindKey(b.content ?? ""));
    expect(visible.length).toBeGreaterThan(0);
    const raw = visible.filter((b) =>
      b.type === "text" ? true : drawsRawJsonCard(b),
    );
    expect(raw.map((b) => `${b.type}: ${(b.content ?? "").slice(0, 40)}`)).toEqual([]);
  });

  it.each(CASES)("%s: live final blocks equal the reload at every chunking", (_label, source) => {
    const expected = splitterShapes(source);
    for (let seed = 1; seed <= 6; seed++) {
      expect(stream(source, chunkText(source, seed, 9)).final).toEqual(expected);
    }
    expect(stream(source, [...source]).final).toEqual(expected);
  });
});

describe("what stays in the quote, as written", () => {
  const STAYS: Array<[string, string]> = [
    ["a quoted ```ts fence (quoting source)", `> Example:\n${quote("```ts\nconst x = " + ONE_LINE + ";\n```")}`],
    [
      "a quoted kind inside an unquoted ```markdown fence",
      "```markdown\n" + quote("```json\n" + ONE_LINE + "\n```") + "\n```",
    ],
    ["kindless quoted JSON", `> Data:\n> {"a": 1, "b": [1, 2]}\n> End.`],
    ["kindless quoted pretty JSON", `> Data:\n${quote(JSON.stringify({ a: 1, b: 2 }, null, 2))}\n> End.`],
    ["quoted prose", "> Just a quote\n> > nested\n>\n> with a blank line."],
    ["prose mentioning __kind", '> The "__kind" key names a kind.'],
  ];

  it.each(STAYS)("%s: the transform returns the text unchanged", (_label, source) => {
    expect(liftQuotedKindRegions(source)).toBe(source);
    for (let seed = 1; seed <= 4; seed++) {
      const lift = new QuotedKindLift();
      const out = chunkText(source, seed, 5).map((c) => lift.push(c)).join("") + lift.flush();
      expect(out).toBe(source);
    }
  });
});

describe("the lift is chunk-invariant", () => {
  it.each(CASES)("%s: every chunking gives the whole-text bytes", (_label, source) => {
    const whole = liftQuotedKindRegions(source);
    expect(whole).not.toBe(source);
    for (let seed = 1; seed <= 8; seed++) {
      const lift = new QuotedKindLift();
      const out = chunkText(source, seed, 4).map((c) => lift.push(c)).join("") + lift.flush();
      expect(out).toBe(whole);
    }
  });
});
