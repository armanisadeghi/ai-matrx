/**
 * THE ONE LOADING SEQUENCE (Arman, 2026-08-24) — pinned end to end.
 *
 * For a `__kind` block, on EVERY arrival path:
 *
 *   1. Kind key detected (key alone, value not needed) → the kind's loader
 *      renders instantly — generic until the definition is known, the
 *      declared `loading_component` after.
 *   2. Schema + component fetch from the RENDER path (`ensureKindRenderable`)
 *      — not from any one transport, so DB reloads fetch exactly like live
 *      streams. ("Works after you navigate away and come back" was the
 *      accumulator being the only fetch trigger.)
 *   3. The moment the bridge produces a renderable frame — the kind's FIRST
 *      RENDERABLE UNIT — the real component renders it and grows. A bridge
 *      that declines a too-thin frame keeps the loader up; that decline gate
 *      is the per-kind knob, never a hardcoded type list in the renderer.
 *
 * These tests run the REAL accumulator + REAL route, mirroring
 * BlockRenderer's branch conditions exactly (the house pattern — see
 * bare-json-pending-kind.test.ts).
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import {
  applyIrKindRoute,
  GENERIC_STRUCTURED_COMPONENT_KEY,
} from "../react/kind-route";
import { ensureKindRenderable } from "../react/ensure-kind-renderable";
import { readEnvelope } from "../redux/render-block-envelope";
import { kindRegistry } from "../registry/kind-registry";
import { componentRegistry } from "../registry/component-registry";
import { buildWireText, chunkWireText } from "../studio/stream-simulator";

const QUIZ = {
  title: "Cell Biology Fundamentals",
  questions: [
    {
      __kind: "quiz_question",
      type: "multiple_choice",
      question: "Which organelle is the primary site of ATP production?",
      options: ["Mitochondrion", "Nucleus", "Lysosome", "Golgi apparatus"],
      correct_answer: "Mitochondrion",
    },
    {
      __kind: "quiz_question",
      type: "multiple_choice",
      question: "Which molecule carries genetic information?",
      options: ["DNA", "ATP", "Lipids"],
      correct_answer: "DNA",
    },
  ],
};

const FLASHCARDS = {
  __kind: "flashcard_set",
  title: "Stream Growth",
  cards: [
    { __kind: "flashcard", front: "What is ATP?", back: "Cellular energy currency" },
    { __kind: "flashcard", front: "What is DNA?", back: "Genetic code molecule" },
  ],
};

type RoutedFrame = {
  type: string;
  serverData?: Record<string, unknown>;
  status: string;
  kind: string | null;
};

/** Stream a payload through the real accumulator; route EVERY upsert. */
function routedFrames(payload: Record<string, unknown>, kind: string): RoutedFrame[] {
  const frames: RoutedFrame[] = [];
  const accumulator = new StreamBlockAccumulator("one-seq", (p) => {
    const block = p.block as RenderBlockPayload;
    const routed = applyIrKindRoute({
      type: block.type,
      content: block.content ?? "",
      serverData: block.data ?? undefined,
      metadata: block.metadata,
    });
    const envelope = readEnvelope(routed.metadata);
    frames.push({
      type: routed.type,
      serverData: routed.serverData,
      status: block.status,
      kind: envelope?.root.kind || null,
    });
    return p;
  });
  const dispatch = (a: unknown) => a;
  for (const chunk of chunkWireText(buildWireText(payload, kind, "bare"), 24)) {
    accumulator.ingest(chunk, dispatch);
  }
  accumulator.finalize(dispatch);
  return frames;
}

