/**
 * Rendered-output standard (PLAN ruling 6, P2 work package 5): every canvas
 * kind that is not an artifact type — the feature kinds, the tool kinds and
 * saved items — records an explicit, reasoned decision about what the pane
 * menu's Print / Save as PDF / Copy image offers (`kindOutputDecisions.ts`),
 * and its declaration matches that decision. Nothing is inherited silently:
 * a new kind without a table row fails here.
 */
import type { AnyCanvasKind } from "@ai-matrx/canvas/react";
import { canvasKindOutputProblems } from "@ai-matrx/canvas/react";
import { SAVED_ITEMS_CANVAS_KIND } from "../artifactKinds";
import { FEATURE_CANVAS_KINDS } from "../featureCanvasKinds";
import { TOOL_CANVAS_KINDS } from "../toolKinds";
import { KIND_OUTPUT_DECISIONS, type OutputMode } from "../kindOutputDecisions";

const DECIDED: readonly AnyCanvasKind[] = [SAVED_ITEMS_CANVAS_KIND, ...FEATURE_CANVAS_KINDS, ...TOOL_CANVAS_KINDS];

const declared = (value: unknown): OutputMode => (typeof value === "function" ? "handler" : value === false ? "none" : "dom");

describe("every non-artifact canvas kind decides its output", () => {
  it("covers 19 feature kinds, 18 tool kinds and saved items (2026-10-08)", () => {
    expect(FEATURE_CANVAS_KINDS).toHaveLength(19);
    expect(TOOL_CANVAS_KINDS).toHaveLength(18);
    expect(DECIDED).toHaveLength(38);
  });

  it.each(DECIDED.map((kind) => [kind.id, kind] as const))("%s: explicit decision, one-line reason, declaration matches", (_id, kind) => {
    const decision = KIND_OUTPUT_DECISIONS[kind.id];
    if (!decision) throw new Error(`"${kind.id}" has no row in kindOutputDecisions.ts — decide its Print and Copy image`);
    expect(decision.why.trim().length).toBeGreaterThan(10);
    expect(decision.why.length).toBeLessThanOrEqual(140);
    expect(decision.why).not.toContain("\n");
    expect(declared(kind.print)).toBe(decision.print);
    expect(declared(kind.capture)).toBe(decision.capture);
    expect(canvasKindOutputProblems(kind)).toEqual([]);
  });

  it("no decision names a kind that is not registered", () => {
    const ids = new Set(DECIDED.map((kind) => kind.id));
    expect(Object.keys(KIND_OUTPUT_DECISIONS).filter((id) => !ids.has(id))).toEqual([]);
  });
});
