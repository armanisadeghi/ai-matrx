/**
 * Guard: `Source` is the ITEM'S source — never the canvas envelope.
 *
 * The live defect this pins (independent review, production 2026-09-14, docked
 * canvas on /chat): clicking `Source` on the SANDBOX pane printed the redux
 * item verbatim to the user — `{"type":"sandbox","data":{"sandboxRowId":…},
 * "metadata":{"conversationId":…,"sourceMessageId":"sandbox:…"}}`. A live pty
 * pane has no source at all, and internal pointers are not user-facing content.
 *
 * Proven failing before passing (re-run these mutations to re-prove):
 *   a. `canvasTypeHasSource` → `return true` for every type  → the sandbox /
 *      cloud-browser / document cases go RED (the tab is offered again).
 *   b. `resolveCanvasSource` → `JSON.stringify(content)` (the shipped
 *      behaviour) → the envelope-leak cases go RED.
 */

import {
  canvasTypeHasSource,
  resolveCanvasSource,
  resolveCanvasSourceFromData,
} from "../canvasSource";
import type { CanvasContent } from "@/features/canvas/redux/canvasSlice";

describe("a live pane is never offered a Source view", () => {
  it.each([
    ["sandbox"],
    ["cloud_browser"],
    ["working_document"],
    ["scratchpad"],
    ["code_preview"],
    ["code_edit_error"],
  ])("%s has no source of its own", (type) => {
    expect(canvasTypeHasSource(type)).toBe(false);
  });

  it.each([["image"], ["iframe"]])(
    "%s is a passthrough surface, not authored text",
    (type) => {
      expect(canvasTypeHasSource(type)).toBe(false);
    },
  );

  it("artifact types keep their source view", () => {
    for (const type of ["mermaid", "code", "html", "quiz", "research"]) {
      expect(canvasTypeHasSource(type)).toBe(true);
    }
  });
});

describe("the canvas envelope never reaches the user", () => {
  const sandboxItem: CanvasContent = {
    type: "sandbox",
    data: {
      sandboxRowId: "9aa2f6a6-7a27-43fb-ad0e-56e4e6222c78",
      fallbackName: "sbx-cd6d53863995",
    },
    metadata: {
      title: "Sandbox",
      conversationId: "bb458c1e-3222-4c16-9d29-77c48b186a02",
      sourceMessageId: "sandbox:bb458c1e:9aa2f6a6",
    },
  };

  it("the sandbox pane resolves NO source (so no tab, and nothing to dump)", () => {
    expect(resolveCanvasSource(sandboxItem)).toBeNull();
  });

  it("a document pane resolves no source either — its editor owns its text", () => {
    expect(
      resolveCanvasSource({
        type: "working_document",
        data: { conversationId: "c1", kind: "working" },
        metadata: { title: "Documents" },
      }),
    ).toBeNull();
  });
});

describe("Source shows the item's real source", () => {
  it("a markdown/text artifact prints its own text", () => {
    const source = resolveCanvasSourceFromData(
      "# Canvas Hijack Check\n\n- one\n- two",
      "research",
    );
    expect(source).toEqual({
      text: "# Canvas Hijack Check\n\n- one\n- two",
      language: "markdown",
    });
    // The envelope keys are nowhere near it.
    expect(source?.text).not.toContain("sourceMessageId");
  });

  it("a code artifact prints the code in its own language", () => {
    const source = resolveCanvasSourceFromData(
      { code: "print('hi')", language: "python" },
      "code",
    );
    expect(source).toEqual({ text: "print('hi')", language: "python" });
  });

  it("markup artifacts print as markup, not as markdown", () => {
    expect(resolveCanvasSourceFromData("<h1>Hi</h1>", "html")).toEqual({
      text: "<h1>Hi</h1>",
      language: "html",
    });
    expect(
      resolveCanvasSourceFromData("graph TD; a-->b", "mermaid"),
    ).toEqual({ text: "graph TD; a-->b", language: "mermaid" });
  });

  it("a structured artifact prints its markdown export, not raw JSON keys", () => {
    const source = resolveCanvasSourceFromData(
      { __kind: "quiz_set", title: "Boxes", questions: [] },
      "quiz",
    );
    expect(source?.language).toBe("markdown");
    expect((source?.text ?? "").length).toBeGreaterThan(0);
  });

  it("an empty payload is honestly nothing, never an empty envelope", () => {
    expect(resolveCanvasSourceFromData("", "code")).toBeNull();
    expect(resolveCanvasSourceFromData(null, "research")).toBeNull();
  });
});
