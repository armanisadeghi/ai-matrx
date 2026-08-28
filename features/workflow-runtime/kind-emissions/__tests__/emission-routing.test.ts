/**
 * THE EMISSION CONTRACT, pinned (SPEC-workflow-ui-contract §3).
 *
 * The fixtures are not invented: every emission shape here was read off the
 * wire from run `c437f8e5-6dcf-42d4-8c2b-d079b8295c7e` of the
 * `Kind Emissions Bakeoff (no LLM)` fixture, and the deliverable shapes off
 * `GET /workflows/3ffe233a-8ad6-43be-b1ee-42c232713bd4/result-schema`. A
 * contract test written against a shape nobody has ever served is a test of
 * the author's imagination.
 */

import {
  deliverableClaims,
  emissionsByDeliverable,
  isShowcase,
  routeEmission,
  splitByPresentation,
  suppressClaimedEmissions,
  type ClaimingDeliverable,
  type RoutableEmission,
} from "../emission-routing";

function emission(over: Partial<RoutableEmission> = {}): RoutableEmission {
  return {
    nodeId: "emit_quiz",
    kind: "quiz_set",
    kindOk: true,
    presentation: "panel",
    seq: 9,
    ...over,
  };
}

// ─── Rules 1 + 2 — the router ───────────────────────────────────────────────

describe("routeEmission — a kind-carrying emission goes to the kind component", () => {
  it("routes a verified kind to KindInstanceRender (wire: emit_quiz)", () => {
    expect(routeEmission({ kind: "quiz_set", kindOk: true })).toEqual({
      via: "kind",
      kind: "quiz_set",
    });
  });

  it("routes an UNCHECKED kind to the kind component — null is not false", () => {
    // `kind_ok: null` means the verdict was degraded, not that the payload
    // failed. SPEC §3.1 says `kind_ok is not False`, and that distinction is
    // the whole difference between a showcase and a JSON dump.
    expect(routeEmission({ kind: "presentation_deck", kindOk: null })).toEqual({
      via: "kind",
      kind: "presentation_deck",
    });
  });

  it("falls back when the payload SAID a kind and the registry disagreed", () => {
    expect(routeEmission({ kind: "quiz_set", kindOk: false })).toEqual({
      via: "component",
      reason: "kind_failed_check",
    });
  });

  it("falls back for a kindless emission (wire: emit_note)", () => {
    expect(routeEmission({ kind: null, kindOk: null })).toEqual({
      via: "component",
      reason: "kindless",
    });
  });

  it("treats an empty/whitespace kind as kindless, never as a slug", () => {
    expect(routeEmission({ kind: "   ", kindOk: true }).via).toBe("component");
  });
});

// ─── Rule 3 — showcase vs. panel ────────────────────────────────────────────

describe("splitByPresentation — one live showcase, newer replaces", () => {
  const quiz = emission({ nodeId: "emit_quiz", seq: 9 });
  const note = emission({
    nodeId: "emit_note",
    kind: null,
    kindOk: null,
    seq: 13,
  });
  const deck1 = emission({
    nodeId: "emit_deck1",
    kind: "presentation_deck",
    presentation: "showcase",
    seq: 17,
  });
  const deck2 = emission({
    nodeId: "emit_deck2",
    kind: "presentation_deck",
    presentation: "showcase",
    seq: 21,
  });

  it("keeps only the NEWEST showcase, and never in the stream", () => {
    const split = splitByPresentation([quiz, note, deck1, deck2]);
    expect(split.showcase).toBe(deck2);
    expect(split.panel).toEqual([quiz, note]);
    // The replaced showcase does not fall back into the stream.
    expect(split.panel).not.toContain(deck1);
  });

  it("stages the first showcase while it is the only one", () => {
    expect(splitByPresentation([quiz, deck1]).showcase).toBe(deck1);
  });

  it("has no showcase when nothing asked for one", () => {
    const split = splitByPresentation([quiz, note]);
    expect(split.showcase).toBeNull();
    expect(split.panel).toHaveLength(2);
  });

  it("prefers the higher durable seq when a replay lands out of order", () => {
    const split = splitByPresentation([deck2, deck1]);
    expect(split.showcase).toBe(deck2);
  });

  it("preserves panel arrival order exactly — newest last", () => {
    const split = splitByPresentation([note, quiz, deck1]);
    expect(split.panel.map((e) => e.nodeId)).toEqual(["emit_note", "emit_quiz"]);
  });

  it("isShowcase reads the one wire value and nothing else", () => {
    expect(isShowcase({ presentation: "showcase" })).toBe(true);
    expect(isShowcase({ presentation: "panel" })).toBe(false);
    expect(isShowcase({ presentation: null })).toBe(false);
    expect(isShowcase({ presentation: undefined })).toBe(false);
  });
});

