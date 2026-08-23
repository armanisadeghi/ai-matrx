/**
 * THE `__kind` MARKER LAW — the frontend half.
 *
 * Arman, 2026-08-21: *"the system itself is storing the data without this key
 * and wrapper, which causes problems during rendering… we need to annihilate
 * any part of the code that is either stripping away that key."*
 *
 * `__kind` is PART OF THE DATA (KINDS_EVERYWHERE_PLAN §4.2). These pin the two
 * places this repo could lose it again — the instance WRITE path, and the
 * legacy render bridge — plus the one lawful egress that still drops it.
 */

import { KIND_KEY } from "@ai-matrx/content-ir";
import { envelopeFromCompleteValue } from "@ai-matrx/content-ir";
import { withRootKindMarker } from "../studio/instance-service";
import { makeCompleteEnvelopeBridge } from "../kinds/legacy-bridge-utils";
import { schemaProposalServerDataFromEnvelope } from "../kinds/schema-proposal";
import { withRootKind } from "@ai-matrx/content-ir";

describe("the instance write path stamps the marker (storage)", () => {
  it("adds `__kind` as the FIRST key when the value has none", () => {
    const out = withRootKindMarker({ title: "A", n: 1 }, "wine_tasting");
    expect(Object.keys(out)[0]).toBe(KIND_KEY);
    expect(out).toEqual({ __kind: "wine_tasting", title: "A", n: 1 });
  });

  it("CORRECTS a wrong marker rather than trusting the caller", () => {
    const out = withRootKindMarker({ __kind: "not_this", title: "A" }, "wine_tasting");
    expect(out.__kind).toBe("wine_tasting");
    expect(Object.keys(out)[0]).toBe(KIND_KEY);
  });

  it("leaves NESTED markers exactly as authored", () => {
    const out = withRootKindMarker(
      { cards: [{ __kind: "flashcard", front: "q" }] },
      "flashcard_set",
    );
    expect((out.cards as Array<{ __kind: string }>)[0].__kind).toBe("flashcard");
  });

  it("is idempotent — re-saving a stored row changes nothing", () => {
    const once = withRootKindMarker({ title: "A" }, "k");
    expect(withRootKindMarker(once, "k")).toEqual(once);
  });
});

describe("the legacy render bridge passes the marker through", () => {
  const bridge = makeCompleteEnvelopeBridge<Record<string, unknown>>(
    "demo_kind",
    (value) => value,
  );

  it("hands `build` the value verbatim, markers at every depth", () => {
    const value = {
      __kind: "demo_kind",
      title: "T",
      items: [{ __kind: "demo_item", label: "one" }],
    };
    const out = bridge(envelopeFromCompleteValue(value, "demo_kind"));
    expect(out).toEqual(value);
    expect(out?.__kind).toBe("demo_kind");
    expect((out?.items as Array<{ __kind: string }>)[0].__kind).toBe("demo_item");
  });
});

describe("the ONE lawful egress still drops the root marker", () => {
  it("schema_proposal hands out a clean JSON Schema document", () => {
    // Applied verbatim to `agx_agent.output_schema` — a schema document, not a
    // kind instance. Its OWN root marker must not be written into it...
    const proposal = {
      __kind: "schema_proposal",
      name: "flashcards_output",
      schema: {
        type: "object",
        // ...while a `__kind` PROPERTY *inside* the schema is legitimate user
        // data (render-block-aware output schemas declare the discriminator).
        properties: { __kind: { const: "flashcard_set" }, cards: { type: "array" } },
      },
    };
    const out = schemaProposalServerDataFromEnvelope(
      envelopeFromCompleteValue(proposal, "schema_proposal"),
    ) as Record<string, unknown>;

    expect(out.__kind).toBeUndefined();
    expect(out.name).toBe("flashcards_output");
    expect(
      (out.schema as { properties: Record<string, unknown> }).properties.__kind,
    ).toEqual({ const: "flashcard_set" });
  });
});

describe("the emit composer is now an identity for well-formed rows", () => {
  it("a stored example already carrying its marker round-trips unchanged", () => {
    const stored = { __kind: "demo_kind", title: "T" };
    expect(withRootKind("demo_kind", stored)).toEqual(stored);
  });

  it("still repairs a legacy/hand-typed value that lacks one", () => {
    expect(withRootKind("demo_kind", { title: "T" })).toEqual({
      __kind: "demo_kind",
      title: "T",
    });
  });
});
