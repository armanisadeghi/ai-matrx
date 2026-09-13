// features/workflow-runtime/__tests__/showcase-schema-leak.test.tsx
//
// THE SCHEMA-LEAK GUARD on the finished-run showcase.
//
// Wall W61 (Expert Book Challenge, 2026-09-12). On the showcase of run
// cef6ae07 — a page written for a parent — the structured floor printed
// "Physician note: None", "Physician first: false", and a heading derived
// from the payload key `watsons_words`. Three schema artefacts on a screen
// for someone who has never seen a schema.
//
// The fixture is the REAL emitted payload for that run's `deliver` node, read
// out of `workflow.run` in the live database — no hand-shaped object.
//
// RED BEFORE GREEN: with the pre-fix floor, assertions 1, 2 and 4 fail
// (`None` and `false` are in the markup, and nothing declares the omissions).

import React from "react";
import { renderToString } from "react-dom/server";

import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { StructuredDocumentPresentationProvider } from "@/features/tool-call-visualization/result-fields/document-presentation";
import { fieldLabelsFromJsonSchema } from "@/features/tool-call-visualization/result-fields/schema-labels";

import records from "./fixtures/masterwork-run-records.json";

const RUN_ID = "cef6ae07-4562-4dbd-a8e4-403309cace08";

type Emission = { node_id: string; payload: Record<string, unknown> };

const emissions = (records as { emissions: Record<string, Emission[]> })
  .emissions[RUN_ID];
const deliver = emissions.find((e) => e.node_id === "deliver")!.payload;
const regimen = deliver.the_regimen as Record<string, unknown>;

describe("the showcase never prints schema fields at the parent", () => {
  // The payload really does carry these two — that is the whole point.
  it("the fixture still carries the null and the false flag", () => {
    expect(regimen.physician_note).toBeNull();
    expect(regimen.physician_first).toBe(false);
    expect(typeof deliver.watsons_words).toBe("string");
  });

  it("omits a null optional field instead of printing None", () => {
    const html = renderToString(
      <StructuredValueView value={deliver} density="full" footer={false} />,
    );
    expect(html).not.toMatch(/Physician note/);
    expect(html).not.toMatch(/>None</);
  });

  it("never prints a boolean flag as the token false", () => {
    const html = renderToString(
      <StructuredValueView value={deliver} density="full" footer={false} />,
    );
    expect(html).not.toMatch(/>false</);
    expect(html).not.toMatch(/Physician first/);
  });

  it("renders a TRUE flag as a badge that reads Yes, never the token true", () => {
    const html = renderToString(
      <StructuredValueView
        value={{ physician_first: true }}
        density="full"
        footer={false}
      />,
    );
    expect(html).not.toMatch(/>true</);
    expect(html).toMatch(/Yes/);
  });

  it("says how many fields did not apply — nothing disappears silently", () => {
    const html = renderToString(
      <StructuredValueView value={regimen} density="full" footer={false} />,
    );
    // `physician_note` (null) and `physician_first` (false) are the two.
    expect(html).toMatch(/2 fields did not apply/);
  });

  it("keeps every optional field when the policy says show", () => {
    const html = renderToString(
      <StructuredDocumentPresentationProvider optionalFields="show">
        <StructuredValueView value={regimen} density="full" footer={false} />
      </StructuredDocumentPresentationProvider>,
    );
    expect(html).toMatch(/Physician note/);
  });

  it("never leaks a raw snake_case key as a heading", () => {
    const html = renderToString(
      <StructuredValueView value={deliver} density="full" footer={false} />,
    );
    expect(html).not.toMatch(/>watsons_words</);
    expect(html).toMatch(/Watsons words/);
  });

  it("prefers the schema's own title over anything derived from the key", () => {
    const schema = {
      type: "object",
      properties: {
        watsons_words: {
          type: "string",
          title: "Watson's words",
          description: "The letter, in his own voice.",
        },
      },
    };
    const labels = fieldLabelsFromJsonSchema(schema);
    expect(labels.watsons_words).toEqual({
      label: "Watson's words",
      description: "The letter, in his own voice.",
    });

    const html = renderToString(
      <StructuredDocumentPresentationProvider labels={labels}>
        <StructuredValueView value={deliver} density="full" footer={false} />
      </StructuredDocumentPresentationProvider>,
    );
    expect(html).toMatch(/Watson&#x27;s words/);
    expect(html).not.toMatch(/Watsons words/);
  });
});
