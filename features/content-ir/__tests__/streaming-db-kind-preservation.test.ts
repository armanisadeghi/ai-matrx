/**
 * Streaming db/cloud kinds — envelope kind PRESERVATION + upgrade paths.
 *
 * The bug class (2026-07-18): a `__kind` whose schema lives only in
 * `content_ir.kind_definition` (no compiled bootstrap) hit pending-schema,
 * lost the cold-fetch race, and finalized as a kind-LESS raw envelope —
 * `applyIrKindRoute` bailed on the empty kind and the region rendered as raw
 * JSON forever. These tests pin the fixed contract at the kernel seam
 * (ParseSession over the twin-bound parser + tree):
 *
 *  1. PENDING WINDOW: identified kind surfaces on the envelope while the
 *     schema is cold-fetching (`kindState: "pending_schema"`), with early
 *     top-level scalars in `root.value` (the loading-component fuel).
 *  2. LOST RACE: end() before the schema answer → raw fallback PRESERVES the
 *     identified kind (`kindState: "raw"`, kind intact, data intact).
 *  3. LATE UPGRADE (live region): the schema arriving mid-stream upgrades in
 *     place and the envelope completes fully resolved.
 *  4. GENUINELY KIND-LESS: bare data with no `__kind` keeps today's exact
 *     behavior — empty kind, raw fallback, value preserved.
 */

import { ParseSession } from "../session/parse-session";
import type { KindSchema } from "../core/kind-schema.types";
import type { SchemaResolver } from "../core/kind-parser";

const WINE_SCHEMA: KindSchema = {
  kind: "wine_tasting",
  fields: {
    title: { type: "string", required: true },
    loading_message: { type: "string", required: false },
    wine_name: { type: "string", required: true },
    vintage: { type: "number", required: false },
    rating: { type: "number", required: false },
  },
};

const WINE_JSON = JSON.stringify({
  __kind: "wine_tasting",
  title: "Opus One 2019",
  loading_message: "Pouring your tasting…",
  wine_name: "Opus One",
  vintage: 2019,
  rating: 97,
});

/** A resolver with NO schema and a controllable cold fetch. */
function makeColdResolver(): {
  resolver: SchemaResolver;
  requested: string[];
} {
  const requested: string[] = [];
  return {
    requested,
    resolver: {
      get: () => undefined,
      request: (kind) => {
        requested.push(kind);
      },
    },
  };
}

describe("streaming db-kind envelope preservation", () => {
  it("PENDING WINDOW: identified kind + early scalar fields surface while the schema is cold", () => {
    const { resolver, requested } = makeColdResolver();
    const session = new ParseSession({ identity: "t-pending", schemas: resolver });

    // Stream up to (but not including) the closing brace.
    const partial = WINE_JSON.slice(0, WINE_JSON.indexOf(',"rating"'));
    session.write(partial);

    const envelope = session.buildEnvelope();
    expect(requested).toContain("wine_tasting");
    expect(envelope.root.kind).toBe("wine_tasting");
    expect(envelope.root.kindState).toBe("pending_schema");
    expect(envelope.root.status).toBe("streaming");
    // Early keys (completed scalars) are available for the loading component.
    // (`vintage`'s number token is still unterminated at the cut, so only the
    // fields whose values fully streamed appear — exactly the contract.)
    expect(envelope.root.value).toMatchObject({
      title: "Opus One 2019",
      loading_message: "Pouring your tasting…",
      wine_name: "Opus One",
    });
    session.dispose();
  });

  it("LOST RACE: end() before the schema answer preserves kind + data through the raw fallback", () => {
    const { resolver } = makeColdResolver();
    const session = new ParseSession({ identity: "t-lost", schemas: resolver });
    session.write(WINE_JSON);
    session.end();

    const envelope = session.buildEnvelope();
    expect(envelope.root.kind).toBe("wine_tasting"); // preserved, NOT ""
    expect(envelope.root.kindState).toBe("raw");
    expect(envelope.root.status).toBe("complete");
    // Zero loss — the full data is on the envelope for the generic viewer /
    // db component to render.
    expect(envelope.root.value).toMatchObject({
      __kind: "wine_tasting",
      wine_name: "Opus One",
      rating: 97,
    });
    session.dispose();
  });

  it("LATE UPGRADE: schema arriving mid-stream upgrades in place to a resolved envelope", () => {
    const { resolver } = makeColdResolver();
    let deliver: ((kind: string, schema: KindSchema | null) => void) | null =
      null;
    const session = new ParseSession({
      identity: "t-upgrade",
      schemas: resolver,
      onSchemaArrived: (fn) => {
        deliver = fn;
        return () => {
          deliver = null;
        };
      },
    });

    session.write(WINE_JSON.slice(0, 40));
    // The cold fetch answers while the region is still streaming.
    deliver!("wine_tasting", WINE_SCHEMA);
    session.write(WINE_JSON.slice(40));
    session.end();

    const envelope = session.buildEnvelope();
    expect(envelope.root.kind).toBe("wine_tasting");
    expect(envelope.root.kindState).toBe("resolved");
    expect(envelope.root.status).toBe("complete");
    expect(envelope.root.value).toMatchObject({
      wine_name: "Opus One",
      rating: 97,
    });
    session.dispose();
  });

  it("GENUINELY KIND-LESS: bare data with no __kind keeps empty kind + raw fallback", () => {
    const { resolver, requested } = makeColdResolver();
    const session = new ParseSession({ identity: "t-kindless", schemas: resolver });
    session.write(JSON.stringify({ a: 1, nested: { b: 2 } }));
    session.end();

    const envelope = session.buildEnvelope();
    expect(requested).toHaveLength(0);
    expect(envelope.root.kind).toBe("");
    expect(envelope.root.kindState).toBe("raw");
    expect(envelope.root.value).toEqual({ a: 1, nested: { b: 2 } });
    session.dispose();
  });

  it("STREAMING kind-less window stays pending_kind (no kind claimed before __kind arrives)", () => {
    const { resolver } = makeColdResolver();
    const session = new ParseSession({ identity: "t-prekind", schemas: resolver });
    session.write('{"title": "No kind yet"');
    const envelope = session.buildEnvelope();
    expect(envelope.root.kind).toBe("");
    expect(envelope.root.kindState).toBe("pending_kind");
    session.dispose();
  });
});
