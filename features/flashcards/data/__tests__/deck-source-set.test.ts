/**
 * V2-F #2 (verify-2): a deck built from "Pages 65–68" of a PDF reopened in "Add
 * more cards" holding the whole 363k-character PDF — the lineage edge names the
 * file, not the parts — and the top-up produced an off-topic card. The deck now
 * records the SourceSet it was made from on its own metadata, and the top-up
 * starts from it: same parts, same version, same size limit, same names.
 */
jest.mock("../fcService", () => ({ fcService: {} }));

import { createSourceRef, createSourceSet } from "@ai-matrx/agents/sources";
import {
  deckDraftsFromMetadata,
  deckSourceSetPatch,
  sourceNamesOf,
  topUpSeed,
} from "../deckSourceSet";
import type { SourceDraft } from "@ai-matrx/agents/sources/runtime";

const PDF = "e7c4d481-6b4d-430a-9c5e-330b464e6c8f";
const NOTE = "0d0b92dc-a02d-42cc-af40-5bd9a476e137";
const PAGES = [`${PDF}:65`, `${PDF}:66`, `${PDF}:67`, `${PDF}:68`];

const pdfDraft: SourceDraft = {
  kind: "files",
  label: "official-ap-biology.pdf",
  ref: createSourceRef("file", PDF, { include_segments: PAGES, representation: "clean", max_chars: 40_000 }),
  fileId: PDF,
};
const noteDraft: SourceDraft = { kind: "notes", label: "Class notes", ref: createSourceRef("note", NOTE) };

function madeDeckMetadata() {
  const sourceSet = createSourceSet([pdfDraft.ref!, noteDraft.ref!]);
  return { generation: "surface_save", ...deckSourceSetPatch(sourceSet, sourceNamesOf([{ draft: pdfDraft }, { draft: noteDraft }])) };
}

describe("Add more cards starts from exactly what the deck was made from", () => {
  it("keeps the parts, the version and the size limit", () => {
    const seed = topUpSeed(deckDraftsFromMetadata(madeDeckMetadata()), [
      // What the lineage edges alone can say: the whole file.
      { kind: "files", label: "official-ap-biology.pdf", ref: createSourceRef("file", PDF), fileId: PDF },
    ]);
    expect(seed.wholeSourcesOnly).toBe(false);
    const pdf = seed.drafts.find((d) => d.ref?.resource_id === PDF)!;
    expect(pdf.ref?.include_segments).toEqual(PAGES);
    expect(pdf.ref?.representation).toBe("clean");
    expect(pdf.ref?.max_chars).toBe(40_000);
    expect(pdf.label).toBe("official-ap-biology.pdf");
    expect(pdf.fileId).toBe(PDF);
    expect(seed.drafts.map((d) => d.ref?.resource_id)).toEqual([PDF, NOTE]);
  });

  it("falls back to the lineage — and says so — for a deck made before Sources were recorded", () => {
    const fromLineage: SourceDraft[] = [
      { kind: "files", label: "old.pdf", ref: createSourceRef("file", PDF), fileId: PDF },
    ];
    const seed = topUpSeed(deckDraftsFromMetadata({ generation: "surface_save" }), fromLineage);
    expect(seed.drafts).toBe(fromLineage);
    expect(seed.wholeSourcesOnly).toBe(true);
  });

  it("ignores junk in the metadata instead of inventing Sources", () => {
    expect(deckDraftsFromMetadata(null)).toBeNull();
    expect(deckDraftsFromMetadata({ source_set: { sources: [{ nope: 1 }] } })).toBeNull();
  });
});