describe("first renderable unit — the bridge is the gate", () => {
  it("quiz_set: loader frames until a question has ≥2 options, then the REAL component grows", () => {
    const frames = routedFrames(QUIZ, "quiz_set").filter((f) => f.kind === "quiz_set");
    expect(frames.length).toBeGreaterThan(4);

    // Phase 1 — kind known, frame too thin: the bridge declines
    // (serverData undefined) → BlockRenderer shows the kind's loader.
    const loaderFrames = frames.filter(
      (f) => f.status === "streaming" && f.serverData === undefined,
    );
    expect(loaderFrames.length).toBeGreaterThan(0);

    // Phase 2 — mid-stream, the real component receives a frame with at
    // least one FULL question (never a 1-option lie).
    const liveFrames = frames.filter(
      (f) => f.status === "streaming" && f.serverData !== undefined,
    );
    expect(liveFrames.length).toBeGreaterThan(0);
    for (const frame of liveFrames) {
      const mc = frame.serverData!.multipleChoice as Array<{ options: string[] }>;
      expect(mc.length).toBeGreaterThan(0);
      for (const q of mc) expect(q.options.length).toBeGreaterThanOrEqual(2);
    }

    // Phase order: every loader frame precedes every live frame — the loader
    // NEVER returns once the real component has rendered.
    const firstLive = frames.findIndex(
      (f) => f.status === "streaming" && f.serverData !== undefined,
    );
    const lastLoader = frames
      .map((f, i) => (f.status === "streaming" && f.serverData === undefined ? i : -1))
      .reduce((a, b) => Math.max(a, b), -1);
    expect(lastLoader).toBeLessThan(firstLive);

    // Final frame: complete, full quiz.
    const final = frames[frames.length - 1];
    expect(final.status).toBe("complete");
    expect(final.type).toBe("quiz");
    expect(
      (final.serverData!.multipleChoice as unknown[]).length,
    ).toBe(QUIZ.questions.length);
  });

  it("flashcard_set: loader until the first card face, then live growth to the full deck", () => {
    const frames = routedFrames(FLASHCARDS, "flashcard_set").filter(
      (f) => f.kind === "flashcard_set",
    );

    const liveFrames = frames.filter(
      (f) => f.status === "streaming" && f.serverData !== undefined,
    );
    expect(liveFrames.length).toBeGreaterThan(0);
    // No live frame ever carries an empty deck (the first-unit gate).
    for (const frame of liveFrames) {
      expect((frame.serverData!.cards as unknown[]).length).toBeGreaterThan(0);
    }
    // The deck GROWS across live frames (progressive, not batched).
    const counts = liveFrames.map((f) => (f.serverData!.cards as unknown[]).length);
    expect(counts[0]).toBeLessThanOrEqual(counts[counts.length - 1]);
    expect(counts[counts.length - 1]).toBe(FLASHCARDS.cards.length);

    const final = frames[frames.length - 1];
    expect(final.status).toBe("complete");
    expect(final.type).toBe("flashcards");
  });
});

describe("component-fetch window — loader, never a JSON tree, while streaming", () => {
  const CLOUD_KIND = "one_seq_cloud_kind";

  beforeAll(() => {
    // A cloud kind whose SCHEMA is known but whose component has not been
    // fetched — the exact window between "kind identified" and "component
    // row lands".
    kindRegistry.upsertDefinition({
      kind: CLOUD_KIND,
      schemaSource: "content_ir",
      tier: "cold",
      loadingComponent: "card",
      schema: {
        kind: CLOUD_KIND,
        fields: {
          title: { type: "string", required: true },
          items: { type: "array", items: { type: "string" } },
        },
      },
    });
  });

  it("streams as generic_structured (no component) — which BlockRenderer shows as the kind loader", () => {
    const frames = routedFrames(
      { __kind: CLOUD_KIND, title: "Cloud", items: ["a", "b"] },
      CLOUD_KIND,
    ).filter((f) => f.kind === CLOUD_KIND);

    const streamingFrames = frames.filter((f) => f.status === "streaming");
    expect(streamingFrames.length).toBeGreaterThan(0);
    for (const frame of streamingFrames) {
      // Route answer: generic fallback. BlockRenderer's Stage 2.5 turns
      // exactly this (generic + streaming envelope) into the kind loader.
      expect(frame.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
    }
    // Complete: generic viewer is the sanctioned R6 floor for a kind with no
    // component — the final value is never hidden behind a loader.
    expect(frames[frames.length - 1].type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
  });

  it("the declared loading_component slug is resolvable the moment the definition is known", () => {
    expect(kindRegistry.getDefinition(CLOUD_KIND)?.loadingComponent).toBe("card");
  });
});

describe("fetch-from-render — ensureKindRenderable is the transport-independent trigger", () => {
  it("requests schema AND component for an unknown kind", () => {
    const schemaSpy = jest
      .spyOn(kindRegistry, "requestSchema")
      .mockImplementation(() => {});
    const componentSpy = jest
      .spyOn(componentRegistry, "requestComponent")
      .mockImplementation(() => {});
    try {
      ensureKindRenderable("some_unfetched_kind");
      expect(schemaSpy).toHaveBeenCalledWith("some_unfetched_kind");
      expect(componentSpy).toHaveBeenCalledWith(
        "some_unfetched_kind",
        "web",
        "output",
      );
    } finally {
      schemaSpy.mockRestore();
      componentSpy.mockRestore();
    }
  });

  it("requests NOTHING for a kind that already answers (compiled quiz_set)", () => {
    const schemaSpy = jest
      .spyOn(kindRegistry, "requestSchema")
      .mockImplementation(() => {});
    const componentSpy = jest
      .spyOn(componentRegistry, "requestComponent")
      .mockImplementation(() => {});
    try {
      ensureKindRenderable("quiz_set");
      expect(schemaSpy).not.toHaveBeenCalled();
      expect(componentSpy).not.toHaveBeenCalled();
    } finally {
      schemaSpy.mockRestore();
      componentSpy.mockRestore();
    }
  });
});
