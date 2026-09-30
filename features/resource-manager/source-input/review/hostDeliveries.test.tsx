/**
 * V2-F #1 (verifier shots 06/26): on Create deck a Source set to "Let the AI look
 * it up" went out with `delivery: "context"`, the flashcards generator got no
 * text, and the page said "None of the Sources had any text to make cards from"
 * — false. A host declares the deliveries it can use; the review offers only
 * those and never returns a Source set to one the host cannot use.
 *
 * V2-F #5 (shot 23): the review labelled a YouTube video and pasted text
 * "Document", and named a PDF by its document title — the host's own kind and
 * display name win when it passes them.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { SourceManifestEntry } from "@ai-matrx/agents/sources";
import { createSourceRef } from "@ai-matrx/agents/sources";
import { SourceReviewRow } from "./SourceReviewRow";
import { fitDelivery, type SourcePlanEntry } from "@ai-matrx/agents/sources/runtime";

const DOC = "11111111-1111-4111-8111-111111111111";

const entry: SourceManifestEntry = {
  ref: createSourceRef("processed_document", DOC),
  label: "What would happen if you didn't sleep? - Claudia Aguirre",
  resource_type: "processed_document",
  state: "ready",
  forms: [{ form: "clean", label: "Clean text", chars: 3_700, available: true }],
  default_form: "clean",
};

function planEntry(delivery?: "context"): SourcePlanEntry {
  const ref = createSourceRef("processed_document", DOC, delivery ? { delivery } : {});
  return {
    index: 0,
    ref,
    entry,
    status: delivery ? "on_demand" : "included",
    formLabel: "Clean text",
    formChars: 3_700,
    chars: 3_700,
    sentChars: delivery ? 0 : 3_700,
    sentTokens: delivery ? 0 : 1_200,
    exact: false,
    partsSent: null,
    partsTotal: null,
    capped: false,
  };
}

const render = (props: Partial<Parameters<typeof SourceReviewRow>[0]> = {}) =>
  renderToStaticMarkup(
    <SourceReviewRow
      plan={planEntry()}
      defaultOpen
      onChange={() => {}}
      onFormChange={() => {}}
      onRemove={() => {}}
      {...props}
    />,
  );

describe("a host that needs the text up front", () => {
  it("is never offered 'Let the AI look it up'", () => {
    const html = render({ deliveries: ["direct"] });
    expect(html).not.toContain("Let the AI look it up");
    // The one way it works is still said, in words.
    expect(html).toContain("Include the text");
  });

  it("still offers both where the host can use both", () => {
    const html = render();
    expect(html).toContain("Let the AI look it up");
    expect(html).toContain("Include the text");
  });

  it("switches a Source already set to look it up back to include the text", () => {
    const fit = fitDelivery(createSourceRef("file", DOC, { delivery: "context" }), ["direct"]);
    expect(fit?.to).toBe("direct");
    expect(fit?.patch.delivery).toBeUndefined();
    expect(fitDelivery(createSourceRef("file", DOC), ["direct"])).toBeNull();
    expect(fitDelivery(createSourceRef("file", DOC, { delivery: "context" }), undefined)).toBeNull();
  });
});

describe("the review names each Source the way the host does", () => {
  it("says the real kind and the display name, never 'Document'", () => {
    const html = render({ describe: { kind: "Transcript", name: "Sleep video" } });
    expect(html).toContain("Transcript");
    expect(html).toContain("Sleep video");
    expect(html).not.toContain(">Document");
  });
});
