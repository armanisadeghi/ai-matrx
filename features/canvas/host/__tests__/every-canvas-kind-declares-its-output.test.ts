/**
 * The rendered-output standard's guard (PLAN ruling 6): every kind this app
 * registers declares its surface ("dom" | "frame" | "native"), and every
 * frame/native kind declares how it prints and captures (a handler or an
 * honest reason) — a DOM copy of an iframe or a canvas prints blank.
 * Artifact types that print inside a message have their adapter in the one
 * block-printer registry.
 */
import { canvasKindOutputProblems, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { getBlockPrinter } from "@ai-matrx/print/core";
import { ARTIFACT_CANVAS_KINDS, SAVED_ITEMS_CANVAS_KIND } from "../artifactKinds";
import { FEATURE_CANVAS_KINDS } from "../featureCanvasKinds";
import { TOOL_CANVAS_KINDS } from "../toolKinds";
import { ARTIFACT_OUTPUT } from "@/features/canvas/artifact-types/artifact-output";
import "@/features/canvas/artifact-types/artifact-printers";

const ALL: readonly AnyCanvasKind[] = [...ARTIFACT_CANVAS_KINDS, SAVED_ITEMS_CANVAS_KIND, ...FEATURE_CANVAS_KINDS, ...TOOL_CANVAS_KINDS];

describe("every registered canvas kind meets the rendered-output standard", () => {
  it("covers the census (37 artifact + saved items + feature + tool kinds)", () => {
    expect(ARTIFACT_CANVAS_KINDS).toHaveLength(Object.keys(ARTIFACT_OUTPUT).length);
    expect(ALL.length).toBeGreaterThanOrEqual(76);
  });

  it.each(ALL.map((kind) => [kind.id, kind] as const))("%s declares its surface (and frame/native: print + capture)", (_id, kind) => {
    expect(canvasKindOutputProblems(kind)).toEqual([]);
  });

  it("the HTML page is a frame kind that prints itself", () => {
    const html = ALL.find((kind) => kind.id === "html");
    expect(html?.surface).toBe("frame");
    expect(typeof html?.print).toBe("function");
  });

  it.each(["html", "quiz", "quiz_set", "flashcards", "flashcard_set", "math_problem"])(
    "%s has a message-print adapter in the one registry",
    (key) => {
      expect(getBlockPrinter(key)?.toPrintHtml).toBeInstanceOf(Function);
    },
  );
});
