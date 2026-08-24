/**
 * The dangling-`component_key` gate has TWO halves, and this pins the code
 * half: `extractDispatchKeysFromText` must read the REAL block-dispatch.tsx.
 *
 * If the extraction silently returned a short/empty key set, every
 * `kind_component` row would look dangling (noise) or — worse, if it grew a
 * default — nothing would ever look dangling and the gate would be a decoy.
 * So this test asserts against the live file, not a fixture.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DB_KIND_COMPONENT_KEY,
  GENERIC_STRUCTURED_COMPONENT_KEY,
} from "@ai-matrx/content-ir-react";
import { extractDispatchKeysFromText } from "../registry/shape-doctor-extract";

const DISPATCH_PATH = resolve(
  process.cwd(),
  "components/mardown-display/chat-markdown/block-registry/block-dispatch.tsx",
);
const COMPUTED = {
  DB_KIND_COMPONENT_KEY,
  GENERIC_STRUCTURED_COMPONENT_KEY,
};

describe("extractDispatchKeysFromText", () => {
  const text = readFileSync(DISPATCH_PATH, "utf8");

  it("reads every dispatch table off the live file", () => {
    const { keys, failures } = extractDispatchKeysFromText(text, COMPUTED);
    expect(failures).toEqual([]);
    // One key per registered block type across the four tables — a floor, not
    // an exact count, so registering a new type never fails this test.
    expect(keys.length).toBeGreaterThan(100);
    // One representative per table.
    expect(keys).toEqual(
      expect.arrayContaining(["thinking", "text", "flashcards", "unknown_data_event"]),
    );
    // Entry BODIES must not leak in as keys.
    expect(keys).not.toContain("return");
    expect(keys).not.toContain("const");
  });

  it("resolves computed keys through the caller's constants", () => {
    const { keys } = extractDispatchKeysFromText(text, COMPUTED);
    expect(keys).toContain(DB_KIND_COMPONENT_KEY);
    expect(keys).toContain(GENERIC_STRUCTURED_COMPONENT_KEY);
  });

  it("FAILS (never silently shrinks) when a computed key cannot be resolved", () => {
    const { keys, failures } = extractDispatchKeysFromText(text, {});
    expect(failures.map((f) => f.literal)).toEqual(
      expect.arrayContaining([
        "SHAPE_BLOCK_DISPATCH[GENERIC_STRUCTURED_COMPONENT_KEY]",
        "SHAPE_BLOCK_DISPATCH[DB_KIND_COMPONENT_KEY]",
      ]),
    );
    expect(keys).not.toContain(DB_KIND_COMPONENT_KEY);
  });

  it("FAILS when a dispatch table is renamed or vanishes", () => {
    const renamed = text.replace(
      "const SHAPE_BLOCK_DISPATCH = {",
      "const RENAMED_BLOCK_DISPATCH = {",
    );
    const { failures } = extractDispatchKeysFromText(renamed, COMPUTED);
    expect(failures.map((f) => f.literal)).toContain("SHAPE_BLOCK_DISPATCH");
  });
});
