/**
 * THE REMAINDER LAW — a schema-bound agent's stream is reasoning, then JSON,
 * and the JSON must open its kind region LIVE whatever punctuation separates
 * the two.
 *
 * Live-caught on a Study Pack run (Arman, 2026-08-26): the summary step's
 * lane showed RAW JSON mid-stream. Root cause was three related holes in the
 * accumulator, all shapes real agents emit:
 *
 *  1. `</reasoning>{"__kind":…}` — same line. The closing-tag handler
 *     appended the remainder INTO the reasoning block, so no JSON region
 *     ever opened.
 *  2. `<reasoning>…</reasoning>{"__kind":…}` with NO newline anywhere — the
 *     whole stream sat in the pending fragment until finalize.
 *  3. Narration lines, then minified JSON — the fragment opener refused to
 *     open a region whenever the current text block had ANY committed
 *     content, even though the fragment always begins at a line boundary
 *     (processLine's own gate happily opens there).
 *
 * The law: anything after a closing tag is a NEW LINE, never tag content;
 * and a fragment that starts a line with `{` opens its region no matter what
 * prose came before it.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";

const PAYLOAD =
  '{"__kind": "study_summary", "title": "T", "key_points": ["a", "b", "c"], "summary_markdown": "## Body\\n\\nEnough text to carry the region well past any patience threshold used by the pending gate downstream of here."}';

function run(wire: string, chunk = 17) {
  const upserts: RenderBlockPayload[] = [];
  const acc = new StreamBlockAccumulator("tag-json", (p) => {
    upserts.push(JSON.parse(JSON.stringify(p.block)));
    return p;
  });
  const dispatch = (a: unknown) => a;
  for (let i = 0; i < wire.length; i += chunk) {
    acc.ingest(wire.slice(i, i + chunk), dispatch);
  }
  acc.finalize(dispatch);
  return upserts;
}

function kindDetectedMidStream(upserts: RenderBlockPayload[], kind: string) {
  return upserts.some((u) => {
    const root = readEnvelope(u.metadata)?.root;
    return root?.status === "streaming" && root.kind === kind;
  });
}

function finalBlocks(upserts: RenderBlockPayload[]) {
  const byId = new Map<string, RenderBlockPayload>();
  for (const u of upserts) byId.set(u.blockId, u);
  return [...byId.values()];
}

describe("tag-then-JSON streams open their kind region LIVE", () => {
  it.each([
    ["JSON on the SAME line as the closing tag", `<reasoning>\nWorking through it.\n</reasoning>${PAYLOAD}`],
    ["closing tag, newline, then JSON (control)", `<reasoning>\nWorking through it.\n</reasoning>\n${PAYLOAD}`],
    ["one newline-less fragment: complete tag + JSON", `<reasoning>Working.</reasoning>${PAYLOAD}`],
    ["narration lines, then minified JSON", `Analyzing the source.\nAlmost there.\n\n${PAYLOAD}`],
  ])("%s", (_label, wire) => {
    const upserts = run(wire);
    expect(kindDetectedMidStream(upserts, "study_summary")).toBe(true);
  });

  it("the JSON never pollutes the reasoning block's content", () => {
    const upserts = run(
      `<reasoning>\nWorking through it.\n</reasoning>${PAYLOAD}`,
    );
    const reasoning = finalBlocks(upserts).find((b) => b.type === "reasoning");
    expect(reasoning).toBeDefined();
    expect(reasoning?.content ?? "").not.toContain("__kind");
    expect(reasoning?.content ?? "").not.toContain("</reasoning>");
  });

  it("prose before the JSON stays a text block; the region carries the kind", () => {
    const upserts = run(`Analyzing the source.\n\n${PAYLOAD}`);
    const blocks = finalBlocks(upserts);
    const text = blocks.find((b) => b.type === "text" && (b.content ?? "").includes("Analyzing"));
    expect(text).toBeDefined();
    expect(text?.content ?? "").not.toContain("__kind");
    const region = blocks.find(
      (b) => readEnvelope(b.metadata)?.root.kind === "study_summary",
    );
    expect(region?.status).toBe("complete");
  });
});
