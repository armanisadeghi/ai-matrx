/**
 * kind-never-raw S5: "Open in canvas" on an agent app opens a kind answer AS
 * ITS KIND (the artifact registry's canvas type, the same detection
 * planMaterialization uses); a kindless answer keeps the HTML canvas.
 */
import { responseCanvasTarget } from "./response-canvas-target";

const SET = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
};

describe("responseCanvasTarget", () => {
  it("a whole-answer kind opens as its canvas type, titled by the instance", () => {
    const t = responseCanvasTarget(JSON.stringify(SET), "Study app");
    expect(t.mode).toBe("kind");
    if (t.mode !== "kind") return;
    expect(t.canvasType).toBe("flashcards");
    expect(t.title).toBe("Cell biology");
    expect(t.structured).toEqual(SET);
  });

  it("a fenced kind inside prose opens as its kind too", () => {
    const t = responseCanvasTarget("Here:\n\n```json\n" + JSON.stringify(SET) + "\n```", "Study app");
    expect(t.mode).toBe("kind");
  });

  it("a kindless answer keeps the HTML canvas", () => {
    expect(responseCanvasTarget("<h1>Hi</h1>", "App")).toEqual({ mode: "html", html: "<h1>Hi</h1>" });
  });

  it("a kind with no canvas artifact type opens as readable markdown, never JSON", () => {
    const t = responseCanvasTarget(JSON.stringify({ __kind: "no_canvas_kind_x", title: "Plan", step: "One" }), "App");
    expect(t.mode).toBe("markdown");
    if (t.mode !== "markdown") return;
    expect(t.markdown).not.toContain("__kind");
    expect(t.markdown).toContain("Plan");
  });
});
