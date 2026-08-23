/**
 * `__kind` FIRST — the bound-agent stream, on the frontend's own accumulator.
 *
 * An agent bound to a kind through provider structured output
 * (`ai.agent.produce` → `response_format_for_kind`) streams a BARE JSON
 * document: no fence, no XML tag. Nothing about it is recognisable early
 * except its own `__kind`, and only if `__kind` arrives FIRST.
 *
 * Its sibling `bare-json-pending-kind.test.ts` pins the WORST case (`__kind`
 * last): a long window in which the region has an envelope but no kind, which
 * is what `PendingStructuredBlock` covers — and which Arman saw as "a generic
 * loading component that was not for the specific individual kinds, then
 * actual JSON data coming in" on a live Study Pack run (2026-08-21).
 *
 * This is the BEST case, which is the one the platform now produces:
 * `discriminator_first` puts `__kind` first on the wire and the agent's own
 * instructions carry an example that leads with it. The window must collapse
 * to nothing — the kind is known on the first upsert, so the region shows that
 * KIND's loading state immediately and then fills item by item.
 *
 * Contract: common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md §6.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { IR_ENVELOPE_KEY, isCanonicalBlockIR, type CanonicalBlockIR } from "@ai-matrx/content-ir";
import { chunkText } from "./seeded-random";

type Upsert = { requestId: string; block: RenderBlockPayload };

function makeAccumulator(requestId: string) {
  const upserts: Upsert[] = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as Upsert);
    return { type: "test/upsert", payload };
  });
  return { accumulator, upserts, dispatch: (action: unknown) => action };
}

function envelopeOf(block: RenderBlockPayload): CanonicalBlockIR | null {
  const candidate = block.metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

/** Mirrors BlockRenderer's pending window: an envelope with no kind yet. */
function isKindlessWindow(block: RenderBlockPayload): boolean {
  const envelope = envelopeOf(block);
  return !!envelope && !envelope.root.kind && envelope.root.status === "streaming";
}

const FLASHCARDS_KIND_FIRST = JSON.stringify(
  {
    __kind: "flashcard_set",
    title: "Photosynthesis — The Light Reactions",
    cards: [
      { front: "Which molecule splits to supply electrons?", back: "Water." },
      { front: "Where do the light reactions run?", back: "The thylakoid membrane." },
      { front: "What carries reducing power to the Calvin cycle?", back: "NADPH." },
    ],
  },
  null,
  2,
);

const QUIZ_KIND_FIRST = JSON.stringify(
  {
    __kind: "quiz_set",
    title: "Photosynthesis — Check Your Understanding",
    description: "Answer every question.",
    questions: [
      {
        type: "multiple_choice",
        question: "Where do the light reactions take place?",
        options: ["Thylakoid membrane", "Stroma"],
        correct_answer: "Thylakoid membrane",
        explanation: "The photosystems sit in the thylakoid membrane.",
      },
      {
        type: "free_response",
        question: "Explain why leaves look green.",
        options: [],
        correct_answer: "Chlorophyll reflects green light.",
        explanation: "Absorbed wavelengths are red and blue; green is reflected.",
      },
    ],
  },
  null,
  2,
);

function driveBare(document: string, requestId: string) {
  const { accumulator, upserts, dispatch } = makeAccumulator(requestId);
  // Bare and ALONE on the wire — exactly what a bound agent emits: no prose
  // preamble, no fence, nothing to recognise it by but the document itself.
  for (const chunk of chunkText(document, 11, 5)) accumulator.ingest(chunk, dispatch);
  accumulator.finalize(dispatch);
  return upserts;
}

describe("a bound agent's bare JSON, with __kind first", () => {
  it.each([
    ["flashcard_set", FLASHCARDS_KIND_FIRST, "cards"],
    ["quiz_set", QUIZ_KIND_FIRST, "questions"],
  ])("identifies %s immediately and fills item by item", (kind, document, itemsKey) => {
    const upserts = driveBare(document, `req-${kind}`);
    const enveloped = upserts.filter((u) => envelopeOf(u.block));
    expect(enveloped.length).toBeGreaterThan(0);

    // THE POINT: the kindless window — the one Arman saw as "a generic loading
    // component that was not for the specific individual kinds" — closes
    // before ANY of the answer's own content has arrived. It cannot be zero
    // frames: the kind is not knowable until its own name finishes arriving.
    // It CAN be bounded to exactly that, which is the real guarantee — the
    // reader never sees a generic loader over readable content, and never sees
    // raw JSON at all.
    const kindless = enveloped.filter((u) => isKindlessWindow(u.block));
    for (const u of kindless) {
      const text = (u.block.content ?? "") as string;
      expect(text.length).toBeLessThanOrEqual(`{\n  "__kind": "${kind}"`.length);
      expect(text.replace(/\s/g, "")).toMatch(/^\{("(_?_?k?i?n?d?)?(":)?)?"?[a-z_]*$/);
    }
    // From the frame the kind lands onward, every frame carries it.
    const firstKinded = enveloped.findIndex((u) => !isKindlessWindow(u.block));
    expect(firstKinded).toBeGreaterThanOrEqual(0);
    expect(
      enveloped.slice(firstKinded).every((u) => envelopeOf(u.block)!.root.kind === kind),
    ).toBe(true);

    // And it GROWS: the item list only ever gains entries (law 6 — a partial
    // may be incomplete, never wrong; an item must never vanish).
    const counts = enveloped.map((u) => {
      const value = envelopeOf(u.block)!.root.value as Record<string, unknown>;
      return Array.isArray(value?.[itemsKey]) ? (value[itemsKey] as unknown[]).length : 0;
    });
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts.at(-1)).toBe(kind === "flashcard_set" ? 3 : 2);
    // Item-by-item, not all-at-once: intermediate counts must actually occur.
    expect(new Set(counts).size).toBeGreaterThan(2);

    const final = [...enveloped].reverse().find((u) => u.block.status === "complete");
    expect(envelopeOf(final!.block)!.root.status).toBe("complete");
    expect(envelopeOf(final!.block)!.root.kind).toBe(kind);
  });
});
