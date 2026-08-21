/**
 * core/partial-kind.ts — the streaming partial-kinds reader, pinned to REAL
 * server output.
 *
 * The fixture in `partial-kind-events.generated.json` is not hand-written: it
 * is every partial-channel event the production Python producer actually
 * emitted for three documents (a clean finish, a real wrong-detection
 * retraction, and prose+code that must produce nothing), captured by
 * `aidream/scripts/generate_partial_kind_fixture.py`. A twin validated against
 * someone's *reading* of a contract drifts silently — that is the exact class
 * of failure the detection-parity gate exists to end, so this one is validated
 * against the wire.
 *
 * Contract: common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md
 */

import { IR_VERSION } from "../core/ir-types";
import {
  IR_PARTIAL_KEY,
  advancePartialKind,
  makePartialKindStalenessGate,
  isProvisionalKind,
  isTerminalKindEvent,
  readPartialKindEvent,
  sanitizeInboundPartialKindMetadata,
  type AnyPartialKindEvent,
} from "../core/partial-kind";
import fixture from "./partial-kind-events.generated.json";

interface Row {
  blockId: string;
  blockType: string;
  blockStatus: string;
  event: Record<string, unknown>;
}

const FIXTURES = fixture.fixtures as Record<string, Row[]>;

function readRow(row: Row): AnyPartialKindEvent | null {
  return readPartialKindEvent({ [IR_PARTIAL_KEY]: row.event });
}

describe("readPartialKindEvent — real server output", () => {
  it("accepts every event the production producer emitted", () => {
    let total = 0;
    for (const [name, rows] of Object.entries(FIXTURES)) {
      for (const row of rows) {
        const parsed = readRow(row);
        if (parsed === null) {
          throw new Error(
            `${name}: the reader rejected an event the server really sent: ${JSON.stringify(row.event)}`,
          );
        }
        total += 1;
      }
    }
    expect(total).toBeGreaterThan(20);
  });

  it("renders a structured answer progressively, then finalizes", () => {
    const rows = FIXTURES.clean_finish ?? [];
    expect(rows.length).toBeGreaterThan(2);

    const events = rows.map(readRow) as AnyPartialKindEvent[];
    const provisional = events.filter(isProvisionalKind);
    const terminals = events.filter(isTerminalKindEvent);

    expect(provisional.length).toBeGreaterThan(1);
    expect(terminals).toHaveLength(1);
    expect(terminals[0]!.state).toBe("superseded");
    expect(events[events.length - 1]!.state).toBe("superseded");

    for (const event of provisional) {
      // Pre-recognition is stated in the data, never inferred.
      expect(event.root.kindState).toBe("speculative");
      expect(event.root.status).toBe("streaming");
      // The value is real JSON that says what it is.
      expect(JSON.parse(JSON.stringify(event.root.value))).toEqual(
        event.root.value,
      );
      expect(event.root.value.__kind).toBe(event.root.kind);
      // Unvalidated is announced, so a renderer knows fields may be missing.
      const codes = (event.root.residue?.notices ?? []).map((n) => n.code);
      expect(codes).toContain("partial_unvalidated");
    }
  });

  it("values only ever grow — a partial may be incomplete, never wrong", () => {
    const provisional = (FIXTURES.clean_finish ?? [])
      .map(readRow)
      .filter(isProvisionalKind);
    let previousCount = 0;
    for (const event of provisional) {
      const items = (event.root.value.questions ??
        event.root.value.multiple_choice ??
        []) as unknown[];
      expect(items.length).toBeGreaterThanOrEqual(previousCount);
      previousCount = items.length;
    }
    expect(previousCount).toBeGreaterThan(0);
  });

  it("surfaces a wrong detection as an explicit retraction", () => {
    const events = (FIXTURES.wrong_detection_retracted ?? []).map(
      readRow,
    ) as AnyPartialKindEvent[];
    expect(events.length).toBeGreaterThan(1);

    const last = events[events.length - 1]!;
    expect(last.state).toBe("retracted");
    if (last.state !== "retracted") throw new Error("unreachable");
    // A consumer can always tell "became something else" from "completed".
    expect(last.reason).toBeTruthy();
    expect(last.becameBlockType).toBe("text");
    expect(isTerminalKindEvent(last)).toBe(true);
    expect(isProvisionalKind(last)).toBe(false);
  });

  it("announces nothing for prose and code", () => {
    expect(FIXTURES.prose_and_code_no_partials).toEqual([]);
  });

  it("every announced partial ends in exactly one terminal event", () => {
    for (const [name, rows] of Object.entries(FIXTURES)) {
      const perBlock = new Map<string, string[]>();
      for (const row of rows) {
        const parsed = readRow(row);
        expect(parsed).not.toBeNull();
        const states = perBlock.get(row.blockId) ?? [];
        states.push(parsed!.state);
        perBlock.set(row.blockId, states);
      }
      for (const [blockId, states] of perBlock) {
        const terminals = states.filter((s) => s !== "partial");
        if (terminals.length !== 1) {
          throw new Error(
            `${name}/${blockId}: ${terminals.length} terminal events (${states.join(",")}) — ` +
              "a client cannot know when to stop rendering a skeleton",
          );
        }
        expect(states[states.length - 1]).toBe(terminals[0]);
        expect(states[0]).toBe("partial");
      }
    }
  });
});

