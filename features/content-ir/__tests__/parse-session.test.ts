import { ParseSession } from "../session/parse-session";
import {
  disposeParseSession,
  getParseSession,
  openParseSession,
} from "../session/session-manager";
import { normalizeJsonRegion } from "../core/normalize";
import type { KindSchema } from "../core/kind-schema.types";
import { chunkText } from "./seeded-random";
import {
  FLASHCARD_SCHEMAS,
  FLASHCARD_SET_JSON,
} from "./fixtures/flashcards-fixture";

const THREE_CARD_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Physics",
  cards: [
    { __kind: "flashcard", front: "F=?", back: "ma" },
    { __kind: "flashcard", front: "E=?", back: "mc^2" },
    { __kind: "flashcard", front: "V=?", back: "IR" },
  ],
});

function runSession(input: string, seed = 3): ParseSession {
  const session = new ParseSession({
    identity: `test:${seed}:${input.length}`,
    schemas: FLASHCARD_SCHEMAS,
  });
  for (const chunk of chunkText(input, seed)) {
    session.write(chunk);
  }
  session.end();
  session.flushNotify();
  return session;
}

describe("ParseSession + IrTree", () => {
  it("exposes per-path nodes with schema-shaped values", () => {
    const session = runSession(THREE_CARD_JSON);

    const root = session.getNode("");
    expect(root?.kind).toBe("flashcard_set");
    expect(root?.complete).toBe(true);
    expect(root?.value.title).toBe("Physics");

    const card1 = session.getNode("cards.1");
    expect(card1?.kind).toBe("flashcard");
    expect(card1?.value).toMatchObject({ front: "E=?", back: "mc^2" });
  });

  it("STRUCTURAL SHARING: a late child update leaves sibling identities intact", () => {
    const session = new ParseSession({
      identity: "test:sharing",
      schemas: FLASHCARD_SCHEMAS,
    });

    // Stream the set with two complete cards, then pause mid-third-card.
    const prefix =
      '{"__kind":"flashcard_set","title":"P","cards":[' +
      '{"__kind":"flashcard","front":"A?","back":"a"},' +
      '{"__kind":"flashcard","front":"B?","back":"b"},' +
      '{"__kind":"flashcard","front":"C?"';
    session.write(prefix);
    session.flushNotify();

    const card0Before = session.getNode("cards.0");
    const card1Before = session.getNode("cards.1");
    const card2Before = session.getNode("cards.2");
    const rootBefore = session.getNode("");
    expect(card2Before?.value.front).toBe("C?");
    expect(card2Before?.complete).toBe(false);

    // The third card's back arrives.
    session.write(',"back":"c"}]}');
    session.end();
    session.flushNotify();

    const card0After = session.getNode("cards.0");
    const card1After = session.getNode("cards.1");
    const card2After = session.getNode("cards.2");
    const rootAfter = session.getNode("");

    // Siblings: same node objects AND same value identity — memoized
    // components bail out.
    expect(card0After).toBe(card0Before);
    expect(card1After).toBe(card1Before);
    expect(card0After?.value).toBe(card0Before?.value);

    // The updated card and every ancestor got fresh identities.
    expect(card2After).not.toBe(card2Before);
    expect(card2After?.value.back).toBe("c");
    expect(rootAfter).not.toBe(rootBefore);
    expect(rootAfter?.version).toBeGreaterThan(rootBefore?.version ?? 0);

    // Root's cards array reflects the child update via the COW spine.
    const rootCards = rootAfter?.value.cards as Array<Record<string, unknown>>;
    const rootCard2 = rootCards[2];
    expect(rootCard2).toBeDefined();
    if (!rootCard2) throw new Error("unreachable");
    expect(rootCard2.back).toBe("c");
    // Unchanged siblings inside the root value keep identity too.
    expect(rootCards[0]).toBe(card0Before?.value);
  });

  it("notifies exactly the touched paths on flushNotify", () => {
    const session = new ParseSession({
      identity: "test:notify",
      schemas: FLASHCARD_SCHEMAS,
    });

    const hits: Record<string, number> = {};
    const track = (pathKey: string) => {
      session.subscribe(pathKey, () => {
        hits[pathKey] = (hits[pathKey] ?? 0) + 1;
      });
    };
    track("cards.0");
    track("cards.1");

    session.write(
      '{"__kind":"flashcard_set","title":"P","cards":[{"__kind":"flashcard","front":"A?","back":"a"},',
    );
    session.flushNotify();

    expect(hits["cards.0"]).toBe(1);
    expect(hits["cards.1"]).toBeUndefined();

    session.write('{"__kind":"flashcard","front":"B?","back":"b"}]}');
    session.end();
    session.flushNotify();

    expect(hits["cards.1"]).toBe(1);
    // cards.0 gets one more notification: the root close's COW propagation
    // does not touch it, but the set-level complete snapshot rebuilds the
    // spine — only paths actually dirtied may notify. It must NOT grow per
    // token; two flushes → at most one extra hit.
    expect(hits["cards.0"] ?? 0).toBeLessThanOrEqual(2);
  });

  it("stream envelope === one-shot envelope (same assembly path)", () => {
    const session = runSession(FLASHCARD_SET_JSON, 7);
    const streamed = session.buildEnvelope();

    const oneShot = normalizeJsonRegion(FLASHCARD_SET_JSON, {
      schemas: FLASHCARD_SCHEMAS,
    });

    expect(streamed).toEqual(oneShot);
  });

  it("Redux-safety: emitted node values are frozen-safe (no live parser refs)", () => {
    const session = new ParseSession({
      identity: "test:freeze",
      schemas: FLASHCARD_SCHEMAS,
    });
    session.write(
      '{"__kind":"flashcard_set","title":"P","cards":[{"__kind":"flashcard","front":"A?","back":"a"}',
    );
    session.flushNotify();

    const rootMid = session.getNode("");
    // Freeze what a Redux dev-mode store would freeze.
    Object.freeze(rootMid?.value);
    Object.freeze(rootMid?.value.cards);

    // Parsing continues without throwing — parser frames are decoupled.
    expect(() => {
      session.write(',{"__kind":"flashcard","front":"B?","back":"b"}]}');
      session.end();
      session.flushNotify();
    }).not.toThrow();

    const rootEnd = session.getNode("");
    expect((rootEnd?.value.cards as unknown[]).length).toBe(2);
  });
});

