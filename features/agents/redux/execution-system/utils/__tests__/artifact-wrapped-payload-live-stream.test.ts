/**
 * THE WRAPPED-PAYLOAD CLASS — an `<artifact>` whose body is a `__kind` payload
 * must carry `metadata.__ir`, live and at completion.
 *
 * The bytes below are the real wire shape captured from a production
 * `/education/flashcards/new` run on 2026-08-18: the flashcard generator is a
 * structured-output agent (`__kind` first in its bound `output_schema`), and
 * the artifact system wraps its answer in `<artifact type="flashcards" …>`.
 *
 * Before this was fixed the accumulator opened ir regions for fences and for
 * bare JSON only — an attribute-XML region swallowed every body line whole. No
 * region meant no envelope, so `selectKindEnvelope` answered null for the whole
 * run AND after it, and the card-by-card live preview never rendered while a
 * perfectly good stream arrived behind a spinner. Same root cause as D170's
 * `<image_prompt>` half.
 *
 * The two things this pins:
 *  1. the envelope exists MID-STREAM (the live preview's whole reason to be),
 *     not only on the final block;
 *  2. the block stays `type: "artifact"` — the artifact system keeps its own
 *     renderer and its door to the Canvas (see kind-route.ts).
 */
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

const OPENING =
  '<artifact type="flashcards" id="b8137b6e-8afa-4b30-bba9-07c6f373a126" version="1" title="Mitochondria Structure and Function">\n';

/** Minified single-line body — no `\n` until the payload is complete. */
const BODY_PARTS: string[] = [
  '{"__kind":"flashcard_set","cards":[{"__kind":"flashcard",',
  '"front":"What is the primary physiological function of mitochondria?",',
  '"back":"To generate adenosine triphosphate (ATP) through cellular respiration.",',
  '"card_kind":"basic","difficulty":"medium"},{"__kind":"flashcard",',
  '"front":"Cristae","back":"The internal foldings of the inner mitochondrial membrane.",',
  '"card_kind":"definition","difficulty":"medium"}],',
  '"title":"Mitochondria Structure and Function"}',
];

const CLOSING = "\n</artifact>";

type IrEnvelope = {
  root: { kind: string; status: string; value: Record<string, unknown> };
};

function irOf(block: RenderBlockPayload | undefined): IrEnvelope | undefined {
  return (block?.metadata as Record<string, unknown> | undefined)?.__ir as
    | IrEnvelope
    | undefined;
}

interface StreamRun {
  /** Final state of every block the stream dispatched. */
  finalBlocks: RenderBlockPayload[];
  /** Envelopes seen on dispatches made BEFORE the stream finalized. */
  midStreamEnvelopes: IrEnvelope[];
}

function runStream(): StreamRun {
  const blocks = new Map<string, RenderBlockPayload>();
  const midStreamEnvelopes: IrEnvelope[] = [];
  let finalized = false;

  const upsert = (payload: {
    requestId: string;
    block: RenderBlockPayload;
  }) => ({ type: "test/upsert", payload });

  const dispatch = (action: unknown) => {
    const a = action as {
      type: string;
      payload?: { block: RenderBlockPayload };
    };
    const block = a?.payload?.block;
    if (block) {
      blocks.set(block.blockId, block);
      if (!finalized) {
        const ir = irOf(block);
        if (ir) midStreamEnvelopes.push(ir);
      }
    }
    return action;
  };

  const acc = new StreamBlockAccumulator("req-artifact", upsert as never);
  acc.ingest(OPENING, dispatch);
  for (const part of BODY_PARTS) acc.ingest(part, dispatch);
  acc.ingest(CLOSING, dispatch);
  finalized = true;
  acc.finalize(dispatch);

  return { finalBlocks: [...blocks.values()], midStreamEnvelopes };
}

describe("artifact-wrapped __kind payload → metadata.__ir", () => {
  it("attaches a complete flashcard_set envelope to the artifact block", () => {
    const { finalBlocks } = runStream();
    const withIr = finalBlocks.filter((b) => irOf(b));
    expect(withIr.length).toBeGreaterThan(0);

    const ir = irOf(withIr[0]);
    expect(ir?.root.kind).toBe("flashcard_set");
    expect(ir?.root.status).toBe("complete");

    const cards = ir?.root.value.cards as Array<Record<string, unknown>>;
    expect(Array.isArray(cards)).toBe(true);
    expect(cards).toHaveLength(2);
    expect(cards[0].front).toContain("primary physiological function");
    expect(ir?.root.value.title).toBe("Mitochondria Structure and Function");
  });

  it("resolves the kind MID-STREAM, not only at completion", () => {
    const { midStreamEnvelopes } = runStream();
    const identified = midStreamEnvelopes.filter(
      (e) => e.root.kind === "flashcard_set",
    );
    expect(identified.length).toBeGreaterThan(0);

    // At least one mid-stream envelope must already carry a card — that is
    // literally what the card-by-card preview renders.
    const withCards = identified.filter((e) => {
      const cards = e.root.value?.cards;
      return Array.isArray(cards) && cards.length > 0;
    });
    expect(withCards.length).toBeGreaterThan(0);
  });

  it("leaves the block as an artifact so the artifact renderer keeps it", () => {
    const { finalBlocks } = runStream();
    const artifactBlock = finalBlocks.find((b) => irOf(b));
    expect(artifactBlock?.type).toBe("artifact");
    // The artifact system's own metadata must survive beside the envelope.
    const meta = artifactBlock?.metadata as Record<string, unknown>;
    expect(meta.artifactId).toBe("b8137b6e-8afa-4b30-bba9-07c6f373a126");
    expect(meta.artifactType).toBe("flashcards");
  });
});
