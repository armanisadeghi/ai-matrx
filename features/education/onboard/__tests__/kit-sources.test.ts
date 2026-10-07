// The study kit reads its material from the ONE Source payload: the picked
// Sources go through `POST /sources/resolve` and these pure steps turn the
// answer into the kit's text and its file anchor (the kit's identity).

import type { ResolvedSource, ResolvedSourceSet } from "@ai-matrx/agents/sources";
import { createSourceRef } from "@ai-matrx/agents/sources";
import type { SourceCardModel } from "@ai-matrx/agents/sources/runtime";
import { kitFileAnchor, kitMaterialFromSources, pickedFileAnchor } from "../kitSources";

function source(over: Partial<ResolvedSource> & { type?: string; id?: string }): ResolvedSource {
  const { type = "processed_document", id = "doc-1", ...rest } = over;
  return {
    ref: createSourceRef(type, id),
    label: "Photosynthesis.pdf",
    form_used: "clean",
    text: "### Chunk c1 (page 1)\nLight energy becomes chemical energy in the chloroplast.",
    segments: [{ id: "c1", page: 1, chars: 60 }],
    state: "ready",
    truncated: false,
    notes: [],
    ...rest,
  };
}

function set(sources: ResolvedSource[]): ResolvedSourceSet {
  return { __kind: "resolved_source_set", sources, dropped: [], total_chars: 0 };
}

describe("kitMaterialFromSources", () => {
  it("one Source: its own text and its name without the extension", () => {
    const m = kitMaterialFromSources(set([source({})]));
    expect(m.text).toContain("chloroplast");
    expect(m.title).toBe("Photosynthesis");
    expect(m.sourceCount).toBe(1);
    expect(m.pages).toBe(1);
  });

  it("several Sources: every text, joined in order, named after the first", () => {
    const m = kitMaterialFromSources(
      set([
        source({}),
        source({ id: "doc-2", label: "Calvin cycle - Wikipedia", text: "### Chunk c9\nThe Calvin cycle fixes carbon." }),
      ]),
    );
    expect(m.text.indexOf("chloroplast")).toBeLessThan(m.text.indexOf("fixes carbon"));
    expect(m.title).toBe("Photosynthesis");
    expect(m.sourceCount).toBe(2);
  });

  it("a Source the server cut short marks the material truncated", () => {
    expect(kitMaterialFromSources(set([source({ truncated: true })])).truncated).toBe(true);
  });

  it("skips Sources with no text and refuses when none has any", () => {
    expect(kitMaterialFromSources(set([source({ text: "  " }), source({ id: "d2" })])).sourceCount).toBe(1);
    expect(() => kitMaterialFromSources(set([source({ text: "" })]))).toThrow(/text/);
  });

  it("says plainly when every Source was set to be looked up instead of read", () => {
    const lookedUp = source({ text: "" });
    lookedUp.ref = createSourceRef("processed_document", "doc-1", { delivery: "context" });
    expect(() => kitMaterialFromSources(set([lookedUp]))).toThrow(/Include the text/);
  });
});

describe("kitFileAnchor", () => {
  it("one stored file: the kit anchors on that file (and its Source)", () => {
    expect(
      kitFileAnchor(set([source({ type: "file", id: "file-1", file_id: "file-1", processed_document_id: "doc-1" })])),
    ).toEqual({ fileId: "file-1", processedDocumentId: "doc-1" });
  });

  it("one Source read from a file: anchors on the file behind it", () => {
    expect(kitFileAnchor(set([source({ file_id: "file-7" })]))).toEqual({
      fileId: "file-7",
      processedDocumentId: "doc-1",
    });
  });

  it("no file behind it, or several Sources: no anchor (the text is kept as one)", () => {
    expect(kitFileAnchor(set([source({})]))).toBeNull();
    expect(
      kitFileAnchor(set([source({ file_id: "f1" }), source({ id: "d2", file_id: "f2" })])),
    ).toBeNull();
  });
});

describe("pickedFileAnchor", () => {
  function card(over: Partial<SourceCardModel["draft"]>, status: SourceCardModel["status"] = "ready"): SourceCardModel {
    return {
      id: Math.random().toString(36),
      status,
      error: null,
      manifest: null,
      draft: { kind: "files", label: "Notes.pdf", ref: createSourceRef("file", "file-1"), ...over },
    } as SourceCardModel;
  }

  it("one picked file: its id", () => {
    expect(pickedFileAnchor([card({})])).toBe("file-1");
  });

  it("a picked Source with a stored file behind it: that file", () => {
    expect(
      pickedFileAnchor([card({ ref: createSourceRef("processed_document", "doc-1"), fileId: "file-9" })]),
    ).toBe("file-9");
  });

  it("nothing, several, or one still landing: no anchor yet", () => {
    expect(pickedFileAnchor([])).toBeNull();
    expect(pickedFileAnchor([card({}), card({ ref: createSourceRef("file", "file-2") })])).toBeNull();
    expect(pickedFileAnchor([card({}, "pending")])).toBeNull();
  });
});