// ─── The dedupe ─────────────────────────────────────────────────────────────

describe("the emit/deliverable dedupe — renders ONCE", () => {
  // Exactly what /result-schema serves for the fixture: every
  // `output.to_frontend` deliverable carries `output_kind: null`, because the
  // node declares a dynamic output schema.
  const served: ClaimingDeliverable[] = [
    { nodeId: "emit_quiz", outputKind: null },
    { nodeId: "emit_note", outputKind: null },
  ];

  const quiz = emission({ nodeId: "emit_quiz", kind: "quiz_set", seq: 9 });
  const note = emission({
    nodeId: "emit_note",
    kind: null,
    kindOk: null,
    seq: 13,
  });
  const stray = emission({ nodeId: "somewhere_else", kind: "quiz_set", seq: 30 });

  it("a null-kind deliverable claims any emission from its own node", () => {
    // THE WIDENING. A strict `(node_id, kind)` comparison fires on NOTHING
    // here — the served kind is null while the emission's is `quiz_set` — so
    // every emitting deliverable would render twice, the exact outcome §3
    // forbids.
    expect(deliverableClaims(served[0], quiz)).toBe(true);
    expect(deliverableClaims(served[1], note)).toBe(true);
  });

  it("never claims across node ids", () => {
    expect(deliverableClaims(served[0], stray)).toBe(false);
    expect(deliverableClaims(served[0], note)).toBe(false);
  });

  it("a KIND-declaring deliverable uses the strict two-part key", () => {
    const declared: ClaimingDeliverable = {
      nodeId: "emit_quiz",
      outputKind: "quiz_set",
    };
    expect(deliverableClaims(declared, quiz)).toBe(true);
    expect(
      deliverableClaims(declared, emission({ kind: "presentation_deck" })),
    ).toBe(false);
  });

  it("suppresses claimed emissions from the stream, order preserved", () => {
    expect(suppressClaimedEmissions([quiz, note, stray], served)).toEqual([
      stray,
    ]);
  });

  it("leaves the stream untouched when nothing is declared", () => {
    expect(suppressClaimedEmissions([quiz, note], [])).toEqual([quiz, note]);
  });

  it("settles each slot from its claimed emission — the deliverable wins", () => {
    const claimed = emissionsByDeliverable([quiz, note, stray], served);
    expect(claimed).toEqual({ emit_quiz: quiz, emit_note: note });
  });

  it("a node that emits twice settles its ONE slot from the latest", () => {
    const first = emission({ nodeId: "emit_quiz", seq: 9 });
    const second = emission({ nodeId: "emit_quiz", seq: 40 });
    const claimed = emissionsByDeliverable([first, second], served);
    expect(claimed.emit_quiz).toBe(second);
    expect(Object.keys(claimed)).toEqual(["emit_quiz"]);
  });

  it("renders once, end to end: nothing appears in both halves", () => {
    const all = [quiz, note, stray];
    const claimed = emissionsByDeliverable(all, served);
    const streamed = suppressClaimedEmissions(all, served);
    const inSlots = new Set(Object.values(claimed));
    for (const e of streamed) expect(inSlots.has(e)).toBe(false);
    // …and nothing is LOST either: every emission is in exactly one half.
    expect(inSlots.size + streamed.length).toBe(all.length);
  });
});
