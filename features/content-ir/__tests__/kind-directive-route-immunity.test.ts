/**
 * Adversarial finding A-8 (kind-directives): a `matrx` block must be IMMUNE to
 * the content-IR kind route, even when a resolution exists for its slug.
 *
 * The bomb this pins: a directive's `__kind` is a reserved-namespace slug that
 * is by design never a `kind_definition` row. If the block carries an `__ir`
 * envelope and `"matrx"` is not route-owned, the moment anyone seeds a
 * directive-class registry row (the plan's own "8 rows for discoverability"
 * clause) `applyIrKindRoute` re-types the block away from `MatrxEnvelopeBlock`
 * and the raw-JSON break the merge closed RE-OPENS. Today's misses are luck,
 * not protection — this test makes it protection.
 */
import { MATRX_OWNED_BLOCK_TYPES } from "../host/route-env";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

const DIRECTIVE = {
  __kind: "directive_v1_reference_note",
  items: [{ id: "3f2c8a44-9c1d-4c9e-9a51-0d5b7f6e2a10" }],
};

describe("kind-directive route immunity (A-8)", () => {
  it("`matrx` is a route-OWNED block type — the kind route may never re-type it", () => {
    expect(MATRX_OWNED_BLOCK_TYPES).toContain("matrx");
  });

  it("a bare directive in prose is typed matrx and carries NO __ir envelope", () => {
    const blocks = splitContentIntoBlocksV2(
      "Here you go:\n\n" + JSON.stringify(DIRECTIVE),
    );
    const matrx = blocks.find((b) => b.type === "matrx");
    expect(matrx).toBeDefined();
    expect(
      (matrx?.metadata as Record<string, unknown> | undefined)?.__ir,
    ).toBeUndefined();
  });

  it("a ```json-fenced directive is typed matrx and carries NO __ir envelope", () => {
    const blocks = splitContentIntoBlocksV2(
      "```json\n" + JSON.stringify(DIRECTIVE, null, 2) + "\n```",
    );
    const matrx = blocks.find((b) => b.type === "matrx");
    expect(matrx).toBeDefined();
    expect(
      (matrx?.metadata as Record<string, unknown> | undefined)?.__ir,
    ).toBeUndefined();
  });

  it("a NON-directive kind block still carries its __ir envelope (the suppression is scoped)", () => {
    const blocks = splitContentIntoBlocksV2(
      "```json\n" +
        JSON.stringify({ __kind: "flashcard_set", cards: [] }, null, 2) +
        "\n```",
    );
    const withIr = blocks.find(
      (b) => (b.metadata as Record<string, unknown> | undefined)?.__ir,
    );
    expect(withIr).toBeDefined();
  });
});