describe("readPartialKindEvent — malformed input degrades, never renders wrong", () => {
  const sample = (FIXTURES.clean_finish ?? [])[0]!.event;

  it.each([
    ["no metadata", undefined],
    ["empty metadata", {}],
    ["not an object", { [IR_PARTIAL_KEY]: "nope" }],
    ["wrong version", { [IR_PARTIAL_KEY]: { ...sample, v: 99 } }],
    ["unknown state", { [IR_PARTIAL_KEY]: { ...sample, state: "made_up" } }],
    ["missing seq", { [IR_PARTIAL_KEY]: { ...sample, seq: undefined } }],
    ["seq not a number", { [IR_PARTIAL_KEY]: { ...sample, seq: "3" } }],
    [
      "partial with no value object",
      { [IR_PARTIAL_KEY]: { ...sample, root: { ...(sample as any).root, value: null } } },
    ],
    [
      "partial claiming to be resolved",
      {
        [IR_PARTIAL_KEY]: {
          ...sample,
          root: { ...(sample as any).root, kindState: "resolved" },
        },
      },
    ],
    [
      "retraction with no reason",
      { [IR_PARTIAL_KEY]: { v: IR_VERSION, engine: "py-block-detector", state: "retracted", seq: 1, kind: "quiz_set" } },
    ],
  ])("rejects %s", (_label, metadata) => {
    expect(readPartialKindEvent(metadata as never)).toBeNull();
  });

  it("never throws on hostile input", () => {
    for (const value of [null, 0, "", [], { [IR_PARTIAL_KEY]: [] }]) {
      expect(() => readPartialKindEvent(value as never)).not.toThrow();
    }
  });
});

describe("advancePartialKind — the staleness gate", () => {
  const rows = (FIXTURES.clean_finish ?? []).map(readRow) as AnyPartialKindEvent[];

  it("keeps only strictly newer events for a block", () => {
    const seen: Record<string, number> = {};
    let accepted = 0;
    for (const event of rows) {
      const advanced = advancePartialKind(seen, "blk_0", event);
      if (advanced) {
        accepted += 1;
        seen.blk_0 = advanced.seq;
      }
    }
    expect(accepted).toBe(rows.length);

    // A replay (reconnect, re-dispatch) must change nothing.
    for (const event of rows) {
      expect(advancePartialKind(seen, "blk_0", event)).toBeNull();
    }
  });

  it("tracks blocks independently", () => {
    const seen: Record<string, number> = { blk_0: 999 };
    expect(advancePartialKind(seen, "blk_0", rows[0]!)).toBeNull();
    expect(advancePartialKind(seen, "blk_1", rows[0]!)).not.toBeNull();
  });
});

describe("sanitizeInboundPartialKindMetadata — the wire boundary", () => {
  const valid = (FIXTURES.clean_finish ?? [])[0]!.event;

  it("passes untouched metadata through by reference", () => {
    const metadata = { language: "json" };
    expect(
      sanitizeInboundPartialKindMetadata(metadata, { blockId: "blk_0" }),
    ).toBe(metadata);
  });

  it("passes a VALID partial through by reference (idempotence law)", () => {
    const metadata = { [IR_PARTIAL_KEY]: valid };
    expect(
      sanitizeInboundPartialKindMetadata(metadata, { blockId: "blk_0" }),
    ).toBe(metadata);
  });

  it("strips a malformed partial LOUDLY and keeps the rest", () => {
    const reported: unknown[] = [];
    const result = sanitizeInboundPartialKindMetadata(
      { language: "json", [IR_PARTIAL_KEY]: { state: "nonsense" } },
      { blockId: "blk_7" },
      { reportMalformed: (info) => reported.push(info) },
    );
    expect(result).toEqual({ language: "json" });
    expect(result).not.toHaveProperty(IR_PARTIAL_KEY);
    expect(reported).toHaveLength(1);
    expect((reported[0] as { blockId: string }).blockId).toBe("blk_7");
  });

  it("never touches the verified envelope key", () => {
    const metadata = { __ir: { anything: true }, [IR_PARTIAL_KEY]: { bad: 1 } };
    const result = sanitizeInboundPartialKindMetadata(metadata, {
      blockId: "blk_0",
    }) as Record<string, unknown>;
    expect(result.__ir).toBe(metadata.__ir);
  });
});