describe("session-manager one-writer enforcement", () => {
  afterEach(() => {
    disposeParseSession("mgr:one-writer");
  });

  it("throws when a second writer opens the same live identity", () => {
    openParseSession({
      identity: "mgr:one-writer",
      schemas: FLASHCARD_SCHEMAS,
    });
    expect(() =>
      openParseSession({
        identity: "mgr:one-writer",
        schemas: FLASHCARD_SCHEMAS,
      }),
    ).toThrow(/One writer per stream identity/);
  });

  it("readers resolve the session; ended sessions stay readable until disposed", () => {
    const session = openParseSession({
      identity: "mgr:one-writer",
      schemas: FLASHCARD_SCHEMAS,
    });
    session.write(FLASHCARD_SET_JSON);
    session.end();

    expect(getParseSession("mgr:one-writer")).toBe(session);
    expect(getParseSession("mgr:one-writer")?.getNode("")?.kind).toBe(
      "flashcard_set",
    );

    // A finished identity can be reopened (new run of the same region id).
    const reopened = openParseSession({
      identity: "mgr:one-writer",
      schemas: FLASHCARD_SCHEMAS,
    });
    expect(reopened).not.toBe(session);

    disposeParseSession("mgr:one-writer");
    expect(getParseSession("mgr:one-writer")).toBeNull();
  });
});

describe("pending-schema through the session (registry hook)", () => {
  it("upgrades nodes in place when the schema arrives late", () => {
    // Collected in an array (not a nullable let) so TS control-flow analysis
    // doesn't narrow the callback to null across the constructor boundary.
    const deliverers: Array<(kind: string, schema: KindSchema | null) => void> =
      [];
    const requested: string[] = [];

    const session = new ParseSession({
      identity: "test:late-schema",
      schemas: {
        get: () => undefined,
        request: (kind: string) => requested.push(kind),
      },
      onSchemaArrived: (cb) => {
        deliverers.push(cb);
        return () => {
          deliverers.length = 0;
        };
      },
    });

    session.write(JSON.stringify({ __kind: "timeline", title: "Rome" }));
    session.flushNotify();

    expect(requested).toEqual(["timeline"]);
    expect(session.getNode("")).toBeNull(); // held, not raw
    expect(deliverers).toHaveLength(1);

    // Registry answers while the region is still live — upgrade in place.
    const deliver = deliverers[0];
    expect(deliver).toBeDefined();
    if (!deliver) throw new Error("unreachable");
    deliver("timeline", {
      kind: "timeline",
      fields: { title: { type: "string", required: true } },
    });
    session.end();
    session.flushNotify();

    const root = session.getNode("");
    expect(root?.kind).toBe("timeline");
    expect(root?.complete).toBe(true);
    expect(root?.value.title).toBe("Rome");
  });
});
