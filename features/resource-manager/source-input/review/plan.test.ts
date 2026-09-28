import type { SourceManifest, SourceManifestEntry, SourceRef, SourceSet } from "@ai-matrx/agents/sources";
import { createSourceRef, createSourceSet } from "@ai-matrx/agents/sources";
import { estimateTokens } from "@/lib/tokens/estimate";
import { planSourceReview, renderedPartChars } from "./plan";

const DOC = "11111111-1111-4111-8111-111111111111";
const NOTE = "22222222-2222-4222-8222-222222222222";

function pdfEntry(pages: number, charsPerPage: number): SourceManifestEntry {
  const segments = Array.from({ length: pages }, (_, i) => ({
    id: `${DOC}:${i + 1}`,
    label: `Page ${i + 1}`,
    page: i + 1,
    chars: charsPerPage,
  }));
  return {
    ref: createSourceRef("processed_document", DOC),
    label: "Handbook.pdf",
    resource_type: "processed_document",
    state: "ready",
    forms: [
      { form: "clean", label: "Clean text", chars: pages * charsPerPage, available: true },
      { form: "raw", label: "Raw extracted text", chars: pages * charsPerPage + 500, available: true },
    ],
    default_form: "clean",
    segments,
  };
}

const noteEntry: SourceManifestEntry = {
  ref: createSourceRef("note", NOTE),
  label: "My note",
  resource_type: "note",
  state: "ready",
  forms: [{ form: "content", label: "Content", chars: 4_000, available: true }],
  default_form: "content",
};

function manifest(entries: SourceManifestEntry[]): SourceManifest {
  return {
    __kind: "source_manifest",
    sources: entries,
    total_chars: 0,
    estimated_tokens: 0,
    model_context_tokens: null,
  };
}

function plan(entries: SourceManifestEntry[], refs: SourceRef[], window: number | null = 1_000_000) {
  const base: SourceSet = createSourceSet(entries.map((e) => e.ref));
  return planSourceReview({
    manifest: manifest(entries),
    refs,
    base,
    modelWindowTokens: window,
    fallbackWindowTokens: 128_000,
  });
}

/** What the server's `_render` would produce for these parts. */
function rendered(parts: Array<{ id: string; page?: number; chars: number }>): number {
  return parts.reduce((n, p) => n + renderedPartChars(p, p.chars), 0) + 2 * (parts.length - 1);
}

describe("planSourceReview — mirrors the server's resolve rules", () => {
  it("counts grounding headers, so the number equals the resolved text length", () => {
    const pdf = pdfEntry(3, 1_000);
    const p = plan([pdf], [pdf.ref]);
    expect(p.entries[0]!.sentChars).toBe(rendered(pdf.segments!));
    expect(p.entries[0]!.exact).toBe(true);
    // "### Chunk <uuid>:1 (page 1)\n" is 49 chars; three parts + two blank lines.
    expect(p.sentChars).toBe(3_000 + 3 * (`### Chunk ${DOC}:1 (page 1)`.length + 1) + 4);
  });

  it("picked parts replace the whole form, in the Source's order", () => {
    const pdf = pdfEntry(10, 1_000);
    const ref = createSourceRef("processed_document", DOC, {
      include_segments: [`${DOC}:7`, `${DOC}:2`],
    });
    const p = plan([pdf], [ref]);
    expect(p.entries[0]!.partsSent).toBe(2);
    expect(p.entries[0]!.sentChars).toBe(rendered([pdf.segments![1]!, pdf.segments![6]!]));
    expect(p.sourceSet.sources[0]!.include_segments).toEqual([`${DOC}:7`, `${DOC}:2`]);
  });

  it("a size limit keeps whole parts until the next would overflow (server _cap)", () => {
    const pdf = pdfEntry(10, 1_000);
    const ref = createSourceRef("processed_document", DOC, { max_chars: 2_500 });
    const p = plan([pdf], [ref]);
    expect(p.entries[0]!.partsSent).toBe(2);
    expect(p.entries[0]!.capped).toBe(true);
    expect(p.sourceSet.sources[0]!.max_chars).toBe(2_500);
  });

  it("a lone first part bigger than the limit is cut, not dropped", () => {
    const pdf = pdfEntry(2, 5_000);
    const ref = createSourceRef("processed_document", DOC, { max_chars: 1_200 });
    const p = plan([pdf], [ref]);
    expect(p.entries[0]!.partsSent).toBe(1);
    expect(p.entries[0]!.sentChars).toBe(renderedPartChars(pdf.segments![0]!, 1_200));
  });

  it("'let the AI look it up' sends nothing up front and stays in the set", () => {
    const pdf = pdfEntry(3, 1_000);
    const ref = createSourceRef("processed_document", DOC, { delivery: "context" });
    const p = plan([pdf, noteEntry], [ref, noteEntry.ref]);
    expect(p.entries[0]!.status).toBe("on_demand");
    expect(p.sentChars).toBe(4_000);
    expect(p.sourceSet.sources.map((s) => s.delivery)).toEqual(["context", undefined]);
  });

  it("names and REMOVES what does not fit, keeping later Sources that still fit", () => {
    const pdf = pdfEntry(100, 3_000); // ~300k chars
    const window = estimateTokens(10_000); // room for the note only
    const p = plan([pdf, noteEntry], [pdf.ref, noteEntry.ref], window);
    expect(p.verdict).toBe("too_much");
    expect(p.leftOut.map((e) => e.entry.label)).toEqual(["Handbook.pdf"]);
    expect(p.sourceSet.sources.map((s) => s.resource_id)).toEqual([NOTE]);
    expect(p.sentChars).toBe(4_000);
  });

  it("an unknown model is judged against the labelled default", () => {
    const p = plan([noteEntry], [noteEntry.ref], null);
    expect(p.windowIsFallback).toBe(true);
    expect(p.windowTokens).toBe(128_000);
    expect(p.verdict).toBe("fine");
  });

  it("'Getting heavy' from 70% of the window", () => {
    const window = Math.floor(estimateTokens(4_000) / 0.75);
    const p = plan([noteEntry], [noteEntry.ref], window);
    expect(p.verdict).toBe("heavy");
  });

  it("an unusable Source contributes nothing but is kept for the host to show", () => {
    const gone: SourceManifestEntry = { ...noteEntry, state: "unavailable", forms: [] };
    const p = plan([gone], [gone.ref]);
    expect(p.entries[0]!.status).toBe("unusable");
    expect(p.sentChars).toBe(0);
    expect(p.sourceSet.sources).toHaveLength(1);
  });
});
