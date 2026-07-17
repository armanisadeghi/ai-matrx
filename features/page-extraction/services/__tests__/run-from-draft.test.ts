import { validateDraft } from "@/features/page-extraction/services/run-from-draft";
import {
  emptyDraft,
  type ChunkingConfigDraft,
} from "@/features/page-extraction/redux/pageExtractionSlice";

function draftWithPdfTarget(target: string): ChunkingConfigDraft {
  return {
    ...emptyDraft(),
    agentId: "agent-1",
    variableMapping: { pdf_page: target },
    kind: "extraction",
  };
}

describe("validateDraft PDF-document wiring", () => {
  it("rejects legacy pdf_page mappings that target a non-Document variable", () => {
    expect(
      validateDraft(draftWithPdfTarget("text"), [
        { name: "text", customComponent: { type: "textarea" } },
      ]),
    ).toContain(
      "Chunk PDF document must be mapped to an agent variable with Document input type.",
    );
  });

  it("accepts pdf_page only when its target is a Document variable", () => {
    expect(
      validateDraft(draftWithPdfTarget("pdf"), [
        { name: "pdf", customComponent: { type: "document" } },
      ]),
    ).toEqual([]);
  });

  it("rejects an empty legacy pdf_page target", () => {
    expect(validateDraft(draftWithPdfTarget(""), [])).toContain(
      "Load the agent's variables before wiring Chunk PDF document.",
    );
  });
});
