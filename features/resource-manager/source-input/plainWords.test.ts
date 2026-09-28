import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCE_STAGE_LABEL } from "@/features/sources/sourceRows";

/**
 * V1-A (verifier round 1, handed over by the flashcards lane): the Source input's
 * "Your sources" rows read "Searchable · entities", and the Files picker's filter
 * read "PDF Extractor (processed)" in 10px text. A non-technical expert reads plain
 * words at a readable size — fixed at the label's one home, not per call site.
 */
const JARGON = /\bentit(y|ies)\b|\bextractor\b|\(processed\)/i;

it("every Source stage label is plain words", () => {
  for (const [stage, label] of Object.entries(SOURCE_STAGE_LABEL)) {
    expect({ stage, jargon: JARGON.test(label) }).toEqual({ stage, jargon: false });
  }
});

it("the Files picker's filter bar says plain words at a readable size", () => {
  const picker = readFileSync(
    join(__dirname, "../resource-picker/FilesResourcePicker.tsx"),
    "utf8",
  );
  const bar = picker.slice(picker.indexOf('id="cloud-files-filter"'), picker.indexOf('id="cloud-files-sort"') + 400);
  const options = [...bar.matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)].map((m) => m[1]!);
  expect(options.length).toBeGreaterThan(5);
  for (const label of options) expect({ label, jargon: JARGON.test(label) }).toEqual({ label, jargon: false });
  expect(bar).not.toMatch(/text-\[(9|10|11)px\]/);
});