describe("makePartialKindStalenessGate — a stale event never regresses a block", () => {
  const rows = (FIXTURES.clean_finish ?? []).map((row) => ({
    [IR_PARTIAL_KEY]: row.event,
  })) as Array<Record<string, unknown>>;

  it("accepts strictly increasing seq by reference", () => {
    const gate = makePartialKindStalenessGate();
    for (const metadata of rows) {
      expect(gate("blk_0", metadata)).toBe(metadata);
    }
  });

  it("carries the last partial forward when the producer omits the key", () => {
    // The producer clears `__ir_partial` and re-adds it only when the value
    // ADVANCED, so most events carry no key at all. Without carry-forward the
    // provisional render vanished on every non-advancing token and the user
    // watched a filled-in quiz flicker back to the pending skeleton.
    const gate = makePartialKindStalenessGate();
    const first = rows[0];
    if (!first) throw new Error("fixture has no partial events");
    expect(gate("blk_0", first)).toBe(first);

    const noKey = { language: "json" } as Record<string, unknown>;
    const carried = gate("blk_0", noKey);
    expect(carried).not.toBe(noKey);
    expect(carried?.[IR_PARTIAL_KEY]).toBe(first[IR_PARTIAL_KEY]);
    // untouched keys survive
    expect(carried?.language).toBe("json");
  });

  it("stops carrying once the block terminates, and never resurrects", () => {
    const gate = makePartialKindStalenessGate();
    const first = rows[0];
    if (!first) throw new Error("fixture has no partial events");
    gate("blk_0", first);

    const terminal = {
      [IR_PARTIAL_KEY]: {
        v: 1,
        engine: "py-block-detector",
        state: "superseded",
        seq: 9_999,
        kind: "quiz_set",
      },
    } as Record<string, unknown>;
    expect(gate("blk_0", terminal)).toBe(terminal);

    // Every later event omits the key; the region's own content is the truth
    // now, so nothing provisional may come back.
    const noKey = {} as Record<string, unknown>;
    expect(gate("blk_0", noKey)).toBe(noKey);
  });

  it("does not invent a partial for a block that never had one", () => {
    const gate = makePartialKindStalenessGate();
    const noKey = { language: "json" } as Record<string, unknown>;
    expect(gate("blk_never", noKey)).toBe(noKey);
  });

  it("carries the last accepted event forward when a stale one replays", () => {
    const gate = makePartialKindStalenessGate();
    const latest = rows[rows.length - 1]!;
    gate("blk_0", rows[0]!);
    gate("blk_0", latest);

    const replay = rows[1]!;
    const gated = gate("blk_0", replay)!;
    expect(gated).not.toBe(replay);
    // The terminal already accepted stands — the replayed partial is a no-op.
    expect(gated[IR_PARTIAL_KEY]).toBe(latest[IR_PARTIAL_KEY]);
  });

  it("tracks blocks independently, and carries an OPEN block's partial across a keyless event", () => {
    const gate = makePartialKindStalenessGate();
    const open = rows[5]!;
    gate("blk_0", open);
    expect(gate("blk_1", rows[0]!)).toBe(rows[0]!);

    // blk_0 is still OPEN (no terminal), and the producer omits the key on any
    // event that did not advance — carrying is what keeps the provisional
    // render on screen instead of flickering back to the skeleton.
    const plain = { isComplete: false } as Record<string, unknown>;
    const gated = gate("blk_0", plain)!;
    expect(gated).not.toBe(plain);
    expect(gated[IR_PARTIAL_KEY]).toBe(open[IR_PARTIAL_KEY]);
    expect(gated.isComplete).toBe(false);

    expect(gate("blk_0", undefined)).toBeUndefined();
  });
});
