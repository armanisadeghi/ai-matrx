/**
 * THE NEVER-RAW LAW, mid-stream (Arman, 2026-09-30, after a floating agent
 * chat showed a streaming `flashcard_set` as a raw ```json card).
 *
 * The phases, in Arman's words:
 *   1. The moment it COULD be a kind, it displays as a kind (its loader).
 *   2. The moment we know WHICH kind, it switches to that kind.
 *   3. The moment we know it is broken or not a kind, it is handled properly.
 * A JSON region whose FIRST KEY is not `__kind` (and carries no `__kind`) is
 * genuinely JSON and may render as JSON — but never before its first key has
 * arrived, and never once a `__kind` key has been seen.
 *
 * This drives the REAL accumulator CHARACTER BY CHARACTER and asks, for every
 * frame, the same question BlockRenderer asks: after the kind route and the
 * pending gate, would this block fall through to the raw JSON code card?
 *
 * The reported defect: the model wrote the whole payload on ONE line inside
 * the fence. Fence regions were fed to the parser line-by-line only, so the
 * line never completed and `__kind` was never seen until the fence closed.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { pendingStructuredEnvelope } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { applyIrKindRoute } from "../react/kind-route";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

type Upsert = { requestId: string; block: RenderBlockPayload };

const KIND_PAYLOAD_ONE_LINE = JSON.stringify({
  __kind: "flashcard_set",
  title: "Flashcards",
  cards: [
    {
      __kind: "flashcard",
      front: "Polyatomic Ion",
      back: "An electrically charged group of two or more covalently bonded atoms that carries a net positive or negative charge and acts as a single unit in chemical reactions.",
    },
    {
      __kind: "flashcard",
      front: "Oxoanion",
      back: "A polyatomic anion that contains oxygen atoms chemically bonded to another element.",
    },
    {
      __kind: "flashcard",
      front: 'Naming Rule:\n"-ate" vs. "-ite" Suffixes',
      back: '- "-ate" refers to the standard or base oxoanion form.\n- "-ite" refers to an oxoanion with exactly one less oxygen atom than the "-ate" form, while retaining the same overall charge.',
    },
  ],
});

const KIND_LATE_KEY_ONE_LINE = JSON.stringify({
  title: "Flashcards",
  __kind: "flashcard_set",
  cards: [{ __kind: "flashcard", front: "A", back: "B".repeat(400) }],
});

const KINDLESS_ONE_LINE = JSON.stringify({
  title: "Just data",
  rows: Array.from({ length: 30 }, (_, i) => ({ id: i, name: `row ${i}` })),
});

/** Stream one character at a time; return every upsert in order. */
function streamCharByChar(stream: string, requestId: string): Upsert[] {
  const upserts: Upsert[] = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as Upsert);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const ch of stream) accumulator.ingest(ch, dispatch);
  return upserts; // NO finalize — every frame is a live, mid-stream frame
}

/** BlockRenderer's question: does this frame draw the raw JSON code card? */
function rendersRawJson(block: RenderBlockPayload): boolean {
  if (!(block.content ?? "").trim()) return false; // nothing visible yet
  const routed = applyIrKindRoute(renderBlockToContentBlock(block));
  if (routed.type !== "code") return false; // a kind / its loader / text
  return pendingStructuredEnvelope(routed) === null;
}

/** Stream one character at a time, FINALIZE, return the last frame per block. */
function finalBlocks(stream: string, requestId: string): RenderBlockPayload[] {
  const upserts: Upsert[] = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as Upsert);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  for (const ch of stream) accumulator.ingest(ch, dispatch);
  accumulator.finalize(dispatch);
  const last = new Map<string, RenderBlockPayload>();
  for (const { block } of upserts) last.set(block.blockId, block);
  return [...last.values()]
    .filter((b) => (b.content ?? "").trim())
    .sort((a, b) => a.blockIndex - b.blockIndex);
}

function jsonFrames(upserts: Upsert[]): RenderBlockPayload[] {
  return upserts
    .map((u) => u.block)
    .filter((b) => b.type !== "text" && b.status === "streaming");
}

const FENCES: Array<[string, (body: string) => string]> = [
  ["```json", (b) => `Here you go:\n\n\`\`\`json\n${b}`],
  ["```JSON", (b) => `Here you go:\n\n\`\`\`JSON\n${b}`],
  ["bare", (b) => `Here you go:\n\n${b}`],
];

