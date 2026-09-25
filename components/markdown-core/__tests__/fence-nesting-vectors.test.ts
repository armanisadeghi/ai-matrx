/**
 * FORCING FUNCTION: the shared nested-fence vectors still describe what the
 * TypeScript rule and splitter do. The same JSON (byte-identical twins in
 * aidream) is run by matrx-ai's test_fence_nesting_vectors.py, so the
 * frontend and the server split a ```markdown fence identically. If this
 * turns red, the TS behavior changed: regenerate with
 * `npx tsx scripts/generate-fence-nesting-vectors.ts` (writes all twins) and
 * port the change to Python in the same session.
 * Spec: common-docs/systems/content-ir-system/NESTED-FENCES.md.
 */
import vectors from "./fence-nesting-vectors.json";
import { classifyInnerFenceLine } from "../fence-nesting";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";

describe("shared nested-fence vectors (TS side)", () => {
  it.each(vectors.classify.map((c) => [c.line, c] as const))(
    "classifies %j",
    (_line, c) => {
      expect(classifyInnerFenceLine(c.line, c.openTicks, c.nests, c.depth)).toBe(
        c.expected,
      );
    },
  );

  it.each(vectors.documents.map((d) => [d.name, d] as const))(
    "splits: %s",
    (_name, d) => {
      const blocks = splitContentIntoBlocksV2(d.input)
        .filter((b) => b.content.trim())
        .map((b) => ({
          type: b.type,
          language: b.language ?? null,
          content: b.content.trim(),
        }));
      expect(blocks).toEqual(d.blocks);
    },
  );
});
