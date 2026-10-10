/**
 * R5 + R6 (kind-never-raw round 6). Deliberate raw views and a person's own
 * editors carry `data-kind-source="explicit"` (rulings b, and the inspector
 * rule), and a READ-ONLY note never shows its raw source.
 *
 * Source-level on purpose: each element is the one raw container its surface
 * draws, and the sentinel (`kind-leak-sentinel.test.ts`) proves what the
 * attribute does at runtime.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

/** [file, the raw element's anchor text, how many marked elements the file must hold] */
const MARKED: Array<[string, RegExp, number]> = [
  // R5 — the context compare is an inspector of the bytes an agent is fed.
  ["../aidream/apps/shared/chat/src/agents/components/context-preview/ContextCompareView.tsx", /data-kind-source="explicit"/g, 5],
  ["features/artifacts/components/CmsArtifactDetail.tsx", /<pre data-kind-source="explicit"[^>]*>\s*\{JSON\.stringify\(artifact\.metadata/g, 1],
  ["app/(core)/cms/[siteId]/collections/[collectionId]/page.tsx", /<pre data-kind-source="explicit"[^>]*>\s*\{JSON\.stringify\(openItem\.data/g, 1],
  // R6 — editors of a person's own stored text.
  ["features/tasks/components/TaskDetails.tsx", /data-kind-source="explicit"[\s\S]{0,200}<TaskDescriptionEditor/g, 1],
  ["features/tasks/components/TaskDetailsPanel.tsx", /<div data-kind-source="explicit">\s*<TaskDescriptionEditor/g, 1],
  ["features/notes/components/NoteEditorCore.tsx", /<(?:Pro)?Textarea\s+ref=\{textareaRef\}\s+data-kind-source="explicit"/g, 2],
  ["features/notes/components/mobile/MobileNoteEditor.tsx", /<textarea\s+ref=\{textareaRef\}\s+data-kind-source="explicit"/g, 1],
  ["features/notes/components/FindMatchOverlay.tsx", /data-kind-source="explicit"/g, 1],
  // The agent builder's read view of an author's own prompt text (a kind schema written into a system prompt).
  ["features/agents/components/variables-management/HighlightedText.tsx", /<span data-kind-source="explicit" className="contents">/g, 1],
];

describe("raw views and editors are marked (R5, R6)", () => {
  it.each(MARKED)("%s", (file, pattern, count) => {
    expect(read(file).match(pattern)?.length ?? 0).toBeGreaterThanOrEqual(count);
  });
});

describe("a read-only note reads rendered, never raw (R6)", () => {
  it("desktop: plain is mapped to the rendered view for a reader", () => {
    expect(read("features/notes/components/NoteEditorCore.tsx")).toMatch(
      /readOnly && requestedEditorMode === "plain" \? "preview" : requestedEditorMode/,
    );
  });
  it("phone: plain is mapped to the rendered view for a reader, and no read-only textarea remains", () => {
    const source = read("features/notes/components/mobile/MobileNoteEditor.tsx");
    expect(source).toMatch(/readOnly && \(isRichEditorMode\(editorMode\) \|\| editorMode === "plain"\) \? "preview"/);
    expect(source).not.toMatch(/<textarea[^>]*\breadOnly\b/);
  });
});
