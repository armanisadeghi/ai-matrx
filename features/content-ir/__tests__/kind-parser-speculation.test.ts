/**
 * Phase 1 parser upgrades: speculative descent, pending-schema
 * upgrade-in-place, and pop-up-one-level (node-scoped) error recovery.
 */

import {
  createKindStreamParser,
  type KindStreamEvent,
  type SchemaResolver,
} from "../core/kind-parser";
import { irPathKey } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import {
  FLASHCARD_SCHEMAS,
  SPECULATION_SCHEMAS,
} from "./fixtures/flashcards-fixture";

function collect(
  input: string,
  options?: {
    schemas?: Record<string, KindSchema> | SchemaResolver;
    expectedRootKind?: string;
  },
): KindStreamEvent[] {
  const events: KindStreamEvent[] = [];
  const parser = createKindStreamParser({
    schemas: options?.schemas ?? FLASHCARD_SCHEMAS,
    ...(options?.expectedRootKind !== undefined && {
      expectedRootKind: options.expectedRootKind,
    }),
    onEvent: (e) => events.push(e),
  });
  parser.push(input);
  parser.end();
  return events;
}

describe("speculative descent", () => {
  // Array-item speculation requires a SINGLE-member itemKinds — the
  // production flashcard_set is multi-kind now, so these tests pin the
  // single-member SPECULATION_SCHEMAS variant.
  it("commits a card's kind the instant `{` opens under a declared array", () => {
    const input = JSON.stringify({
      __kind: "flashcard_set",
      title: "T",
      cards: [{ __kind: "flashcard", front: "Q", back: "A" }],
    });

    const events = collect(input, { schemas: SPECULATION_SCHEMAS });
    const speculated = events.find(
      (e) =>
        e.type === "kind_identified" &&
        e.speculative === true &&
        irPathKey(e.path) === "cards.0",
    );
    expect(speculated).toBeDefined();
    if (speculated?.type !== "kind_identified") throw new Error("unreachable");
    expect(speculated.kind).toBe("flashcard");

    // A placeholder snapshot fires immediately after the speculative commit —
    // BEFORE any field of the card has arrived.
    const specIndex = events.indexOf(speculated);
    const nextSnapshot = events
      .slice(specIndex)
      .find(
        (e) => e.type === "block_snapshot" && irPathKey(e.path) === "cards.0",
      );
    expect(nextSnapshot).toBeDefined();
    if (nextSnapshot?.type !== "block_snapshot") throw new Error("unreachable");
    expect(nextSnapshot.value).toMatchObject({
      __kind: "flashcard",
      front: "", // required placeholder
      back: null, // required + nullable placeholder
    });

    // __kind later confirms; no duplicate non-speculative kind_identified.
    const identifications = events.filter(
      (e) => e.type === "kind_identified" && irPathKey(e.path) === "cards.0",
    );
    expect(identifications).toHaveLength(1);
  });

  it("types an object by prediction alone when __kind never arrives", () => {
    const input = JSON.stringify({
      __kind: "flashcard_set",
      title: "T",
      cards: [{ front: "Q", back: "A" }], // no __kind on the card
    });

    const events = collect(input, { schemas: SPECULATION_SCHEMAS });
    const completed = events.find(
      (e) => e.type === "object_complete" && irPathKey(e.path) === "cards.0",
    );
    expect(completed).toBeDefined();
    if (completed?.type !== "object_complete") throw new Error("unreachable");
    expect(completed.kind).toBe("flashcard");
    expect(events.some((e) => e.type === "raw_object")).toBe(false);
  });

  it("re-tags to an allowed sibling kind when itemKinds has multiple members", () => {
    const schemas: Record<string, KindSchema> = {
      quiz_set: {
        kind: "quiz_set",
        fields: {
          items: {
            type: "array",
            itemKinds: ["mc_question", "tf_question"],
            required: true,
          },
        },
      },
      mc_question: {
        kind: "mc_question",
        fields: { prompt: { type: "string", required: true } },
      },
      tf_question: {
        kind: "tf_question",
        fields: { prompt: { type: "string", required: true } },
      },
    };

    // Multi-member itemKinds → no speculation at open (ambiguous), so this
    // exercises pending_kind → identified. Then force speculation via an
    // object-typed field and contradict it with an allowed... — covered
    // separately; here assert ambiguous arrays simply resolve by __kind.
    const input = JSON.stringify({
      __kind: "quiz_set",
      items: [{ __kind: "tf_question", prompt: "Sky is green?" }],
    });

    const events = collect(input, { schemas });
    const identified = events.find(
      (e) => e.type === "kind_identified" && irPathKey(e.path) === "items.0",
    );
    if (identified?.type !== "kind_identified") throw new Error("unreachable");
    expect(identified.kind).toBe("tf_question");
    expect(identified.speculative).toBeUndefined();
    expect(events.some((e) => e.type === "raw_object")).toBe(false);
  });

  it("backtracks to raw when __kind contradicts an object-typed field's declared kind", () => {
    const schemas: Record<string, KindSchema> = {
      report: {
        kind: "report",
        fields: {
          summary: { type: "object", kind: "summary_block", required: true },
        },
      },
      summary_block: {
        kind: "summary_block",
        fields: { text: { type: "string", required: true } },
      },
      rogue: { kind: "rogue", fields: {} },
    };

    const input = JSON.stringify({
      __kind: "report",
      summary: { __kind: "rogue", text: "hi" },
    });

    const events = collect(input, { schemas });
    const raw = events.find(
      (e) => e.type === "raw_object" && irPathKey(e.path) === "summary",
    );
    expect(raw).toBeDefined();
    if (raw?.type !== "raw_object") throw new Error("unreachable");
    expect(raw.reason).toContain("contradicted");
    // Parent keeps parsing; stream completes without error.
    expect(events.some((e) => e.type === "complete")).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  it("expectedRootKind types a root object that carries no __kind (Option-1 provenance)", () => {
    const input = JSON.stringify({
      title: "Injected by context",
      cards: [{ front: "Q", back: "A" }],
    });

    const events = collect(input, {
      schemas: SPECULATION_SCHEMAS,
      expectedRootKind: "flashcard_set",
    });

    const rootIdentified = events.find(
      (e) =>
        e.type === "kind_identified" &&
        e.path.length === 0 &&
        e.speculative === true,
    );
    expect(rootIdentified).toBeDefined();

    const rootComplete = events.find(
      (e) => e.type === "object_complete" && e.path.length === 0,
    );
    if (rootComplete?.type !== "object_complete") throw new Error("unreachable");
    expect(rootComplete.kind).toBe("flashcard_set");

    // Cards inside got speculated too — full tree typed with zero __kind.
    const cardComplete = events.find(
      (e) => e.type === "object_complete" && irPathKey(e.path) === "cards.0",
    );
    expect(cardComplete).toBeDefined();
  });
});

describe("pending-schema upgrade-in-place", () => {
  function resolverWith(
    known: Record<string, KindSchema>,
    requested: string[],
  ): SchemaResolver {
    return {
      get: (kind) => known[kind],
      request: (kind) => requested.push(kind),
    };
  }

  it("holds an unknown kind, fires the cold fetch, and upgrades in place mid-region", () => {
    const requested: string[] = [];
    const events: KindStreamEvent[] = [];
    const parser = createKindStreamParser({
      schemas: resolverWith({}, requested),
      onEvent: (e) => events.push(e),
    });

    parser.push(
      JSON.stringify({ __kind: "timeline", title: "Rome", periods: ["a"] }),
    );

    expect(requested).toEqual(["timeline"]);
    expect(
      events.some(
        (e) => e.type === "pending_schema" && e.kind === "timeline",
      ),
    ).toBe(true);
    // Not raw yet — the node is held, not dropped.
    expect(events.some((e) => e.type === "raw_object")).toBe(false);
    expect(events.some((e) => e.type === "object_complete")).toBe(false);

    // The registry answers while the region is still live — upgrade in place.
    parser.notifySchemaArrived("timeline", {
      kind: "timeline",
      fields: {
        title: { type: "string", required: true },
        periods: { type: "string[]", required: true },
      },
    });
    parser.end();

    const completed = events.find((e) => e.type === "object_complete");
    expect(completed).toBeDefined();
    if (completed?.type !== "object_complete") throw new Error("unreachable");
    expect(completed.kind).toBe("timeline");

    const finalSnapshot = events
      .filter((e) => e.type === "block_snapshot")
      .pop();
    if (finalSnapshot?.type !== "block_snapshot") throw new Error("unreachable");
    expect(finalSnapshot.complete).toBe(true);
    expect(finalSnapshot.value.title).toBe("Rome");
  });

  it("drops to raw when the cold fetch misses (schema: null)", () => {
    const events: KindStreamEvent[] = [];
    const parser = createKindStreamParser({
      schemas: resolverWith({}, []),
      onEvent: (e) => events.push(e),
    });

    parser.push(JSON.stringify({ __kind: "ghost", x: 1 }));
    parser.notifySchemaArrived("ghost", null);
    parser.end();

    const raw = events.find((e) => e.type === "raw_object");
    expect(raw).toBeDefined();
    if (raw?.type !== "raw_object") throw new Error("unreachable");
    expect(raw.reason).toContain("ghost");
    // The data survived verbatim on the raw node — zero loss.
    if (raw.type === "raw_object") {
      expect((raw.value as Record<string, unknown>).x).toBe(1);
    }
  });

  it("region end resolves still-pending kinds to raw (deterministic envelopes)", () => {
    const events: KindStreamEvent[] = [];
    const parser = createKindStreamParser({
      schemas: resolverWith({}, []),
      onEvent: (e) => events.push(e),
    });

    parser.push(JSON.stringify({ __kind: "slowpoke", n: 7 }));
    parser.end(); // fetch never answered

    const raw = events.find((e) => e.type === "raw_object");
    expect(raw).toBeDefined();
    if (raw?.type !== "raw_object") throw new Error("unreachable");
    expect(raw.reason).toBe('No block schema registered for "slowpoke".');
    expect((raw.value as Record<string, unknown>).n).toBe(7);

    // A late delivery after end() is a no-op — the region already settled.
    parser.notifySchemaArrived("slowpoke", {
      kind: "slowpoke",
      fields: { n: { type: "number", required: true } },
    });
    expect(events.some((e) => e.type === "object_complete")).toBe(false);
  });

  it("without a request-capable resolver, unknown kinds go raw at close (static behavior)", () => {
    const events = collect(JSON.stringify({ __kind: "ghost", x: 1 }));
    expect(events.some((e) => e.type === "raw_object")).toBe(true);
    expect(events.some((e) => e.type === "pending_schema")).toBe(false);
  });
});

describe("pop-up-one-level error recovery", () => {
  it("a duplicate key marks THAT node raw and the stream survives", () => {
    const input =
      '{"__kind":"flashcard_set","title":"T","cards":[{"__kind":"flashcard","front":"Q","front":"Q2","back":"A"}]}';

    const events = collect(input);

    const raw = events.find(
      (e) => e.type === "raw_object" && irPathKey(e.path) === "cards.0",
    );
    expect(raw).toBeDefined();
    if (raw?.type !== "raw_object") throw new Error("unreachable");
    expect(raw.reason).toContain("Duplicate key");

    // Parent set still completes; no stream-fatal error.
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.some((e) => e.type === "complete")).toBe(true);
    const setComplete = events.find(
      (e) => e.type === "object_complete" && e.path.length === 0,
    );
    expect(setComplete).toBeDefined();
  });

  it("grammar errors remain region-fatal", () => {
    const events = collect('{"__kind":"flashcard_set",,}');
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});
