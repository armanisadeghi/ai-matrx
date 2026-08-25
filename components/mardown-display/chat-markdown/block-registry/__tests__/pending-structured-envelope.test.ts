/**
 * THE KINDLESS-PATIENCE LAW (Arman, live Study Pack run, 2026-08-25).
 *
 * A streaming JSON region with no `__kind` used to hold the loading skeleton
 * for its whole life — "made me sit there and watch a spinner for a very long
 * time" — and then dump the JSON at once. The discriminator is taught as the
 * FIRST key, so a region that has streamed well past the first chunk without
 * one is genuinely kindless and must STREAM LIVE as code instead. A loader is
 * a promise of a component, never a lid over content.
 */

import { IR_ENVELOPE_KEY, IR_VERSION } from "@ai-matrx/content-ir";
import { pendingStructuredEnvelope } from "../BlockRenderer";

/** A minimal envelope that passes `isCanonicalBlockIR` (v/fingerprint/engine/root.role). */
function block(input: {
  kind?: string;
  kindState?: string;
  status?: "streaming" | "complete";
  content?: string;
  type?: string;
}) {
  return {
    type: input.type ?? "code",
    content: input.content ?? "",
    metadata: {
      [IR_ENVELOPE_KEY]: {
        v: IR_VERSION,
        engine: "test",
        fingerprint: "test",
        root: {
          role: "structured",
          kind: input.kind ?? "",
          kindState: input.kindState,
          status: input.status ?? "streaming",
          value: {},
        },
      },
    },
  };
}

describe("pendingStructuredEnvelope", () => {
  it("holds the loader for a YOUNG kindless region — the __kind may still arrive", () => {
    expect(pendingStructuredEnvelope(block({ content: '{"ti' }))).not.toBeNull();
  });

  it("concedes on a GROWN kindless region so the JSON streams live", () => {
    const grown = '{"title":"x",'.padEnd(600, "a");
    expect(pendingStructuredEnvelope(block({ content: grown }))).toBeNull();
  });

  it("an IDENTIFIED kind holds the loader only while its schema cold-fetches", () => {
    const long = "x".repeat(1000);
    expect(
      pendingStructuredEnvelope(
        block({ kind: "quiz_set", kindState: "pending_schema", content: long }),
      ),
    ).not.toBeNull();
    expect(
      pendingStructuredEnvelope(block({ kind: "quiz_set", content: long })),
    ).toBeNull();
  });

  it("never fires for complete regions or non-code blocks", () => {
    expect(pendingStructuredEnvelope(block({ status: "complete" }))).toBeNull();
    expect(pendingStructuredEnvelope(block({ type: "text" }))).toBeNull();
  });
});
