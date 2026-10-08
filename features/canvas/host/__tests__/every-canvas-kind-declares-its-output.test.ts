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
  it("covers every artifact type (37 on 2026-10-08)", () => {
    expect(ARTIFACT_CANVAS_KINDS).toHaveLength(Object.keys(ARTIFACT_OUTPUT).length);
    expect(ARTIFACT_CANVAS_KINDS).toHaveLength(37);
  });

  it.each(ALL.map((kind) => [kind.id, kind] as const))("%s declares its surface (and frame/native: print + capture)", (_id, kind) => {
    expect(canvasKindOutputProblems(kind)).toEqual([]);
  });

  it("the HTML page is a frame kind that prints itself", () => {
    const html = ALL.find((kind) => kind.id === "html");
    expect(html?.surface).toBe("frame");
    expect(typeof html?.print).toBe("function");
  });

  it("every frame kind's print and capture is a handler or an honest reason (P2 WP3 census)", () => {
    const kind = (id: string) => ALL.find((k) => k.id === id);
    expect(typeof kind("html")?.capture).toBe("function");
    expect(kind("map")?.surface).toBe("frame");
    expect(typeof kind("map")?.print).toBe("function");
    expect(typeof kind("map")?.capture).toBe("function");
    expect(kind("iframe")?.surface).toBe("frame");
    expect(String(kind("iframe")?.print)).toMatch(/embedded site/);
    expect(String(kind("iframe")?.capture)).toMatch(/embedded site/);
    // In-app DOM, not frames: the host's DOM print and capture apply.
    expect(kind("react")?.surface).toBe("dom");
    expect(kind("code_preview")?.surface).toBe("dom");
    expect(kind("sandbox")?.surface).toBe("dom");
    expect(typeof kind("sandbox")?.print).toBe("function");
    // Live bodies offer the real thing; until then the kind says why not.
    for (const id of ["cloud_browser", "udt_document"]) {
      expect(kind(id)?.surface).toBe("frame");
      expect(typeof kind(id)?.print).toBe("string");
      expect(typeof kind(id)?.capture).toBe("string");
    }
    // Nothing still says "not available yet".
    for (const k of ALL) {
      expect(k.print).not.toBe("not available yet");
      expect(k.capture).not.toBe("not available yet");
    }
  });

  it("an iframe block prints as its link inside a message; an inline page says so", async () => {
    const printer = getBlockPrinter("iframe");
    const card = await printer?.toPrintHtml?.("https://example.com/a?b=<c>", { type: "iframe", raw: "https://example.com/a?b=<c>" });
    expect(card && "html" in card ? card.html : "").toContain("https://example.com/a?b=%3Cc%3E");
    const inline = await printer?.toPrintHtml?.("<p>hi</p>", { type: "iframe", raw: "<p>hi</p>" });
    expect(inline && "notice" in inline).toBe(true);
  });

  it("a map that is not a map prints the reason, never blank", async () => {
    const out = await getBlockPrinter("map")?.toPrintHtml?.("not json", { type: "map", raw: "not json" });
    expect(out && "notice" in out ? out.notice : "").toMatch(/Map not printed/);
  });

  it.each(["html", "quiz", "quiz_set", "flashcards", "flashcard_set", "math_problem", "iframe", "map"])(
    "%s has a message-print adapter in the one registry",
    (key) => {
      expect(getBlockPrinter(key)?.toPrintHtml).toBeInstanceOf(Function);
    },
  );
});
