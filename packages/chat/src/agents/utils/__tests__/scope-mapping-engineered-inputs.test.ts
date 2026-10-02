/**
 * THE ENGINEERED-INPUTS BOUNDARY (W-31, PB-03 S3/S4, 2026-10-01).
 *
 * On /notes a right-click shortcut mapping only `selection → passage` and an
 * org binding mapping only `current_note_title → note_title` both delivered
 * the WHOLE note (`note_bundle`, `content`, …) to the agent, so a fact only
 * the body holds (PP-88213) came back through doors that never mapped it.
 * Built from the real /notes scope builder so a new page value can't slip
 * past the test by name.
 */
import { buildNotesEditorContextData } from "@/features/notes/agent-context/buildNotesEditorContextData";
import { withBaselineScope } from "@/features/surfaces/utils/baseline-scope";
import { mapScopeToInstanceWithSurface } from "../scope-mapping";
import { alwaysOnSurfaceKeys } from "@/features/surfaces/utils/always-on-context";

const PARAGRAPH = "Teodoro Vashti will meet the crew at the loading dock.";
const BODY = [
  "# Move 4473",
  PARAGRAPH,
  "Parking permit on file: PP-88213 (body only, never mapped).",
].join("\n");
const selectionStart = BODY.indexOf(PARAGRAPH);

const notesScope = withBaselineScope(
  buildNotesEditorContextData({
    noteId: "22222222-2222-4222-8222-222222222222",
    content: BODY,
    selectionStart,
    selectionEnd: selectionStart + PARAGRAPH.length,
    editorMode: "plain",
    noteRecord: { label: "Move 4473 — Harlan Ridge walkthrough", folder_name: "Moves", tags: [] },
  }),
);

const variables = [
  { name: "passage", defaultValue: "" },
  { name: "note_title", defaultValue: "" },
];

function everythingSent(result: ReturnType<typeof mapScopeToInstanceWithSurface>) {
  return JSON.stringify({ v: result.variableValues, c: result.contextEntries });
}

describe("a shortcut or binding run gets only what it mapped", () => {
  it("the page really does hold the secret (fixture sanity)", () => {
    expect(String(notesScope.note_bundle)).toContain("PP-88213");
    expect(String(notesScope.content)).toContain("PP-88213");
  });

  it("shortcut door: selection → passage carries the selection and nothing else", () => {
    const result = mapScopeToInstanceWithSurface(
      notesScope,
      { selection: "passage" },
      {},
      variables,
      [],
      null,
    );
    expect(result.variableValues).toEqual({ passage: PARAGRAPH });
    expect(result.contextEntries).toEqual([]);
    expect(everythingSent(result)).not.toContain("PP-88213");
  });

  it("binding door: current_note_title → note_title carries the title and nothing else", () => {
    const result = mapScopeToInstanceWithSurface(
      notesScope,
      null,
      { note_title: { mapType: "surface_value", target: "current_note_title" } },
      variables,
      [],
    );
    expect(result.variableValues).toEqual({
      note_title: "Move 4473 — Harlan Ridge walkthrough",
    });
    expect(result.contextEntries).toEqual([]);
    expect(everythingSent(result)).not.toContain("PP-88213");
  });

  it("always-on values and the agent's own named slots still arrive", () => {
    const result = mapScopeToInstanceWithSurface(
      notesScope,
      { selection: "passage" },
      {},
      variables,
      [{ key: "current_note_id", label: "Note" }],
      null,
      { alwaysOnKeys: ["current_note_folder"] },
    );
    expect(result.contextEntries.map((e) => e.key).sort()).toEqual([
      "current_note_folder",
      "current_note_id",
    ]);
    expect(everythingSent(result)).not.toContain("PP-88213");
  });

  it("a run with no mapping at all (a chat following the page) still sees the page", () => {
    const result = mapScopeToInstanceWithSurface(notesScope, null, {}, variables, [], null);
    const keys = result.contextEntries.map((e) => e.key);
    expect(keys).toEqual(expect.arrayContaining(["note_bundle", "content", "selection"]));
  });

  it("a mapping this call cannot see (per-launch, stamped on the conversation) still closes the page", () => {
    const result = mapScopeToInstanceWithSurface(notesScope, null, {}, variables, [], null, {
      engineered: true,
    });
    expect(result.contextEntries).toEqual([]);
    expect(everythingSent(result)).not.toContain("PP-88213");
  });

  it("a mapping to an empty target sends nothing under an empty key", () => {
    const result = mapScopeToInstanceWithSurface(notesScope, { content: "" }, {}, variables, [], null);
    expect(result.contextEntries.find((e) => e.key === "")).toBeUndefined();
    expect(everythingSent(result)).not.toContain("PP-88213");
  });
});

describe("always-on values", () => {
  it("a PDF surface's document handle reaches a mapped run", () => {
    const pdfScope = withBaselineScope({
      file_id: "11111111-1111-4111-8111-111111111111",
      processed_document_id: "22222222-2222-4222-8222-222222222222",
      full_document_text: "page text",
    });
    const result = mapScopeToInstanceWithSurface(
      pdfScope,
      { selection: "passage" },
      {},
      variables,
      [],
      null,
      { alwaysOnKeys: alwaysOnSurfaceKeys("matrx-user/pdf-extractor", pdfScope) },
    );
    expect(result.contextEntries.map((e) => e.key)).toContain("file_id");
    expect(result.contextEntries.map((e) => e.key)).not.toContain("full_document_text");
  });
});
