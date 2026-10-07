/**
 * The dangling-`component_key` gate has TWO halves, and this pins the code
 * half: `extractDispatchKeysFromTexts` must read the REAL dispatch tables — BOTH
 * halves (the engine's in @ai-matrx/rich-content, this app's domain half),
 * resolved through SHAPE_SOURCE_FILES, the one map every reader uses.
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
import {
  DISPATCH_SOURCE_KEYS,
  SHAPE_SOURCE_FILES,
  extractDispatchKeysFromTexts,
  type DispatchSourceText,
} from "../registry/shape-doctor-extract";

const COMPUTED = {
  DB_KIND_COMPONENT_KEY,
  GENERIC_STRUCTURED_COMPONENT_KEY,
};

describe("extractDispatchKeysFromTexts", () => {
  const sources: DispatchSourceText[] = DISPATCH_SOURCE_KEYS.map((key) => {
    const file = SHAPE_SOURCE_FILES[key].path;
    return { file, text: readFileSync(resolve(process.cwd(), file), "utf8") };
  });
  const domain = sources.find((s) => s.file === SHAPE_SOURCE_FILES.domainBlockDispatch.path)!;
  const engine = sources.find((s) => s.file === SHAPE_SOURCE_FILES.blockDispatch.path)!;
  const withDomain = (text: string): DispatchSourceText[] => [{ ...domain, text }, engine];

  it("reads every dispatch table off both live halves", () => {
    const { keys, failures } = extractDispatchKeysFromTexts(sources, COMPUTED);
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
    const { keys } = extractDispatchKeysFromTexts(sources, COMPUTED);
    expect(keys).toContain(DB_KIND_COMPONENT_KEY);
    expect(keys).toContain(GENERIC_STRUCTURED_COMPONENT_KEY);
  });

  it("FAILS (never silently shrinks) when a computed key cannot be resolved", () => {
    const { keys, failures } = extractDispatchKeysFromTexts(sources, {});
    expect(failures.map((f) => f.literal)).toEqual(
      expect.arrayContaining([
        "SHAPE_BLOCK_DISPATCH[GENERIC_STRUCTURED_COMPONENT_KEY]",
        "SHAPE_BLOCK_DISPATCH[DB_KIND_COMPONENT_KEY]",
      ]),
    );
    expect(keys).not.toContain(DB_KIND_COMPONENT_KEY);
  });

  it("FAILS when a dispatch table is renamed or vanishes in EITHER half", () => {
    const renamed = domain.text.replace(
      "const SHAPE_BLOCK_DISPATCH = {",
      "const RENAMED_BLOCK_DISPATCH = {",
    );
    expect(renamed).not.toBe(domain.text);
    const { failures } = extractDispatchKeysFromTexts(withDomain(renamed), COMPUTED);
    expect(failures).toEqual(
      expect.arrayContaining([{ literal: "SHAPE_BLOCK_DISPATCH", file: domain.file }]),
    );
  });

  it("reads the app's domain half — a domain-only key comes from it alone", () => {
    // `pr_play_menu` is registered only by the app's half; dropping that half
    // must drop the key (proves the union is real, not the engine's alone).
    const both = extractDispatchKeysFromTexts(sources, COMPUTED);
    const engineOnly = extractDispatchKeysFromTexts([engine], COMPUTED);
    expect(both.keys).toContain("pr_play_menu");
    expect(engineOnly.keys).not.toContain("pr_play_menu");
  });
});
