/**
 * Rendered-output standard ruling 1: the card / canvas tab mount never writes,
 * and the html-pages route reuses a page ONLY for the same canvas version.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("one page per canvas version", () => {
  it("HtmlInlinePreview publishes only from the person's own click", () => {
    const src = read("features/html-pages/components/HtmlInlinePreview.tsx");
    const calls = src.match(/HTMLPageService\.createPage\(/g) ?? [];
    expect(calls).toHaveLength(1);
    // the one call lives in the click handler, never in an effect
    const handler = src.slice(src.indexOf("const publishOnRequest"));
    expect(handler.indexOf("HTMLPageService.createPage(")).toBeGreaterThan(-1);
    const effects = src.split("useEffect(").slice(1).map((e) => e.slice(0, e.indexOf("}, [")));
    for (const body of effects) expect(body).not.toMatch(/createPage|publishHtmlCanvasVersion/);
  });

  it("pages go to the server's /cms/html-pages door — no Next.js proxy", () => {
    expect(existsSync(join(process.cwd(), "app/api/html-pages/route.ts"))).toBe(false);
    const src = read("features/html-pages/services/htmlPageService.js");
    expect(src).not.toMatch(/\/api\/html-pages/);
    expect(src).toMatch(/path: '\/cms\/html-pages'/);
  });

  it("a chat page version publishes through the server's one writer", () => {
    const src = read("features/html-pages/services/canvasVersionPage.ts");
    expect(src).toMatch(/path: "\/cms\/html-artifacts\/\{canvas_item_id\}\/publish"/);
    expect(src).not.toMatch(/HTMLPageService/);
  });

  it("the materializer publishes the canvas row it just saved", () => {
    const src = read("features/canvas/artifact-types/persistence/html-adapter.ts");
    expect(src).toMatch(/publishHtmlCanvasVersion\(info\.artifactId\)/);
  });
});
