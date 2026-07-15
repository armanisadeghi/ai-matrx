import {
  createKindStreamParser,
  type KindStreamEvent,
} from "../core/kind-parser";
import { irPathKey } from "../core/ir-types";
import { chunkText } from "./seeded-random";
import {
  FLASHCARD_SCHEMAS,
  FLASHCARD_SET_JSON,
  FLASHCARD_SET_MULTI_KIND_JSON,
  FLASHCARD_SET_WITH_EXTRAS_JSON,
  MISSING_KIND_JSON,
  UNKNOWN_KIND_JSON,
} from "./fixtures/flashcards-fixture";

function parseAll(input: string, seed?: number): KindStreamEvent[] {
  const events: KindStreamEvent[] = [];
  const parser = createKindStreamParser({
    schemas: FLASHCARD_SCHEMAS,
    onEvent: (e) => events.push(e),
  });
  if (seed === undefined) {
    parser.push(input);
  } else {
    for (const chunk of chunkText(input, seed)) parser.push(chunk);
  }
  parser.end();
  return events;
}

/** Strip the position field — chunking must not change anything else. */
function withoutAt(events: KindStreamEvent[]): unknown[] {
  return events.map(({ at: _at, ...rest }) => rest);
}

describe("KindStreamParser goldens (flashcard fixture)", () => {
  it("identifies kinds at root and inside arrays", () => {
    const events = parseAll(FLASHCARD_SET_JSON);
    const kinds = events
      .filter((e) => e.type === "kind_identified")
      .map((e) => ({ kind: e.kind, path: irPathKey(e.path) }));

    expect(kinds).toEqual([
      { kind: "flashcard_set", path: "" },
      { kind: "flashcard", path: "cards.0" },
      { kind: "flashcard", path: "cards.1" },
    ]);
  });

  it("emits a complete=true block_snapshot when a typed object closes", () => {
    const events = parseAll(FLASHCARD_SET_JSON);
    const completeSnapshots = events.filter(
      (e) => e.type === "block_snapshot" && e.complete,
    );

    const paths = completeSnapshots.map((e) =>
      e.type === "block_snapshot" ? irPathKey(e.path) : "",
    );
    expect(paths).toContain("cards.0");
    expect(paths).toContain("cards.1");
  });

  it("streams card snapshots field-by-field before the card closes", () => {
    const events = parseAll(FLASHCARD_SET_JSON);
    const card0Snapshots = events.filter(
      (e) =>
        e.type === "block_snapshot" &&
        irPathKey(e.path) === "cards.0" &&
        !e.complete,
    );
    // front arrives, then back, then topic → at least one partial before close.
    expect(card0Snapshots.length).toBeGreaterThanOrEqual(1);
    const first = card0Snapshots[0];
    expect(first).toBeDefined();
    if (!first || first.type !== "block_snapshot") throw new Error("unreachable");
    expect(first.value.__kind).toBe("flashcard");
    expect(typeof first.value.front).toBe("string");
  });

  it("puts unknown keys on snapshot residue, not the value", () => {
    const events = parseAll(FLASHCARD_SET_WITH_EXTRAS_JSON);
    const rootSnapshots = events.filter(
      (e) => e.type === "block_snapshot" && irPathKey(e.path) === "",
    );
    const last = rootSnapshots[rootSnapshots.length - 1];
    expect(last).toBeDefined();
    if (!last || last.type !== "block_snapshot") throw new Error("unreachable");

    expect(last.value.audio_url).toBeUndefined();
    expect(last.residue?.extra?.audio_url).toBe("https://example.com/set.mp3");

    const cardSnapshots = events.filter(
      (e) => e.type === "block_snapshot" && irPathKey(e.path) === "cards.0",
    );
    const lastCard = cardSnapshots[cardSnapshots.length - 1];
    expect(lastCard).toBeDefined();
    if (!lastCard || lastCard.type !== "block_snapshot") throw new Error("unreachable");
    expect(lastCard.residue?.extra).toEqual({
      image_ref: "img-123",
      sources: ["textbook-ch4"],
    });
  });

  it("falls back to raw_object for an unregistered kind", () => {
    const events = parseAll(UNKNOWN_KIND_JSON);
    const raw = events.find((e) => e.type === "raw_object");
    expect(raw).toBeDefined();
    if (raw?.type !== "raw_object") throw new Error("unreachable");
    expect(raw.reason).toContain("quantum_widget");

    // Stream still completes — raw fallback is not an error.
    expect(events.some((e) => e.type === "complete")).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  it("falls back to raw_object when __kind is missing", () => {
    const events = parseAll(MISSING_KIND_JSON);
    const raw = events.find((e) => e.type === "raw_object");
    expect(raw).toBeDefined();
    if (raw?.type !== "raw_object") throw new Error("unreachable");
    expect(raw.reason).toContain("__kind");
  });

  it("rejects a kind not allowed by the parent's itemKinds whitelist", () => {
    const schemas = {
      ...FLASHCARD_SCHEMAS,
      intruder: { kind: "intruder", fields: {} },
    };
    const input = JSON.stringify({
      __kind: "flashcard_set",
      title: "T",
      cards: [{ __kind: "intruder" }],
    });

    const events: KindStreamEvent[] = [];
    const parser = createKindStreamParser({
      schemas,
      onEvent: (e) => events.push(e),
    });
    parser.push(input);
    parser.end();

    // Multi-member itemKinds means no speculation at `{` open; the intruder
    // __kind identifies the node, then the itemKinds whitelist rejects it at
    // close — the node goes raw, parent unharmed.
    const raw = events.find((e) => e.type === "raw_object");
    expect(raw).toBeDefined();
    if (raw?.type !== "raw_object") throw new Error("unreachable");
    expect(irPathKey(raw.path)).toBe("cards.0");
    expect(raw.reason).toContain("not allowed");
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  it("multi-kind cards resolve via pending_kind → __kind; single-member subcards still speculate", () => {
    const events = parseAll(FLASHCARD_SET_MULTI_KIND_JSON);

    // Multi-member itemKinds → no speculation at card open.
    expect(
      events.some(
        (e) => e.type === "pending_kind" && irPathKey(e.path) === "cards.0",
      ),
    ).toBe(true);

    const cardKinds = events
      .filter(
        (e) => e.type === "kind_identified" && irPathKey(e.path).startsWith("cards."),
      )
      .map((e) =>
        e.type === "kind_identified"
          ? { kind: e.kind, path: irPathKey(e.path), speculative: e.speculative }
          : null,
      );
    expect(cardKinds).toEqual([
      { kind: "flashcard", path: "cards.0", speculative: undefined },
      { kind: "enhanced_flashcard", path: "cards.1", speculative: undefined },
      // tiered_flashcard's subcards declare a SINGLE itemKind — speculation
      // still commits basic_card the instant its `{` opens.
      { kind: "tiered_flashcard", path: "cards.2", speculative: undefined },
      { kind: "basic_card", path: "cards.2.subcards.0", speculative: true },
    ]);

    // Every card completes typed; nothing degrades to raw.
    expect(events.some((e) => e.type === "raw_object")).toBe(false);
    for (const path of ["cards.0", "cards.1", "cards.2", "cards.2.subcards.0"]) {
      expect(
        events.some(
          (e) => e.type === "object_complete" && irPathKey(e.path) === path,
        ),
      ).toBe(true);
    }
    expect(events.some((e) => e.type === "complete")).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  it("chunking never changes the event sequence (10 seeds)", () => {
    const whole = withoutAt(parseAll(FLASHCARD_SET_WITH_EXTRAS_JSON));
    for (let seed = 1; seed <= 10; seed++) {
      expect(withoutAt(parseAll(FLASHCARD_SET_WITH_EXTRAS_JSON, seed))).toEqual(
        whole,
      );
    }
  });

  it("errors when the stream ends mid-object (truncation)", () => {
    const events: KindStreamEvent[] = [];
    const parser = createKindStreamParser({
      schemas: FLASHCARD_SCHEMAS,
      onEvent: (e) => events.push(e),
    });
    parser.push('{"__kind":"flashcard_set","title":"T","cards":[{"__kind":"flashcard","front":"Q');
    parser.end();

    expect(events.some((e) => e.type === "error")).toBe(true);
    // Partial snapshots were still emitted before the failure.
    expect(events.some((e) => e.type === "block_snapshot")).toBe(true);
  });
});

describe("KindStreamParser — json-any opaque descent (2026-07-15 expressivity)", () => {
  const HTTPISH_SCHEMAS = {
    httpish: {
      kind: "httpish",
      fields: {
        status: { type: "number" as const, required: true },
        body: { type: "json" as const },
        matches: { type: "json[]" as const },
        outputs: { type: "record" as const, values: "json" as const },
      },
    },
  };

  const HTTPISH_JSON = JSON.stringify({
    __kind: "httpish",
    status: 200,
    body: { unknown: { nested: [1, null, "x"] }, __kind: "not-a-kind" },
    matches: ["m1", { group: "m2" }, ["p1"]],
    outputs: { node_a: { deep: [true] }, node_b: null },
  });

  function parseHttpish(seed?: number): KindStreamEvent[] {
    const events: KindStreamEvent[] = [];
    const parser = createKindStreamParser({
      schemas: HTTPISH_SCHEMAS,
      onEvent: (e) => events.push(e),
    });
    if (seed === undefined) {
      parser.push(HTTPISH_JSON);
    } else {
      for (const chunk of chunkText(HTTPISH_JSON, seed)) parser.push(chunk);
    }
    parser.end();
    return events;
  }

  it("completes the typed object with zero raw_object / pending_kind noise in json-any subtrees", () => {
    const events = parseHttpish();

    expect(events.filter((e) => e.type === "raw_object")).toEqual([]);
    // Root-level pending_kind (no expectedRootKind) is normal; the json-any
    // SUBTREES must never go pending.
    expect(
      events.filter((e) => e.type === "pending_kind" && e.path.length > 0),
    ).toEqual([]);
    // The __kind string INSIDE the opaque body is data, not a discriminator.
    const identified = events.filter((e) => e.type === "kind_identified");
    expect(identified).toHaveLength(1);
    expect(identified[0]).toMatchObject({ kind: "httpish" });

    const complete = events.find((e) => e.type === "complete");
    expect(complete).toMatchObject({ kind: "httpish" });
    expect(
      complete && complete.type === "complete"
        ? (complete.value as Record<string, unknown>).body
        : null,
    ).toEqual({ unknown: { nested: [1, null, "x"] }, __kind: "not-a-kind" });
  });

  it("is chunking-invariant across seeds", () => {
    const oneShot = withoutAt(parseHttpish());
    for (const seed of [1, 7, 42]) {
      expect(withoutAt(parseHttpish(seed))).toEqual(oneShot);
    }
  });

  it("surfaces json-any subtree roots as ordinary field events on the typed parent", () => {
    const events = parseHttpish();
    const fieldKeys = events
      .filter((e) => e.type === "field")
      .map((e) => (e.type === "field" ? e.key : ""));
    expect(fieldKeys).toEqual(
      expect.arrayContaining(["status", "body", "matches", "outputs"]),
    );
  });

  it("refuses a __kind object claiming a ROOT-FORM kind (data-only shapes are not stream-typable)", () => {
    const events: KindStreamEvent[] = [];
    const parser = createKindStreamParser({
      schemas: {
        text: { kind: "text", fields: {}, root: { type: "string" as const } },
      },
      onEvent: (e) => events.push(e),
    });
    parser.push(JSON.stringify({ __kind: "text", anything: 1 }));
    parser.end();

    const raw = events.find((e) => e.type === "raw_object");
    expect(raw).toMatchObject({
      reason: expect.stringContaining("non-object root form"),
    });
  });
});
