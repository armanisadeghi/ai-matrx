/**
 * A ```matrx fence must reach MatrxEnvelopeBlock — the second half of the break.
 *
 * Fixing detection was not enough. Since the merge a directive's body
 * legitimately declares `__kind`, and `recoverEmbeddedKindJsonBlocks` — whose
 * job is pulling a kind object out of prose that Markdown swallowed — saw the
 * fence body as an embedded kind, exploded the block, and handed back
 * `type: "code", language: "json"`. The `matrx` identity was lost between the
 * splitter and the renderer, and a properly-formed reference fence rendered as
 * a JSON code viewer. Caught in the browser on 2026-08-25, not by a test.
 *
 * So: a matrx fence is a CONTAINER (like an artifact), and a bare directive
 * object recovered from prose becomes a `matrx` block rather than an anonymous
 * kind — one pipeline, whichever way the directive arrived.
 */

import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

const REFERENCE = {
  __kind: "directive_v1_reference_note",
  items: [{ id: "00000000-0000-4000-8000-000000000001", label: "Kickoff" }],
};

function fenced(shell: unknown): string {
  return "```matrx\n" + JSON.stringify(shell, null, 2) + "\n```";
}

describe("a ```matrx fence keeps its identity", () => {
  it("stays ONE matrx block — never exploded into an anonymous kind JSON block", () => {
    const blocks = splitContentIntoBlocksV2(`Here:\n\n${fenced(REFERENCE)}`);
    expect(blocks.map((b) => b.type)).toEqual(["text", "matrx"]);
    expect(JSON.parse(blocks[1]!.content)).toEqual(REFERENCE);
  });

  it("keeps a STORED 4-key fence rendering as matrx too", () => {
    const blocks = splitContentIntoBlocksV2(
      fenced({ matrx_version: 1, kind: "reference", type: "note", items: [] }),
    );
    expect(blocks.map((b) => b.type)).toEqual(["matrx"]);
  });

  it("types a BARE directive object in prose as matrx, not as a generic kind", () => {
    // Recovered from prose rather than fenced. It must route through the
    // slug/class registry, not the generic structured floor — which would
    // report an unregistered kind for something the server has registered.
    const blocks = splitContentIntoBlocksV2(
      `Applying it now:\n\n${JSON.stringify(REFERENCE)}`,
    );
    expect(blocks.some((b) => b.type === "matrx")).toBe(true);
  });

  it("leaves an ORDINARY kind instance alone — the reserved prefix keeps the namespaces disjoint", () => {
    const blocks = splitContentIntoBlocksV2(
      `Cards:\n\n${JSON.stringify({ __kind: "flashcard_set", cards: [] })}`,
    );
    expect(blocks.some((b) => b.type === "matrx")).toBe(false);
  });
});
