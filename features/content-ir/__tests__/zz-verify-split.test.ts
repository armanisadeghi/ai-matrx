import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
jest.setTimeout(900_000);
function settle(chunks: string[]) {
  const m = new Map<string, any>();
  const acc = new StreamBlockAccumulator("r", (p) => { const b = (p as any).block; m.set(b.blockId, b); return { type: "t", payload: p }; });
  const d = (a: unknown) => a;
  for (const c of chunks) acc.ingest(c, d);
  acc.finalize(d);
  return JSON.stringify([...m.values()].sort((a, b) => a.blockIndex - b.blockIndex).map((b) => [b.type, b.content]));
}
const J = JSON.stringify({ __kind: "flashcard_set", title: "Cell biology", cards: [{ front: "Q?", back: "A" }] });
const S: Array<[string, string]> = [
  ["literal", J],
  ["u-escaped", J.replace('"__kind"', '"\\u005f_kind"')],
  ["md-escaped", J.replaceAll("_", "\\_")],
  ["zw", J.replace("__kind", "__​kind")],
  ["zw+md", J.replaceAll("_", "\\_").replace("\\_\\_kind", "\\_\\_​kind")],
  ["fence md-escaped", "```json\n" + J.replaceAll("_", "\\_") + "\n```"],
  ["fence zw", "```json\n" + J.replace("__kind", "__​kind") + "\n```"],
];
it.each(S)("%s split invariance", (name, sp) => {
  const text = `Here: ${sp} Enjoy.`;
  const base = settle([...text]);
  const whole = settle([text]);
  const bad: number[] = [];
  for (let k = 1; k < text.length; k++) {
    // split at every UTF-16 index, including inside surrogate-free ZW chars
    if (settle([text.slice(0, k), text.slice(k)]) !== base) bad.push(k);
  }
  console.log("SPLIT " + JSON.stringify({ name, wholeEqBase: whole === base, badSplits: bad.length, firstBad: bad.slice(0, 5), base: base.slice(0, 200) }));
});