/** Fences no parser opens for — the renderer's first-key gate alone holds. */
const UNPARSED_FENCES: Array<[string, (body: string) => string]> = [
  ["``` (no language)", (b) => `Here you go:\n\n\`\`\`\n${b}`],
  ["```jsonc", (b) => `Here you go:\n\n\`\`\`jsonc\n${b}`],
  ["```json5", (b) => `Here you go:\n\n\`\`\`json5\n${b}`],
];

describe("never raw mid-stream: a __kind region is a kind from its first key", () => {
  it.each(FENCES)(
    "%s one-line flashcard_set: no frame ever draws the raw JSON card",
    (_label, wrap) => {
      const frames = jsonFrames(
        streamCharByChar(wrap(KIND_PAYLOAD_ONE_LINE), `req-oneline-${_label}`),
      );
      expect(frames.length).toBeGreaterThan(0);
      const raw = frames.filter(rendersRawJson);
      expect(raw.map((b) => (b.content ?? "").slice(0, 60))).toEqual([]);
    },
  );

  it.each(FENCES)(
    "%s one-line payload with __kind as a LATER key: raw only before __kind, never after",
    (_label, wrap) => {
      const frames = jsonFrames(
        streamCharByChar(wrap(KIND_LATE_KEY_ONE_LINE), `req-late-${_label}`),
      );
      const afterKind = frames.filter((b) =>
        (b.content ?? "").includes('"__kind":"flashcard_set"'),
      );
      expect(afterKind.length).toBeGreaterThan(0);
      expect(afterKind.filter(rendersRawJson)).toEqual([]);
    },
  );

  it.each(FENCES)(
    "%s kindless JSON: holds before the first key, then streams live as JSON",
    (_label, wrap) => {
      const frames = jsonFrames(
        streamCharByChar(wrap(KINDLESS_ONE_LINE), `req-kindless-${_label}`),
      );
      // Before the first key completes, nothing raw may show.
      const beforeFirstKey = frames.filter(
        (b) => !(b.content ?? "").includes('"title"'),
      );
      expect(beforeFirstKey.filter(rendersRawJson)).toEqual([]);
      // Well after the first key, a genuinely kindless region streams as JSON
      // (a loader is a promise of a component, never a lid over content).
      const late = frames.filter((b) => (b.content ?? "").length > 120);
      expect(late.length).toBeGreaterThan(0);
      expect(late.every(rendersRawJson)).toBe(true);
    },
  );

  it.each(UNPARSED_FENCES)(
    "%s one-line flashcard_set: no frame ever draws the raw JSON card",
    (_label, wrap) => {
      const frames = jsonFrames(
        streamCharByChar(wrap(KIND_PAYLOAD_ONE_LINE), `req-unparsed-${_label}`),
      );
      expect(frames.length).toBeGreaterThan(0);
      expect(
        frames.filter(rendersRawJson).map((b) => (b.content ?? "").slice(0, 40)),
      ).toEqual([]);
    },
  );
});

describe("never raw: ~~~ is a real fence (A4)", () => {
  const PRETTY = JSON.stringify(JSON.parse(KIND_PAYLOAD_ONE_LINE), null, 2);
  it.each([
    ["~~~json one-line", `Here you go:\n\n~~~json\n${KIND_PAYLOAD_ONE_LINE}\n~~~\n\nAfter.`],
    ["~~~json pretty", `Here you go:\n\n~~~json\n${PRETTY}\n~~~\n\nAfter.`],
    ["~~~~JSON long run", `Here you go:\n\n~~~~JSON\n${PRETTY}\n~~~~\n\nAfter.`],
  ])("%s: no raw frame, the fence opens a json region, no stray ~~~ chrome", (_label, stream) => {
    const frames = jsonFrames(streamCharByChar(stream, `req-tilde-${_label}`));
    expect(frames.filter(rendersRawJson).map((b) => (b.content ?? "").slice(0, 40))).toEqual([]);

    const blocks = finalBlocks(stream, `req-tilde-final-${_label}`);
    expect(blocks.filter((b) => (b.content ?? "").includes("~~~"))).toEqual([]);
    const kindBlock = blocks.find((b) => (b.content ?? "").includes('"__kind"'));
    expect(kindBlock?.data).toEqual(expect.objectContaining({ language: expect.stringMatching(/^json$/i) }));
    expect(blocks.map((b) => (b.content ?? "").trim())).toEqual(["Here you go:", kindBlock?.content, "After."]);

    // Reload (the static splitter) opens the same fence — same blocks.
    const reloaded = splitContentIntoBlocksV2(stream).filter((b) => b.content.trim());
    expect(reloaded.map((b) => b.content.trim())).toEqual(["Here you go:", kindBlock?.content, "After."]);
    expect(reloaded[1]?.language?.toLowerCase()).toBe("json");
  });
});
