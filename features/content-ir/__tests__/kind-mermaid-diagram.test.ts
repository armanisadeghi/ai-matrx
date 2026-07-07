/**
 * mermaid_diagram kind — the fleet package's three legs:
 *
 *   1. STRUCTURAL — the converter-emitted schemas (the exact generation path
 *      behind migrations/kind_mermaid_diagram_full.sql) accept the migration's
 *      example payloads through the canonical gate (`validateStructuralLeg`,
 *      never a parallel validator) and reject a code-less payload.
 *   2. BRIDGE — `toLegacyServerData` derives the exact `serverData` shape
 *      MermaidBlock consumes (`MermaidBlockData`: `source` + optional
 *      `title`), complete-only, memoized, and declines wrong/partial/empty
 *      envelopes.
 *   3. SURFACE — the `mermaid_legacy_text` strategy converges a real fence
 *      body (both host framings + the ```mmd alias) to the canonical value.
 *
 * The fence-finalize host hook does not exist yet (XML only today) — these
 * tests prove the ready halves; end-to-end fence convergence lands with the
 * central integration pass.
 */

import type { MermaidBlockData } from "@/types/python-generated/stream-events";
import type { CanonicalBlockIR } from "../core/ir-types";
import { envelopeFromCompleteValue } from "../core/normalize";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import {
  kindSchemaToStorage,
  storageToKindSchema,
} from "../registry/kind-storage-transform";
import {
  runKindDualGate,
  validateStructuralLeg,
} from "../registry/kind-dual-gate";
import {
  MERMAID_DIAGRAM_KIND_DEFINITION,
  MERMAID_DIAGRAM_KIND_SCHEMA,
  mermaidMarkdownFromValue,
  mermaidServerDataFromEnvelope,
} from "../kinds/mermaid-diagram";
import { mermaidLegacyTextToKindValue } from "../surfaces/mermaid-legacy-text";

const resolve = (kind: string) =>
  kind === "mermaid_diagram" ? MERMAID_DIAGRAM_KIND_SCHEMA : undefined;

/** The migration's canonical kind_example payload, verbatim. */
const CANONICAL_EXAMPLE = {
  __kind: "mermaid_diagram",
  title: "Order Fulfillment",
  code: "flowchart TD\n  A[Order placed] --> B{In stock?}\n  B -- Yes --> C[Pack and ship]\n  B -- No --> D[Backorder]\n  C --> E[Delivered]\n  D --> E",
};

/** The migration's second kind_example payload, verbatim. */
const SEQUENCE_EXAMPLE = {
  __kind: "mermaid_diagram",
  title: "Login Handshake",
  code: "sequenceDiagram\n  autonumber\n  participant U as User\n  participant A as App\n  participant S as Auth Server\n  U->>A: Enter credentials\n  A->>S: POST /login\n  S-->>A: 200 + session token\n  A-->>U: Signed in",
};

describe("mermaid_diagram — converter-emitted schemas (structural leg)", () => {
  const jsonSchema = kindSchemaToJsonSchema("mermaid_diagram", resolve, {
    strict: true,
    injectKind: false,
  });
  const blockSchema = kindSchemaToJsonSchema("mermaid_diagram", resolve, {
    strict: true,
    injectKind: true,
  });

  it("exports flat schemas with no child kinds", () => {
    expect(jsonSchema).not.toBeNull();
    expect(blockSchema).not.toBeNull();
    if (!jsonSchema || !blockSchema) throw new Error("unreachable");
    expect(jsonSchema.unresolved).toEqual([]);
    expect(jsonSchema.schema).toEqual({
      type: "object",
      properties: { code: { type: "string" }, title: { type: "string" } },
      required: ["code"],
      additionalProperties: false,
    });
    // Provider block schema: __kind const-pinned and required.
    const block = blockSchema.schema as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(block.required).toEqual(["__kind", "code"]);
    expect(block.properties?.__kind).toMatchObject({
      const: "mermaid_diagram",
    });
  });

  it("storage transform round-trips (data array ↔ KindSchema, zero edges)", () => {
    const storage = kindSchemaToStorage(MERMAID_DIAGRAM_KIND_SCHEMA);
    expect(storage.data).toEqual([
      { name: "code", required: true, type: "string" },
      { name: "title", type: "string" },
    ]);
    expect(storage.edges).toEqual([]);
    expect(storageToKindSchema("mermaid_diagram", storage)).toEqual(
      MERMAID_DIAGRAM_KIND_SCHEMA,
    );
  });

  it("both migration examples pass the canonical structural leg", () => {
    if (!jsonSchema) throw new Error("unreachable");
    for (const sample of [CANONICAL_EXAMPLE, SEQUENCE_EXAMPLE]) {
      const result = validateStructuralLeg(sample, jsonSchema.schema);
      expect(result).toEqual({ ok: true });
    }
  });

  it("a code-less payload fails the structural leg", () => {
    if (!jsonSchema) throw new Error("unreachable");
    const result = validateStructuralLeg(
      { __kind: "mermaid_diagram", title: "No source" },
      jsonSchema.schema,
    );
    expect(result.ok).toBe(false);
  });

  it("the full dual gate passes (structural + render legs)", () => {
    if (!jsonSchema) throw new Error("unreachable");
    const result = runKindDualGate({
      kind: "mermaid_diagram",
      sample: CANONICAL_EXAMPLE,
      emittedJsonSchema: jsonSchema.schema,
      definition: MERMAID_DIAGRAM_KIND_DEFINITION,
    });
    expect(result.structural.ok).toBe(true);
    expect(result.render.ok).toBe(true);
    expect(result.isActive).toBe(true);
  });
});

