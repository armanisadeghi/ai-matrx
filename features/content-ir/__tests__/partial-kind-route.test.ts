/**
 * react/partial-kind-route.ts — routing a PROVISIONAL value into the same kind
 * component that renders the final one.
 *
 * Driven by the SAME real-server fixture the reader tests use
 * (`partial-kind-events.generated.json`, emitted by the Python producer), so
 * these assertions are about traffic that actually happens, not hand-built
 * shapes. Contract:
 * common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md
 */

import { IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import { IR_PARTIAL_KEY } from "../core/partial-kind";
import { SYSTEM_KIND_DEFINITIONS } from "../registry/system-kinds";
import {
  envelopeFromPartialKind,
  IR_PROVISIONAL_KEY,
  isPartialReadyKind,
  isProvisionalBlock,
  markKindPartialUnsafe,
  resetPartialUnsafeKinds,
  resolveProvisionalKindRender,
} from "../react/partial-kind-route";
import fixture from "./partial-kind-events.generated.json";

type Row = { event: Record<string, unknown> };
const FIXTURES = fixture.fixtures as unknown as Record<string, Row[]>;

/** A `code` render block carrying one partial-channel event, as the wire delivers it. */
interface TestBlock {
  type: string;
  content: string;
  serverData?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

function blockFor(event: Record<string, unknown>): TestBlock {
  return {
    type: "code",
    content: "",
    serverData: { language: "json" },
    metadata: { [IR_PARTIAL_KEY]: event },
  };
}

function questionCount(block: { serverData?: Record<string, unknown> }): number {
  const mc = block.serverData?.multipleChoice;
  return Array.isArray(mc) ? mc.length : 0;
}

beforeEach(() => {
  resetPartialUnsafeKinds();
});

describe("resolveProvisionalKindRender — the real quiz_set stream", () => {
  const rows = FIXTURES.clean_finish ?? [];

  it("a dead stream drops the provisional render — no stuck skeleton", () => {
    // Law 1 (exactly one terminal per partial) is a PRODUCER guarantee with at
    // least three ways to not fire: the drain skips a block missing from the
    // final block list, the emitter early-returns once the stream ended or was
    // cancelled (a client abort drops every retraction), and a flush failure is
    // swallowed so it never kills a run. Once the stream is over no terminal can
    // arrive, so a still-open provisional is stuck by definition.
    const live = rows.find(
      (row) => resolveProvisionalKindRender(blockFor(row.event)) !== null,
    );
    if (!live) throw new Error("fixture routed no provisional value");

    expect(resolveProvisionalKindRender(blockFor(live.event))).not.toBeNull();
    expect(
      resolveProvisionalKindRender(blockFor(live.event), {
        streamActive: false,
      }),
    ).toBeNull();
    // Explicitly live, and the omitted case, both still render.
    expect(
      resolveProvisionalKindRender(blockFor(live.event), { streamActive: true }),
    ).not.toBeNull();
    expect(
      resolveProvisionalKindRender(blockFor(live.event), {}),
    ).not.toBeNull();
  });

  it("routes provisional values to the quiz component and grows question by question", () => {
    const counts: number[] = [];
    let routedAtLeastOnce = false;

    for (const row of rows) {
      const resolved = resolveProvisionalKindRender(blockFor(row.event));
      if (!resolved) continue;
      routedAtLeastOnce = true;
      expect(resolved.kind).toBe("quiz_set");
      // The SAME component the final value renders in — never a bespoke
      // skeleton renderer.
      expect(resolved.block.type).toBe("quiz");
      expect(resolved.block.serverData?.quizTitle).toBe("Space Basics");
      counts.push(questionCount(resolved.block));
    }

    expect(routedAtLeastOnce).toBe(true);
    // Monotonic: a partial may be INCOMPLETE, never WRONG (contract law 6).
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
    expect(counts[counts.length - 1]).toBe(2);
  });

  it("withholds while the value is too thin for the component to render", () => {
    // seq 1 is `{title:"S", questions: []}` — the bridge declines, so the
    // block keeps its loading skeleton rather than rendering an empty quiz.
    const first = rows[0]!;
    expect(resolveProvisionalKindRender(blockFor(first.event))).toBeNull();
  });

  it("produces NO provisional render for a terminal event", () => {
    const terminal = rows[rows.length - 1]!;
    expect(terminal.event.state).toBe("superseded");
    expect(resolveProvisionalKindRender(blockFor(terminal.event))).toBeNull();

    const retracted = (FIXTURES.wrong_detection_retracted ?? []).at(-1)!;
    expect(retracted.event.state).toBe("retracted");
    expect(resolveProvisionalKindRender(blockFor(retracted.event))).toBeNull();
  });

  it("never mutates the block it was given (the wire metadata is untouched)", () => {
    const row = rows.find(
      (r) => resolveProvisionalKindRender(blockFor(r.event)) !== null,
    )!;
    const block = blockFor(row.event);
    const before = JSON.stringify(block);
    resolveProvisionalKindRender(block);
    expect(JSON.stringify(block)).toBe(before);
  });

  it("marks the routed block provisional and strips the partial key", () => {
    const row = rows.find(
      (r) => resolveProvisionalKindRender(blockFor(r.event)) !== null,
    )!;
    const resolved = resolveProvisionalKindRender(blockFor(row.event))!;
    expect(isProvisionalBlock(resolved.block.metadata)).toBe(true);
    expect(resolved.block.metadata?.[IR_PARTIAL_KEY]).toBeUndefined();
    expect(resolved.block.metadata?.[IR_ENVELOPE_KEY]).toBe(resolved.envelope);
    expect(resolved.envelope.root.status).toBe("streaming");
    expect(resolved.envelope.root.kindState).toBe("speculative");
  });

  it("withholds once a verified COMPLETE envelope is present", () => {
    const row = rows.find(
      (r) => resolveProvisionalKindRender(blockFor(r.event)) !== null,
    )!;
    const block = blockFor(row.event);
    // A verified, COMPLETE envelope on the same block — the final value has
    // landed and must not be displaced by a late partial.
    const provisional = envelopeFromPartialKind(
      row.event as unknown as Parameters<typeof envelopeFromPartialKind>[0],
    );
    block.metadata[IR_ENVELOPE_KEY] = {
      ...provisional,
      root: { ...provisional.root, status: "complete", kindState: "resolved" },
    };
    expect(resolveProvisionalKindRender(block)).toBeNull();
  });
});

describe("the posture — withhold by default, opt in per kind", () => {
  it("withholds a kind that has not opted in", () => {
    const row = (FIXTURES.clean_finish ?? []).find(
      (r) => resolveProvisionalKindRender(blockFor(r.event)) !== null,
    )!;
    const event = JSON.parse(JSON.stringify(row.event));
    // presentation_deck is registered and bridged but has NOT opted in.
    event.root.kind = "presentation_deck";
    event.root.value.__kind = "presentation_deck";
    expect(isPartialReadyKind("presentation_deck")).toBe(false);
    expect(resolveProvisionalKindRender(blockFor(event))).toBeNull();
  });

  it("withholds an unknown kind", () => {
    const row = (FIXTURES.clean_finish ?? []).find(
      (r) => resolveProvisionalKindRender(blockFor(r.event)) !== null,
    )!;
    const event = JSON.parse(JSON.stringify(row.event));
    event.root.kind = "not_a_registered_kind";
    expect(resolveProvisionalKindRender(blockFor(event))).toBeNull();
  });

  it("stops routing a kind whose component threw (the loud-recovery latch)", () => {
    const row = (FIXTURES.clean_finish ?? []).find(
      (r) => resolveProvisionalKindRender(blockFor(r.event)) !== null,
    )!;
    expect(resolveProvisionalKindRender(blockFor(row.event))).not.toBeNull();
    markKindPartialUnsafe("quiz_set");
    expect(isPartialReadyKind("quiz_set")).toBe(false);
    expect(resolveProvisionalKindRender(blockFor(row.event))).toBeNull();
  });
});

describe("the facet and its bridge cannot drift apart", () => {
  it("every partialReady kind has a bridge that accepts a streaming envelope", () => {
    const partialReady = SYSTEM_KIND_DEFINITIONS.filter(
      (def) => def.partialReady === true,
    );
    expect(partialReady.length).toBeGreaterThan(0);

    for (const def of partialReady) {
      if (!def.toLegacyServerData) continue;
      // A bridge built WITHOUT `{ provisional: true }` declines every
      // streaming envelope on status alone — a facet promising a live
      // fill-in over a skeleton that never fills.
      const row = (FIXTURES.clean_finish ?? []).at(-2)!;
      const event = JSON.parse(JSON.stringify(row.event));
      event.root.kind = def.kind;
      event.root.value.__kind = def.kind;
      const envelope = envelopeFromPartialKind(event);
      const accepted =
        def.toLegacyServerData({
          ...envelope,
          root: { ...envelope.root, status: "streaming" },
        }) !== undefined;
      const wouldAcceptComplete =
        def.toLegacyServerData({
          ...envelope,
          root: { ...envelope.root, status: "complete" },
        }) !== undefined;
      if (wouldAcceptComplete) {
        expect([def.kind, accepted]).toEqual([def.kind, true]);
      }
    }
  });
});
