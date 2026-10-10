// A card on the Map is a button inside React Flow. d3-zoom (the canvas's drag-to-pan) swallows the click that
// follows ANY pointer movement, so a card pressed with a 2px wobble never opened its table (measured in a
// real browser, lane DATA-HOME-2). The real-mouse proof is `tests/browser/data-home-map-card-click.mjs`
// (`node tests/browser/data-home-map-card-click.mjs member|admin`); this keeps the three settings it depends
// on from being deleted: the card opts out of pan and drag, and the canvas tolerates a small wobble.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "..", "TableMapCanvasImpl.tsx"), "utf8");

describe("the map card's click", () => {
  it("opts the card button out of the canvas's pan and drag", () => {
    const button = source.slice(source.indexOf("<button"), source.indexOf("data-table-map-card"));
    expect(button).toBeDefined();
    const className = source.match(/className="([^"]*rounded-lg border border-border[^"]*)"/)?.[1] ?? "";
    expect(className).toMatch(/\bnodrag\b/);
    expect(className).toMatch(/\bnopan\b/);
  });

  it("lets the pointer wobble a few pixels between press and release and still count it a click", () => {
    expect(source).toMatch(/paneClickDistance=\{[1-9]\d*\}/);
    expect(source).toMatch(/nodeClickDistance=\{[1-9]\d*\}/);
  });
});