describe("mermaid_diagram — MermaidBlock bridge (toLegacyServerData)", () => {
  it("derives the exact MermaidBlockData shape the component consumes", () => {
    const envelope = envelopeFromCompleteValue(
      CANONICAL_EXAMPLE,
      "mermaid_diagram",
    );
    const serverData = mermaidServerDataFromEnvelope(envelope);
    expect(serverData).toBeDefined();
    if (!serverData) throw new Error("unreachable");

    // Compile-time acceptance by MermaidBlock's serverData prop type +
    // runtime field mapping (kind `code` → component `source`).
    const asBlockData: MermaidBlockData = serverData as MermaidBlockData;
    expect(asBlockData.source).toBe(CANONICAL_EXAMPLE.code);
    expect(asBlockData.title).toBe("Order Fulfillment");
    // No stray discriminator in serverData.
    expect("__kind" in serverData).toBe(false);
  });

  it("omits title when absent (the component extracts frontmatter itself)", () => {
    const envelope = envelopeFromCompleteValue(
      { __kind: "mermaid_diagram", code: "pie\n  \"A\" : 60\n  \"B\" : 40" },
      "mermaid_diagram",
    );
    const serverData = mermaidServerDataFromEnvelope(envelope);
    expect(serverData).toBeDefined();
    expect(serverData && "title" in serverData).toBe(false);
  });

  it("is memoized per envelope (reference-stable serverData)", () => {
    const envelope = envelopeFromCompleteValue(
      SEQUENCE_EXAMPLE,
      "mermaid_diagram",
    );
    expect(mermaidServerDataFromEnvelope(envelope)).toBe(
      mermaidServerDataFromEnvelope(envelope),
    );
  });

  it("declines wrong kinds, streaming envelopes, and empty code", () => {
    const otherKind = envelopeFromCompleteValue(
      { __kind: "diagram_spec", title: "t", nodes: [] },
      "diagram_spec",
    );
    expect(mermaidServerDataFromEnvelope(otherKind)).toBeUndefined();

    const complete = envelopeFromCompleteValue(
      CANONICAL_EXAMPLE,
      "mermaid_diagram",
    );
    const streaming: CanonicalBlockIR = {
      ...complete,
      root: { ...complete.root, status: "streaming" },
    };
    expect(mermaidServerDataFromEnvelope(streaming)).toBeUndefined();

    const empty = envelopeFromCompleteValue(
      { __kind: "mermaid_diagram", code: "   " },
      "mermaid_diagram",
    );
    expect(mermaidServerDataFromEnvelope(empty)).toBeUndefined();
  });
});

describe("mermaid_legacy_text — fence body → canonical value", () => {
  const BODY = [
    "---",
    "title: Deploy Pipeline",
    "---",
    "flowchart LR",
    "  A[Commit] --> B[Build]",
    "  B --> C{Tests pass?}",
    "  C -- Yes --> D[Deploy]",
    '  C -- No --> E["Fix (rework)"]',
  ].join("\n");

  it("converts a real fence body and reuses the existing title extractor", () => {
    const value = mermaidLegacyTextToKindValue(BODY);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");
    expect(value.__kind).toBe("mermaid_diagram");
    expect(value.code).toBe(BODY); // verbatim — frontmatter stays in the source
    expect(value.title).toBe("Deploy Pipeline");
  });

  it("accepts both host framings and the mmd alias — identical values", () => {
    const innerOnly = mermaidLegacyTextToKindValue(BODY);
    const framed = mermaidLegacyTextToKindValue(
      "```mermaid\n" + BODY + "\n```",
    );
    const mmdFramed = mermaidLegacyTextToKindValue("```mmd\n" + BODY + "\n```");
    expect(framed).toEqual(innerOnly);
    expect(mmdFramed).toEqual(innerOnly);
  });

  it("emits no title when the source has no frontmatter", () => {
    const value = mermaidLegacyTextToKindValue("graph TD\n  A --> B");
    expect(value).toEqual({
      __kind: "mermaid_diagram",
      code: "graph TD\n  A --> B",
    });
  });

  it("returns null for an empty region (loud fail-open at the caller)", () => {
    expect(mermaidLegacyTextToKindValue("```mermaid\n\n```")).toBeNull();
    expect(mermaidLegacyTextToKindValue("   \n  ")).toBeNull();
  });

  it("strategy output feeds the bridge — fence and __kind JSON converge", () => {
    const value = mermaidLegacyTextToKindValue(BODY);
    if (!value) throw new Error("unreachable");
    const serverData = mermaidServerDataFromEnvelope(
      envelopeFromCompleteValue(value, "mermaid_diagram"),
    );
    expect(serverData).toMatchObject({
      source: BODY,
      title: "Deploy Pipeline",
    });
  });
});

describe("mermaid_diagram — toMarkdown facet", () => {
  it("renders a heading + ```mermaid fence and preserves unknown keys", () => {
    const markdown = mermaidMarkdownFromValue({
      ...CANONICAL_EXAMPLE,
      layoutHint: "compact",
    });
    expect(markdown).toContain("# Order Fulfillment");
    expect(markdown).toContain("```mermaid\n" + CANONICAL_EXAMPLE.code + "\n```");
    // Zero-loss law: unknown keys land under Additional details.
    expect(markdown).toContain("Additional details");
    expect(markdown).toContain("layoutHint");
  });
});
